package com.anonymous.androMolt.accessibility

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo

data class ActionOutcome(val success: Boolean, val message: String)

object AccessibilityController {

    private fun getService(): AndroMoltAccessibilityService? {
        return AndroMoltAccessibilityService.getInstance()
    }

    fun getUiSnapshot(): UiSnapshot? {
        val service = getService() ?: return null
        val root = service.rootInActiveWindow ?: return null
        return UiTreeBuilder.buildUiSnapshot(root)
    }

    fun clickByText(text: String): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")
        val node = service.findNodeByText(text, exact = false)
            ?: return ActionOutcome(false, "No element found with text: $text")
        val result = service.clickNode(node)
        return ActionOutcome(result, if (result) "Clicked '$text'" else "Click failed on '$text'")
    }

    /**
     * Click by text using a fresh snapshot to find the target node by bounds/text match.
     * This solves the timing issue where UI changes between snapshot capture and action execution.
     */
    fun clickByTextWithSnapshot(text: String, snapshot: UiSnapshot): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")

        // Strategy 1: Try standard text search first (for static elements)
        val node = service.findNodeByText(text, exact = false)
        if (node != null) {
            val result = service.clickNode(node)
            return ActionOutcome(result, if (result) "Clicked '$text'" else "Click failed on '$text'")
        }

        // Strategy 2: Find matching node in snapshot, then locate in current tree by bounds
        val matchingSnapshotNode = findMatchingNodeInSnapshot(text, snapshot)
        if (matchingSnapshotNode != null) {
            android.util.Log.d("AccessibilityController",
                "Found node in snapshot at index ${matchingSnapshotNode.index}, searching by bounds")

            // Try to find the same node in current tree using bounds
            val root = service.rootInActiveWindow
                ?: return ActionOutcome(false, "No active window")
            val actualNode = findNodeByBounds(root, matchingSnapshotNode)

            if (actualNode != null) {
                val result = service.clickNode(actualNode)
                return ActionOutcome(
                    result,
                    if (result) "Clicked '$text' via snapshot bounds match"
                    else "Click failed on '$text'"
                )
            }
        }

        return ActionOutcome(false, "No element found with text: $text")
    }

    private fun findMatchingNodeInSnapshot(text: String, snapshot: UiSnapshot): UiNode? {
        android.util.Log.d("AccessibilityController",
            "findMatchingNodeInSnapshot: Searching for '$text' in ${snapshot.nodes.size} nodes")

        // Try multiple matching strategies
        for (node in snapshot.nodes) {
            // Check BOTH text and contentDescription fields
            val nodeText = node.text ?: ""
            val nodeDesc = node.contentDescription ?: ""

            // Skip nodes with no text at all
            if (nodeText.isBlank() && nodeDesc.isBlank()) continue

            // Log what we're checking (helpful for debugging)
            if (nodeText.isNotBlank() || nodeDesc.isNotBlank()) {
                android.util.Log.v("AccessibilityController",
                    "  Checking node[${node.index}]: text='${nodeText.take(40)}' desc='${nodeDesc.take(40)}'")
            }

            // Try matching against BOTH fields using all strategies
            val fieldsToCheck = listOf(nodeText, nodeDesc).filter { it.isNotBlank() }

            for (fieldValue in fieldsToCheck) {
                // Strategy 1: Exact match
                if (fieldValue.equals(text, ignoreCase = true)) {
                    android.util.Log.d("AccessibilityController",
                        "Found exact match at node[${node.index}] in ${if (fieldValue == nodeText) "text" else "contentDescription"}")
                    return node
                }

                // Strategy 2: Field contains search text
                if (fieldValue.contains(text, ignoreCase = true)) {
                    android.util.Log.d("AccessibilityController",
                        "Found partial match (field contains search) at node[${node.index}]")
                    return node
                }

                // Strategy 3: Search text contains field text (for truncated titles)
                if (text.length > 10 && fieldValue.length > 5 &&
                    text.contains(fieldValue, ignoreCase = true)) {
                    android.util.Log.d("AccessibilityController",
                        "Found reverse match (search contains field) at node[${node.index}]")
                    return node
                }

                // Strategy 4: First 5 words match
                val searchWords = text.split(" ").take(5).joinToString(" ")
                if (searchWords.length > 5) {
                    if (fieldValue.contains(searchWords, ignoreCase = true) ||
                        searchWords.contains(fieldValue, ignoreCase = true)) {
                        android.util.Log.d("AccessibilityController",
                            "Found word match at node[${node.index}]")
                        return node
                    }
                }
            }
        }

        android.util.Log.w("AccessibilityController",
            "findMatchingNodeInSnapshot: NO MATCH FOUND in ${snapshot.nodes.size} nodes")
        return null
    }

    fun clickByContentDesc(desc: String): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")
        val root = service.rootInActiveWindow
            ?: return ActionOutcome(false, "No active window")
        val node = traverseForDesc(root, desc)
            ?: return ActionOutcome(false, "No element found with desc: $desc")
        val result = service.clickNode(node)
        return ActionOutcome(result, if (result) "Clicked desc='$desc'" else "Click failed on desc='$desc'")
    }

    fun clickByIndex(index: Int, snapshot: UiSnapshot): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")
        val targetNode = snapshot.nodes.getOrNull(index)
            ?: return ActionOutcome(false, "Invalid index: $index")

        // Try to find the actual node in current UI tree using bounds/text as identifier
        val root = service.rootInActiveWindow
            ?: return fallbackToCoordinateClick(service, targetNode, index)

        val actualNode = findNodeByBounds(root, targetNode)
            ?: return fallbackToCoordinateClick(service, targetNode, index)

        // Use node-based clicking (same as clickByText)
        val result = service.clickNode(actualNode)
        return ActionOutcome(
            result,
            if (result) "Clicked index [$index] via node.performAction()"
            else "Node click failed at index [$index]"
        )
    }

    private fun findNodeByBounds(root: AccessibilityNodeInfo, target: UiNode): AccessibilityNodeInfo? {
        // Match by bounds + text/contentDescription to find the same element
        val targetRect = target.bounds

        fun traverse(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
            val nodeRect = android.graphics.Rect()
            node.getBoundsInScreen(nodeRect)

            // Check if this is the target node (match bounds and text/desc)
            val boundsMatch = nodeRect == targetRect
            val textMatch = target.text?.isNotBlank() == true &&
                           (node.text?.toString()?.contains(target.text!!) == true ||
                            node.contentDescription?.toString()?.contains(target.contentDescription ?: "") == true)

            if (boundsMatch || (textMatch && nodeRect.intersect(targetRect))) {
                return node
            }

            // Traverse children
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { child ->
                    traverse(child)?.let { return it }
                }
            }
            return null
        }

        return traverse(root)
    }

    private fun fallbackToCoordinateClick(
        service: AndroMoltAccessibilityService,
        node: UiNode,
        index: Int
    ): ActionOutcome {
        // Fallback to old coordinate-based clicking
        val centerX = (node.bounds.left + node.bounds.right) / 2
        val centerY = (node.bounds.top + node.bounds.bottom) / 2
        val result = service.clickCoordinates(centerX, centerY)
        return ActionOutcome(
            result,
            if (result) "Clicked index [$index] at ($centerX, $centerY) [fallback]"
            else "Click failed at ($centerX, $centerY)"
        )
    }

    fun inputText(text: String): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")
        val root = service.rootInActiveWindow
            ?: return ActionOutcome(false, "No active window")

        // Find focused or first editable node
        val editNode = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?.takeIf { it.isEditable }
            ?: findEditableNode(root)
            ?: return ActionOutcome(false, "No editable field found")

        val result = service.inputText(editNode, text)
        return ActionOutcome(result, if (result) "Input text: '$text'" else "Failed to input text")
    }

    /**
     * Input text into a specific form field identified by its label or hint text.
     * Strategy: find a node whose hint/text matches the label, focus it, then type.
     * Falls back to inputText() if no matching field found.
     */
    fun inputTextIntoField(label: String, text: String): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")
        val root = service.rootInActiveWindow
            ?: return ActionOutcome(false, "No active window")

        // 1. Find an editable field whose hint or contentDescription matches the label
        val targetNode = findEditableByLabel(root, label)

        if (targetNode != null) {
            // Focus and type into the identified field
            targetNode.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
            Thread.sleep(150)
            val result = service.inputText(targetNode, text)
            return ActionOutcome(
                result,
                if (result) "Typed '$text' into field '$label'"
                else "Failed to type into field '$label'"
            )
        }

        // Fallback: click the nearest field to the label text, then type
        val labelNode = findNodeByTextOrDesc(root, label, caseSensitive = false)
        if (labelNode != null) {
            service.clickNode(labelNode)
            Thread.sleep(300)
            val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                ?.takeIf { it.isEditable }
                ?: findEditableNode(root)
            if (focused != null) {
                val result = service.inputText(focused, text)
                return ActionOutcome(
                    result,
                    if (result) "Typed '$text' after clicking label '$label'"
                    else "Failed to type after clicking label"
                )
            }
        }

        // Last fallback: just use inputText (focused node)
        android.util.Log.w("AccessibilityController", "inputTextIntoField: label '$label' not found, falling back")
        return inputText(text)
    }

    /**
     * Select an option from a dropdown/Spinner identified by its label.
     * Steps:
     *   1. Find the spinner element near the label text
     *   2. Click to open the dropdown list
     *   3. Wait for the popup to appear
     *   4. Click the option text
     */
    fun selectDropdownOption(dropdownLabel: String, optionText: String): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")
        val root = service.rootInActiveWindow
            ?: return ActionOutcome(false, "No active window")

        // Strategy 1: Find a Spinner/dropdown near the label
        val spinner = findSpinnerByLabel(root, dropdownLabel)
        if (spinner != null) {
            android.util.Log.d("AccessibilityController", "Found spinner for '$dropdownLabel', clicking to open")
            val clicked = service.clickNode(spinner)
            if (!clicked) return ActionOutcome(false, "Failed to open dropdown '$dropdownLabel'")
        } else {
            // Strategy 2: Find any element with text "Select an option" or the label itself
            val fallback = findNodeByTextOrDesc(root, dropdownLabel, caseSensitive = false)
                ?: findNodeByTextOrDesc(root, "Select an option", caseSensitive = false)
            if (fallback != null) {
                service.clickNode(fallback)
                android.util.Log.d("AccessibilityController", "Opened dropdown via fallback text match")
            } else {
                return ActionOutcome(false, "Could not find dropdown for '$dropdownLabel'")
            }
        }

        // Wait for the popup/dialog to open
        Thread.sleep(800)

        // Now find and click the desired option in the popup
        val newRoot = service.rootInActiveWindow ?: return ActionOutcome(false, "No active window after dropdown open")
        val option = findNodeByTextOrDesc(newRoot, optionText, caseSensitive = false)
        if (option != null) {
            val result = service.clickNode(option)
            return ActionOutcome(
                result,
                if (result) "Selected '$optionText' in dropdown '$dropdownLabel'"
                else "Failed to click option '$optionText'"
            )
        }

        // Try scrolling in the popup and searching again
        scrollDown()
        Thread.sleep(300)
        val newRoot2 = service.rootInActiveWindow ?: return ActionOutcome(false, "No window")
        val option2 = findNodeByTextOrDesc(newRoot2, optionText, caseSensitive = false)
        if (option2 != null) {
            val result = service.clickNode(option2)
            return ActionOutcome(result, if (result) "Selected '$optionText' after scroll" else "Click failed")
        }

        return ActionOutcome(false, "Option '$optionText' not found in dropdown '$dropdownLabel'")
    }

    /**
     * Check or uncheck a checkbox identified by its label.
     */
    fun setCheckbox(label: String, shouldBeChecked: Boolean): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")
        val root = service.rootInActiveWindow
            ?: return ActionOutcome(false, "No active window")

        // Find a checkable node near the label
        val checkNode = findCheckableByLabel(root, label)
            ?: return ActionOutcome(false, "Checkbox '$label' not found")

        val isAlreadyChecked = checkNode.isChecked
        if (isAlreadyChecked == shouldBeChecked) {
            return ActionOutcome(true, "Checkbox '$label' already ${if (shouldBeChecked) "checked" else "unchecked"}")
        }

        val result = service.clickNode(checkNode)
        return ActionOutcome(
            result,
            if (result) "${if (shouldBeChecked) "Checked" else "Unchecked"} '$label'"
            else "Failed to toggle checkbox '$label'"
        )
    }

    // --- Form field helpers ---

    private fun findEditableByLabel(root: AccessibilityNodeInfo, label: String): AccessibilityNodeInfo? {
        // Collect all nodes in order
        val allNodes = mutableListOf<Pair<AccessibilityNodeInfo, android.graphics.Rect>>()
        collectAllNodes(root, allNodes)

        // First: try to find an editable node whose hint text matches the label
        for ((node, _) in allNodes) {
            if (!node.isEditable) continue
            val hint = node.hintText?.toString() ?: ""
            val desc = node.contentDescription?.toString() ?: ""
            if (hint.contains(label, ignoreCase = true) || label.contains(hint.take(20), ignoreCase = true) ||
                desc.contains(label, ignoreCase = true)) {
                return node
            }
        }

        // Second: find the label node, then get the first editable after it in document order
        for (i in allNodes.indices) {
            val (node, _) = allNodes[i]
            val nodeText = node.text?.toString() ?: ""
            val nodeDesc = node.contentDescription?.toString() ?: ""
            if (nodeText.contains(label, ignoreCase = true) || nodeDesc.contains(label, ignoreCase = true)) {
                // Look for the first editable node after the label
                for (j in i + 1 until minOf(i + 5, allNodes.size)) {
                    val (next, _) = allNodes[j]
                    if (next.isEditable) return next
                }
            }
        }
        return null
    }

    private fun findSpinnerByLabel(root: AccessibilityNodeInfo, label: String): AccessibilityNodeInfo? {
        val allNodes = mutableListOf<Pair<AccessibilityNodeInfo, android.graphics.Rect>>()
        collectAllNodes(root, allNodes)

        // Find label node, then find the next clickable non-editable node (spinner)
        for (i in allNodes.indices) {
            val (node, _) = allNodes[i]
            val nodeText = node.text?.toString() ?: ""
            val nodeDesc = node.contentDescription?.toString() ?: ""
            if (nodeText.contains(label, ignoreCase = true) || nodeDesc.contains(label, ignoreCase = true)) {
                for (j in i + 1 until minOf(i + 6, allNodes.size)) {
                    val (next, _) = allNodes[j]
                    val nextText = next.text?.toString()?.lowercase() ?: ""
                    val cls = next.className?.toString()?.substringAfterLast('.') ?: ""
                    // It's a spinner if: class name is Spinner/AutoComplete OR it shows "Select an option"
                    if (cls in listOf("Spinner", "AppCompatSpinner", "AutoCompleteTextView") ||
                        (next.isClickable && !next.isEditable && nextText.contains("select"))) {
                        return next
                    }
                }
            }
        }

        // Fallback: look for any Spinner or "Select an option" node
        for ((node, _) in allNodes) {
            val cls = node.className?.toString()?.substringAfterLast('.') ?: ""
            if (cls in listOf("Spinner", "AppCompatSpinner") && node.isClickable) return node
        }
        return null
    }

    private fun findCheckableByLabel(root: AccessibilityNodeInfo, label: String): AccessibilityNodeInfo? {
        val allNodes = mutableListOf<Pair<AccessibilityNodeInfo, android.graphics.Rect>>()
        collectAllNodes(root, allNodes)

        for (i in allNodes.indices) {
            val (node, _) = allNodes[i]
            if (node.isCheckable) {
                val nodeText = node.text?.toString() ?: ""
                val nodeDesc = node.contentDescription?.toString() ?: ""
                if (nodeText.contains(label, ignoreCase = true) || nodeDesc.contains(label, ignoreCase = true)) {
                    return node
                }
            }
            // Also check for a checkable just after the label text
            val nodeText = node.text?.toString() ?: ""
            if (nodeText.contains(label, ignoreCase = true)) {
                for (j in i + 1 until minOf(i + 4, allNodes.size)) {
                    val (next, _) = allNodes[j]
                    if (next.isCheckable) return next
                }
            }
        }
        return null
    }

    private fun collectAllNodes(
        node: AccessibilityNodeInfo,
        result: MutableList<Pair<AccessibilityNodeInfo, android.graphics.Rect>>
    ) {
        val rect = android.graphics.Rect()
        node.getBoundsInScreen(rect)
        result.add(Pair(node, rect))
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { collectAllNodes(it, result) }
        }
    }

    fun pressEnter(): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")
        val root = service.rootInActiveWindow
            ?: return ActionOutcome(false, "No active window")

        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

        // Try multiple approaches to submit the search

        // 1. Try IME action on focused field (works for most keyboards)
        if (focused != null) {
            // Try IME action first (for Android R+)
            var result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                focused.performAction(android.R.id.accessibilityActionImeEnter)
            } else {
                false
            }

            // Fallback: Try ACTION_CLICK on the focused field (simulates keyboard action)
            if (!result) {
                result = focused.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }

            // Last resort: append newline
            if (!result) {
                val currentText = focused.text?.toString() ?: ""
                val args = Bundle().apply {
                    putCharSequence(
                        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                        "$currentText\n"
                    )
                }
                result = focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            }

            if (result) {
                return ActionOutcome(true, "Pressed Enter on input field")
            }
        }

        // 2. Try to find and click "Search" button (keyboard search button)
        val searchButton = findNodeByTextOrDesc(root, "search", caseSensitive = false)
        if (searchButton != null && searchButton.isClickable) {
            val clicked = service.clickNode(searchButton)
            if (clicked) {
                return ActionOutcome(true, "Clicked Search button")
            }
        }

        // 3. Try to find any button with "enter", "go", "done", "send" text
        val actionButtons = listOf("enter", "go", "done", "send", "submit")
        for (buttonText in actionButtons) {
            val button = findNodeByTextOrDesc(root, buttonText, caseSensitive = false)
            if (button != null && button.isClickable) {
                val clicked = service.clickNode(button)
                if (clicked) {
                    return ActionOutcome(true, "Clicked $buttonText button")
                }
            }
        }

        return ActionOutcome(false, "No input field focused and no search button found")
    }

    private fun findNodeByTextOrDesc(node: AccessibilityNodeInfo, searchTerm: String, caseSensitive: Boolean = false): AccessibilityNodeInfo? {
        val text = node.text?.toString() ?: ""
        val desc = node.contentDescription?.toString() ?: ""

        val matches = if (caseSensitive) {
            text.contains(searchTerm) || desc.contains(searchTerm)
        } else {
            text.contains(searchTerm, ignoreCase = true) || desc.contains(searchTerm, ignoreCase = true)
        }

        if (matches) return node

        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                findNodeByTextOrDesc(child, searchTerm, caseSensitive)?.let { return it }
            }
        }
        return null
    }

    fun scrollDown(): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")
        val result = service.scrollDown()
        return ActionOutcome(result, if (result) "Scrolled down" else "Scroll down failed")
    }

    fun scrollUp(): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")
        val result = service.scrollUp()
        return ActionOutcome(result, if (result) "Scrolled up" else "Scroll up failed")
    }

    fun pressBack(): ActionOutcome {
        val service = getService()
            ?: return ActionOutcome(false, "AccessibilityService not running")
        val result = service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
        return ActionOutcome(result, if (result) "Pressed Back" else "Back action failed")
    }

    fun openApp(context: Context, packageName: String): ActionOutcome {
        return try {
            val intent = context.packageManager.getLaunchIntentForPackage(packageName)
                ?: return ActionOutcome(false, "App not found: $packageName")
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            context.startActivity(intent)
            ActionOutcome(true, "Opened $packageName")
        } catch (e: Exception) {
            ActionOutcome(false, "Failed to open $packageName: ${e.message}")
        }
    }

    // --- Helpers ---

    private fun traverseForDesc(node: AccessibilityNodeInfo, desc: String): AccessibilityNodeInfo? {
        val nodeDesc = node.contentDescription?.toString() ?: ""
        if (nodeDesc.contains(desc, ignoreCase = true)) return node
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                traverseForDesc(child, desc)?.let { return it }
            }
        }
        return null
    }

    private fun findEditableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isEditable) return node
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                findEditableNode(child)?.let { return it }
            }
        }
        return null
    }

    fun takeScreenshot(): android.graphics.Bitmap? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        val service = getService() ?: return null
        val latch = java.util.concurrent.CountDownLatch(1)
        var bitmap: android.graphics.Bitmap? = null
        try {
            service.takeScreenshot(
                android.view.Display.DEFAULT_DISPLAY,
                service.mainExecutor,
                object : android.accessibilityservice.AccessibilityService.TakeScreenshotCallback {
                    override fun onSuccess(result: android.accessibilityservice.AccessibilityService.ScreenshotResult) {
                        try {
                            // Use reflection: ScreenshotResult API surface differs across SDK stubs
                            val hwBuffer = result.javaClass.getMethod("getHardwareBitmap").invoke(result)
                                    as android.hardware.HardwareBuffer
                            bitmap = android.graphics.Bitmap.wrapHardwareBuffer(hwBuffer, null)
                                ?.copy(android.graphics.Bitmap.Config.ARGB_8888, false)
                            runCatching { result.javaClass.getMethod("close").invoke(result) }
                        } catch (e: Exception) {
                            android.util.Log.w("AccessibilityController", "Screenshot extract failed: ${e.message}")
                        }
                        latch.countDown()
                    }
                    override fun onFailure(errorCode: Int) { latch.countDown() }
                }
            )
            latch.await(3, java.util.concurrent.TimeUnit.SECONDS)
        } catch (e: Exception) {
            android.util.Log.w("AccessibilityController", "takeScreenshot failed: ${e.message}")
        }
        return bitmap
    }
}
