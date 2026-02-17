package com.anonymous.androMolt.accessibility

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

data class UiNode(
    val index: Int,
    val text: String?,
    val contentDescription: String?,
    val className: String,
    val clickable: Boolean,
    val editable: Boolean,
    val scrollable: Boolean,
    val focused: Boolean,
    val bounds: Rect
)

data class UiSnapshot(
    val packageName: String,
    val nodes: List<UiNode>,
    val totalNodeCount: Int
)

object UiTreeBuilder {
    private const val MAX_ELEMENTS = 150

    fun buildUiSnapshot(root: AccessibilityNodeInfo): UiSnapshot {
        val nodes = mutableListOf<UiNode>()
        var totalCount = 0
        collectNodes(root, nodes, { totalCount++ })
        val packageName = root.packageName?.toString() ?: "unknown"
        return UiSnapshot(packageName, nodes, totalCount)
    }

    private fun collectNodes(
        node: AccessibilityNodeInfo,
        result: MutableList<UiNode>,
        countCallback: () -> Unit
    ) {
        countCallback()

        if (result.size >= MAX_ELEMENTS) return

        val text = node.text?.toString()?.takeIf { it.isNotBlank() }
        val desc = node.contentDescription?.toString()?.takeIf { it.isNotBlank() }
        val hasContent = text != null || desc != null ||
                node.isClickable || node.isEditable || node.isScrollable

        if (hasContent) {
            val rect = Rect()
            node.getBoundsInScreen(rect)
            // Skip zero-size nodes
            if (rect.width() > 0 && rect.height() > 0) {
                result.add(
                    UiNode(
                        index = result.size,
                        text = text,
                        contentDescription = desc,
                        className = simplifyClassName(node.className?.toString() ?: ""),
                        clickable = node.isClickable,
                        editable = node.isEditable,
                        scrollable = node.isScrollable,
                        focused = node.isFocused,
                        bounds = rect
                    )
                )
            }
        }

        for (i in 0 until node.childCount) {
            if (result.size >= MAX_ELEMENTS) break
            node.getChild(i)?.let { child ->
                collectNodes(child, result, countCallback)
            }
        }
    }

    private fun simplifyClassName(fullName: String): String {
        return fullName.substringAfterLast('.')
    }

    /**
     * Compact human-readable format for LLM consumption.
     * Example:
     * Screen: com.google.android.youtube
     * [0] ImageButton desc="Search" clickable
     * [1] TextView "Home" clickable
     */
    fun toCompactString(snapshot: UiSnapshot): String {
        val sb = StringBuilder()
        sb.appendLine("Screen: ${snapshot.packageName}")
        for (node in snapshot.nodes) {
            sb.append("[${node.index}] ${node.className}")
            node.text?.let { sb.append(" \"${it.take(60)}\"") }
            node.contentDescription?.let { sb.append(" desc=\"${it.take(60)}\"") }
            if (node.clickable) sb.append(" clickable")
            if (node.editable) sb.append(" editable")
            if (node.scrollable) sb.append(" scrollable")
            if (node.focused) sb.append(" focused")
            sb.appendLine()
        }
        sb.appendLine("(${snapshot.totalNodeCount} elements total)")
        return sb.toString()
    }

    /**
     * JSON format for native bridge transport.
     */
    fun toJsonString(snapshot: UiSnapshot): String {
        val json = JSONObject()
        json.put("pkg", snapshot.packageName)
        json.put("total", snapshot.totalNodeCount)

        val arr = JSONArray()
        for (node in snapshot.nodes) {
            val obj = JSONObject()
            obj.put("i", node.index)
            node.text?.let { obj.put("txt", it.take(80)) }
            node.contentDescription?.let { obj.put("desc", it.take(80)) }
            obj.put("cls", node.className)
            if (node.clickable) obj.put("click", true)
            if (node.editable) obj.put("edit", true)
            if (node.scrollable) obj.put("scroll", true)
            if (node.focused) obj.put("focus", true)
            obj.put("b", JSONObject().apply {
                put("l", node.bounds.left)
                put("t", node.bounds.top)
                put("r", node.bounds.right)
                put("b", node.bounds.bottom)
            })
            arr.put(obj)
        }
        json.put("nodes", arr)
        return json.toString()
    }
}
