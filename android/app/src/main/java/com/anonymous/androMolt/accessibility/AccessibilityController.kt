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
                        var hwBitmap: android.graphics.Bitmap? = null
                        var hwBuffer: android.hardware.HardwareBuffer? = null
                        try {
                            // Use reflection: ScreenshotResult API surface differs across SDK stubs
                            hwBuffer = result.javaClass.getMethod("getHardwareBuffer").invoke(result)
                                    as android.hardware.HardwareBuffer
                            val colorSpace = runCatching {
                                result.javaClass.getMethod("getColorSpace").invoke(result)
                                    as? android.graphics.ColorSpace
                            }.getOrNull()
                            hwBitmap = android.graphics.Bitmap.wrapHardwareBuffer(hwBuffer, colorSpace)
                            bitmap = hwBitmap?.copy(android.graphics.Bitmap.Config.ARGB_8888, false)
                        } catch (e: Exception) {
                            android.util.Log.w("AccessibilityController", "Screenshot extract failed: ${e.message}")
                        } finally {
                            hwBitmap?.recycle()
                            runCatching { hwBuffer?.close() }
                            runCatching { result.javaClass.getMethod("close").invoke(result) }
                        }
                        latch.countDown()
                    }
                    override fun onFailure(errorCode: Int) {
                        android.util.Log.e("AccessibilityController", "takeScreenshot failed with errorCode=$errorCode")
                        latch.countDown()
                    }
                }
            )
            latch.await(3, java.util.concurrent.TimeUnit.SECONDS)
        } catch (e: Exception) {
            android.util.Log.w("AccessibilityController", "takeScreenshot failed: ${e.message}")
        }
        return bitmap
    }
}
