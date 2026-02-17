package com.anonymous.androMolt.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.graphics.Rect
import android.os.Build
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.concurrent.CopyOnWriteArrayList

class AndroMoltAccessibilityService : AccessibilityService() {

    companion object {
        private var instance: AndroMoltAccessibilityService? = null

        fun getInstance(): AndroMoltAccessibilityService? = instance
    }

    private val eventListeners = CopyOnWriteArrayList<AccessibilityEventListener>()

    interface AccessibilityEventListener {
        fun onAccessibilityEvent(event: AccessibilityEvent?)
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        val info = AccessibilityServiceInfo()
        info.eventTypes = AccessibilityEvent.TYPE_ALL_STATES
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
        info.flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or 
                     AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                     AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        info.notificationTimeout = 100
        serviceInfo = info
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        eventListeners.forEach { it.onAccessibilityEvent(event) }
    }

    override fun onInterrupt() {}

    // Get current foreground app package name
    fun getCurrentPackage(): String? {
        return rootInActiveWindow?.window?.packageName?.toString()
    }

    // Get all clickable elements on screen
    fun getScreenElements(): List<Map<String, Any>> {
        val elements = mutableListOf<Map<String, Any>>()
        val root = rootInActiveWindow ?: return elements

        fun traverse(node: AccessibilityNodeInfo?, depth: Int = 0) {
            if (node == null || depth > 10) return

            val bounds = Rect()
            node.getBoundsInScreen(bounds)

            val elementMap = mapOf(
                "text" to (node.text?.toString() ?: ""),
                "resourceId" to (node.viewIdResourceName ?: ""),
                "className" to (node.className?.toString() ?: ""),
                "contentDescription" to (node.contentDescription?.toString() ?: ""),
                "bounds" to mapOf(
                    "left" to bounds.left,
                    "top" to bounds.top,
                    "right" to bounds.right,
                    "bottom" to bounds.bottom
                ),
                "clickable" to node.isClickable,
                "enabled" to node.isEnabled,
                "focusable" to node.isFocusable
            )
            elements.add(elementMap)

            for (i in 0 until node.childCount) {
                traverse(node.getChild(i), depth + 1)
            }
        }

        traverse(root)
        return elements
    }

    // Click at coordinates
    fun performClick(x: Float, y: Float): Boolean {
        return try {
            val gestureResult = dispatchGesture(
                android.view.accessibility.GestureDescription.Builder()
                    .addStroke(android.view.accessibility.GestureDescription.StrokeDescription(
                        android.view.MotionEvent.obtain(0, 0, android.view.MotionEvent.ACTION_DOWN, x, y, 0),
                        0, 100
                    ))
                    .addStroke(android.view.accessibility.GestureDescription.StrokeDescription(
                        android.view.MotionEvent.obtain(0, 100, android.view.MotionEvent.ACTION_UP, x, y, 0),
                        100, 100
                    ))
                    .build(),
                null, null
            )
            gestureResult
        } catch (e: Exception) {
            false
        }
    }

    // Click on element by text
    fun clickByText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val nodes = root.findAccessibilityNodeInfosByText(text)
        
        for (node in nodes) {
            if (node.isClickable) {
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                node.recycle()
                return true
            }
            val parent = node.parent
            if (parent != null && parent.isClickable) {
                parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                parent.recycle()
                return true
            }
            node.recycle()
        }
        return false
    }

    // Input text into focused field
    fun inputText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val focusedNode = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        
        if (focusedNode != null) {
            val arguments = android.os.Bundle()
            arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            val result = focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
            focusedNode.recycle()
            return result
        }
        
        // Try to find edit text
        val editTexts = root.findAccessibilityNodeInfosByViewId("android:id/text1")
        for (node in editTexts) {
            if (node.isEditable) {
                val arguments = android.os.Bundle()
                arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
                node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
                node.recycle()
                return true
            }
            node.recycle()
        }
        
        return false
    }

    // Press key (keyCode)
    fun pressKey(keyCode: Int): Boolean {
        return try {
            val arguments = android.os.Bundle()
            arguments.putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_MOVEMENT_GRANULARITY_INT, keyCode)
            rootInActiveWindow?.performAction(AccessibilityNodeInfo.ACTION_IME_ENTER)
            true
        } catch (e: Exception) {
            false
        }
    }

    // Scroll down
    fun scrollDown(): Boolean {
        val root = rootInActiveWindow ?: return false
        
        // Try to find scrollable container
        var scrollable: AccessibilityNodeInfo? = root
        while (scrollable != null) {
            if (scrollable.isScrollable) {
                scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
                scrollable.recycle()
                return true
            }
            val parent = scrollable.parent
            scrollable.recycle()
            scrollable = parent
        }
        
        // Global scroll
        return root.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
    }

    // Find element by text
    fun findElementByText(text: String): Map<String, Any>? {
        val root = rootInActiveWindow ?: return null
        val nodes = root.findAccessibilityNodeInfosByText(text)
        
        if (nodes.isEmpty()) return null
        
        val node = nodes[0]
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        
        val result = mapOf(
            "text" to (node.text?.toString() ?: ""),
            "resourceId" to (node.viewIdResourceName ?: ""),
            "bounds" to mapOf(
                "left" to bounds.left,
                "top" to bounds.top,
                "right" to bounds.right,
                "bottom" to bounds.bottom
            ),
            "clickable" to node.isClickable
        )
        
        node.recycle()
        return result
    }

    // Wait for specific package
    fun waitForPackage(packageName: String, timeoutMs: Long = 5000): Boolean {
        val startTime = System.currentTimeMillis()
        while (System.currentTimeMillis() - startTime < timeoutMs) {
            if (getCurrentPackage() == packageName) {
                return true
            }
            Thread.sleep(100)
        }
        return false
    }
}
