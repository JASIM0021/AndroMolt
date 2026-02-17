package com.anonymous.androMolt.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.anonymous.androMolt.utils.EventBridge
import kotlinx.coroutines.*
import org.json.JSONObject

class AndroMoltAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "AndroMoltAccessibility"

        @Volatile
        private var instance: AndroMoltAccessibilityService? = null

        fun getInstance(): AndroMoltAccessibilityService? = instance
    }

    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this

        // Configure service
        serviceInfo = serviceInfo.apply {
            flags = flags or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
            eventTypes = AccessibilityEvent.TYPES_ALL_MASK
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
        }

        Log.i(TAG, "AccessibilityService connected")
        EventBridge.emit("accessibilityServiceConnected", null)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event?.let {
            // Track screen changes for context awareness
            if (it.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                val packageName = it.packageName?.toString() ?: ""
                val className = it.className?.toString() ?: ""

                EventBridge.emit("screenChanged", JSONObject().apply {
                    put("package", packageName)
                    put("class", className)
                })
            }
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "AccessibilityService interrupted")
        instance = null
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        instance = null
        Log.i(TAG, "AccessibilityService destroyed")
    }

    // ==== Core Automation Methods ====

    /**
     * Find a node by its visible text
     * Enhanced with bidirectional matching for truncated video titles
     */
    fun findNodeByText(text: String, exact: Boolean = false): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null

        Log.d(TAG, "findNodeByText: Searching for '$text' (exact=$exact)")
        var searchedNodes = 0

        if (exact) {
            val result = traverseTree(root) { node ->
                searchedNodes++
                val nodeText = node.text?.toString() ?: ""
                nodeText.equals(text, ignoreCase = true)
            }
            Log.d(TAG, "findNodeByText: Searched $searchedNodes nodes, exact match: ${result != null}")
            return result
        }

        // Try multiple matching strategies (most specific to least specific)

        // Strategy 1: Node text or contentDescription contains search text
        var result = traverseTree(root) { node ->
            searchedNodes++
            val nodeText = node.text?.toString() ?: ""
            val nodeDesc = node.contentDescription?.toString() ?: ""

            (nodeText.isNotBlank() && nodeText.contains(text, ignoreCase = true)) ||
            (nodeDesc.isNotBlank() && nodeDesc.contains(text, ignoreCase = true))
        }
        if (result != null) {
            Log.d(TAG, "findNodeByText: Found via strategy 1 (node contains search) after $searchedNodes nodes")
            return result
        }

        // Strategy 2: Search text contains node text or contentDescription (for truncated titles)
        // Only if search text is reasonably long (>10 chars) to avoid false positives
        searchedNodes = 0
        if (text.length > 10) {
            result = traverseTree(root) { node ->
                searchedNodes++
                val nodeText = node.text?.toString() ?: ""
                val nodeDesc = node.contentDescription?.toString() ?: ""

                (nodeText.isNotBlank() && nodeText.length > 5 &&
                 text.contains(nodeText, ignoreCase = true)) ||
                (nodeDesc.isNotBlank() && nodeDesc.length > 5 &&
                 text.contains(nodeDesc, ignoreCase = true))
            }
            if (result != null) {
                Log.d(TAG, "findNodeByText: Found via strategy 2 (search contains node) after $searchedNodes nodes")
                return result
            }
        }

        // Strategy 3: Match first N words in text or contentDescription (for partial titles)
        searchedNodes = 0
        val searchWords = text.split(" ").take(5).joinToString(" ")
        if (searchWords != text && searchWords.length > 5) {
            result = traverseTree(root) { node ->
                searchedNodes++
                val nodeText = node.text?.toString() ?: ""
                val nodeDesc = node.contentDescription?.toString() ?: ""

                (nodeText.isNotBlank() &&
                 (nodeText.contains(searchWords, ignoreCase = true) ||
                  searchWords.contains(nodeText, ignoreCase = true))) ||
                (nodeDesc.isNotBlank() &&
                 (nodeDesc.contains(searchWords, ignoreCase = true) ||
                  searchWords.contains(nodeDesc, ignoreCase = true)))
            }
            if (result != null) {
                Log.d(TAG, "findNodeByText: Found via strategy 3 (first words) after $searchedNodes nodes")
                return result
            }
        }

        Log.w(TAG, "findNodeByText: NOT FOUND after searching all strategies")
        return null
    }

    /**
     * Find a node by its resource ID
     */
    fun findNodeByResourceId(resourceId: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return traverseTree(root) { node ->
            node.viewIdResourceName?.equals(resourceId) == true
        }
    }

    /**
     * Click on a node
     */
    fun clickNode(node: AccessibilityNodeInfo): Boolean {
        return if (node.isClickable) {
            node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        } else {
            // If not clickable, try clicking parent
            node.parent?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
        }
    }

    /**
     * Click at specific coordinates
     */
    fun clickCoordinates(x: Int, y: Int): Boolean {
        val path = Path().apply {
            moveTo(x.toFloat(), y.toFloat())
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 100))
            .build()

        return dispatchGesture(gesture, null, null)
    }

    /**
     * Input text into a node
     */
    fun inputText(node: AccessibilityNodeInfo, text: String): Boolean {
        if (!node.isFocused) {
            node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        }

        val arguments = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }

        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
    }

    /**
     * Scroll down
     */
    fun scrollDown(): Boolean {
        val root = rootInActiveWindow ?: return false
        val scrollable = findScrollableNode(root)
        return scrollable?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD) ?: false
    }

    /**
     * Scroll up
     */
    fun scrollUp(): Boolean {
        val root = rootInActiveWindow ?: return false
        val scrollable = findScrollableNode(root)
        return scrollable?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) ?: false
    }

    /**
     * Get all visible text on screen
     */
    fun getScreenText(): String {
        val root = rootInActiveWindow ?: return ""
        val textElements = mutableListOf<String>()

        collectTextRecursively(root, textElements)

        return textElements.joinToString("\n")
    }

    /**
     * Get current package name
     */
    fun getCurrentPackage(): String? {
        return rootInActiveWindow?.packageName?.toString()
    }

    // ==== Helper Methods ====

    private fun traverseTree(
        node: AccessibilityNodeInfo,
        matcher: (AccessibilityNodeInfo) -> Boolean
    ): AccessibilityNodeInfo? {
        if (matcher(node)) return node

        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                traverseTree(child, matcher)?.let { return it }
            }
        }

        return null
    }

    private fun findScrollableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isScrollable) return node

        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                findScrollableNode(child)?.let { return it }
            }
        }

        return null
    }

    private fun collectTextRecursively(node: AccessibilityNodeInfo, acc: MutableList<String>) {
        node.text?.toString()?.let { text ->
            if (text.isNotBlank()) acc.add(text)
        }

        node.contentDescription?.toString()?.let { desc ->
            if (desc.isNotBlank()) acc.add(desc)
        }

        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                collectTextRecursively(child, acc)
            }
        }
    }
}
