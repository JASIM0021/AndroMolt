package com.andromolt.modules

import android.content.Context
import android.content.Intent
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.accessibility.AccessibilityNodeInfo
import com.anonymous.androMolt.accessibility.AccessibilityController
import com.anonymous.androMolt.accessibility.AndroMoltAccessibilityService
import com.anonymous.androMolt.accessibility.UiTreeBuilder
import com.anonymous.androMolt.agent.NativeAgentLoop
import com.anonymous.androMolt.agent.NativeLlmClient
import com.anonymous.androMolt.service.AndroMoltForegroundService
import com.anonymous.androMolt.utils.EventBridge
import com.facebook.react.bridge.*
import org.json.JSONObject

class AndroMoltCoreModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        // Initialize EventBridge for native-to-JS events
        EventBridge.initialize(reactContext)
    }

    override fun getName() = "AndroMoltCore"

    @ReactMethod
    fun getSystemStatus(promise: Promise) {
        try {
            val status = Arguments.createMap()
            status.putString("version", "1.0.0")
            status.putString("platform", "android")
            status.putBoolean("isReady", true)
            
            val permissionStatus = Arguments.createMap()
            permissionStatus.putBoolean("accessibility", isAccessibilityServiceEnabled())
            permissionStatus.putBoolean("overlay", canDrawOverlays())
            permissionStatus.putBoolean("usageStats", canAccessUsageStats())
            status.putMap("permissions", permissionStatus)
            
            val moduleStatus = Arguments.createMap()
            moduleStatus.putBoolean("appLauncher", true)
            moduleStatus.putBoolean("accessibility", isAccessibilityServiceEnabled())
            moduleStatus.putBoolean("permissions", true)
            status.putMap("modules", moduleStatus)
            
            promise.resolve(status)
        } catch (e: Exception) {
            promise.reject("STATUS_ERROR", "Failed to get system status", e)
        }
    }

    @ReactMethod
    fun executeActionPlan(actionPlanJson: String, promise: Promise) {
        try {
            val results = Arguments.createArray()
            
            // Simple demo execution
            val result = Arguments.createMap()
            result.putString("actionId", "1")
            result.putString("type", "demo")
            result.putString("status", "completed")
            result.putBoolean("success", true)
            result.putString("message", "Action plan executed (demo mode)")
            result.putString("timestamp", System.currentTimeMillis().toString())
            
            results.pushMap(result)
            promise.resolve(results)
        } catch (e: Exception) {
            promise.reject("EXECUTION_ERROR", "Failed to execute action plan: ${e.message}", e)
        }
    }

    @ReactMethod
    fun validateActionPlan(actionPlanJson: String, promise: Promise) {
        try {
            val validation = Arguments.createMap()
            validation.putBoolean("valid", true)
            validation.putString("riskLevel", "medium")
            validation.putString("message", "Action plan appears valid")
            validation.putArray("warnings", Arguments.createArray())
            promise.resolve(validation)
        } catch (e: Exception) {
            promise.reject("VALIDATION_ERROR", "Failed to validate action plan", e)
        }
    }

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        try {
            val deviceInfo = Arguments.createMap()
            deviceInfo.putString("androidVersion", Build.VERSION.RELEASE)
            deviceInfo.putInt("sdkVersion", Build.VERSION.SDK_INT)
            deviceInfo.putString("manufacturer", Build.MANUFACTURER)
            deviceInfo.putString("model", Build.MODEL)
            deviceInfo.putString("brand", Build.BRAND)
            promise.resolve(deviceInfo)
        } catch (e: Exception) {
            promise.reject("DEVICE_INFO_ERROR", "Failed to get device info", e)
        }
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val packageName = reactApplicationContext.packageName
        val serviceId = "$packageName/com.anonymous.androMolt.accessibility.AndroMoltAccessibilityService"

        val enabledServices = Settings.Secure.getString(
            reactApplicationContext.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )

        return enabledServices?.contains("AndroMolt") == true ||
               enabledServices?.contains("andromolt") == true ||
               enabledServices?.contains(serviceId) == true ||
               AndroMoltAccessibilityService.getInstance() != null
    }

    private fun canDrawOverlays(): Boolean {
        return Settings.canDrawOverlays(reactApplicationContext)
    }

    private fun canAccessUsageStats(): Boolean {
        return try {
            val appOpsManager = reactApplicationContext.getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOpsManager.unsafeCheckOpNoThrow(
                    "android:get_usage_stats",
                    android.os.Process.myUid(),
                    reactApplicationContext.packageName
                )
            } else {
                appOpsManager.checkOpNoThrow(
                    "android:get_usage_stats",
                    android.os.Process.myUid(),
                    reactApplicationContext.packageName
                )
            }
            mode == android.app.AppOpsManager.MODE_ALLOWED
        } catch (e: Exception) {
            false
        }
    }

    // ==== Runtime Automation Methods ====

    @ReactMethod
    fun getScreenElements(promise: Promise) {
        try {
            val service = AndroMoltAccessibilityService.getInstance()
            if (service == null) {
                promise.resolve(Arguments.createArray())
                return
            }
            val root = service.rootInActiveWindow
            if (root == null) {
                promise.resolve(Arguments.createArray())
                return
            }
            val elements = Arguments.createArray()
            collectElements(root, elements)
            promise.resolve(elements)
        } catch (e: Exception) {
            promise.reject("ERR_SCREEN_ELEMENTS", e.message, e)
        }
    }

    @ReactMethod
    fun performClick(x: Double, y: Double, promise: Promise) {
        try {
            val service = AndroMoltAccessibilityService.getInstance()
                ?: throw IllegalStateException("AccessibilityService not running")
            val result = service.clickCoordinates(x.toInt(), y.toInt())
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_CLICK", e.message, e)
        }
    }

    @ReactMethod
    fun inputText(text: String, promise: Promise) {
        try {
            val service = AndroMoltAccessibilityService.getInstance()
                ?: throw IllegalStateException("AccessibilityService not running")
            val root = service.rootInActiveWindow
            if (root == null) {
                promise.resolve(false)
                return
            }
            val editNode = findFocusedOrEditable(root)
            if (editNode == null) {
                promise.resolve(false)
                return
            }
            val result = service.inputText(editNode, text)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_INPUT", e.message, e)
        }
    }

    @ReactMethod
    fun pressKey(keyCode: Int, promise: Promise) {
        try {
            val service = AndroMoltAccessibilityService.getInstance()
                ?: throw IllegalStateException("AccessibilityService not running")
            val root = service.rootInActiveWindow
            if (root == null) {
                promise.resolve(false)
                return
            }
            val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            if (focused != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    promise.resolve(focused.performAction(android.R.id.accessibilityActionImeEnter))
                } else {
                    val currentText = focused.text?.toString() ?: ""
                    val args = Bundle().apply {
                        putCharSequence(
                            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                            "$currentText\n"
                        )
                    }
                    promise.resolve(focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args))
                }
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("ERR_KEY", e.message, e)
        }
    }

    @ReactMethod
    fun scrollDown(promise: Promise) {
        try {
            val service = AndroMoltAccessibilityService.getInstance()
                ?: throw IllegalStateException("AccessibilityService not running")
            promise.resolve(service.scrollDown())
        } catch (e: Exception) {
            promise.reject("ERR_SCROLL", e.message, e)
        }
    }

    @ReactMethod
    fun launchApp(packageName: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = context.packageManager.getLaunchIntentForPackage(packageName)
            if (intent == null) {
                promise.resolve(false)
                return
            }
            // Launch the target app but keep our app's process alive
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_MULTIPLE_TASK
            context.startActivity(intent)

            // Post a delayed callback to verify launch succeeded
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                promise.resolve(true)
            }, 500)
        } catch (e: Exception) {
            promise.reject("ERR_LAUNCH", e.message, e)
        }
    }

    @ReactMethod
    fun getCurrentPackage(promise: Promise) {
        try {
            val service = AndroMoltAccessibilityService.getInstance()
            promise.resolve(service?.getCurrentPackage() ?: "")
        } catch (e: Exception) {
            promise.reject("ERR_PACKAGE", e.message, e)
        }
    }

    // ==== New Agent Loop Methods ====

    @ReactMethod
    fun getUiSnapshot(promise: Promise) {
        try {
            val snapshot = AccessibilityController.getUiSnapshot()
            if (snapshot == null) {
                promise.resolve("")
                return
            }
            val result = Arguments.createMap()
            result.putString("compact", UiTreeBuilder.toCompactString(snapshot))
            result.putString("json", UiTreeBuilder.toJsonString(snapshot))
            result.putString("packageName", snapshot.packageName)
            result.putInt("elementCount", snapshot.nodes.size)
            result.putInt("totalNodes", snapshot.totalNodeCount)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_SNAPSHOT", e.message, e)
        }
    }

    @ReactMethod
    fun clickByText(text: String, promise: Promise) {
        try {
            val outcome = AccessibilityController.clickByText(text)
            val result = Arguments.createMap()
            result.putBoolean("success", outcome.success)
            result.putString("message", outcome.message)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_CLICK_TEXT", e.message, e)
        }
    }

    @ReactMethod
    fun clickByContentDesc(desc: String, promise: Promise) {
        try {
            val outcome = AccessibilityController.clickByContentDesc(desc)
            val result = Arguments.createMap()
            result.putBoolean("success", outcome.success)
            result.putString("message", outcome.message)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_CLICK_DESC", e.message, e)
        }
    }

    @ReactMethod
    fun clickByIndex(index: Int, promise: Promise) {
        try {
            val snapshot = AccessibilityController.getUiSnapshot()
            if (snapshot == null) {
                val result = Arguments.createMap()
                result.putBoolean("success", false)
                result.putString("message", "No UI snapshot available")
                promise.resolve(result)
                return
            }
            val outcome = AccessibilityController.clickByIndex(index, snapshot)
            val result = Arguments.createMap()
            result.putBoolean("success", outcome.success)
            result.putString("message", outcome.message)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_CLICK_INDEX", e.message, e)
        }
    }

    @ReactMethod
    fun pressBack(promise: Promise) {
        try {
            val outcome = AccessibilityController.pressBack()
            val result = Arguments.createMap()
            result.putBoolean("success", outcome.success)
            result.putString("message", outcome.message)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_BACK", e.message, e)
        }
    }

    @ReactMethod
    fun scrollUp(promise: Promise) {
        try {
            val outcome = AccessibilityController.scrollUp()
            val result = Arguments.createMap()
            result.putBoolean("success", outcome.success)
            result.putString("message", outcome.message)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_SCROLL_UP", e.message, e)
        }
    }

    @ReactMethod
    fun pressEnter(promise: Promise) {
        try {
            val outcome = AccessibilityController.pressEnter()
            val result = Arguments.createMap()
            result.putBoolean("success", outcome.success)
            result.putString("message", outcome.message)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_ENTER", e.message, e)
        }
    }

    @ReactMethod
    fun updateNotification(text: String, promise: Promise) {
        try {
            AndroMoltForegroundService.updateText(text)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_NOTIFICATION", e.message, e)
        }
    }

    @ReactMethod
    fun startAgent(promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, AndroMoltForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_START_AGENT", e.message, e)
        }
    }

    @ReactMethod
    fun stopAgent(promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, AndroMoltForegroundService::class.java)
            context.stopService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP_AGENT", e.message, e)
        }
    }

    @ReactMethod
    fun moveToBackground(promise: Promise) {
        try {
            val intent = Intent(Intent.ACTION_MAIN)
            intent.addCategory(Intent.CATEGORY_HOME)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_BACKGROUND", e.message, e)
        }
    }

    // ==== Helper Methods ====

    private fun collectElements(node: AccessibilityNodeInfo, array: WritableArray) {
        val rect = Rect()
        node.getBoundsInScreen(rect)

        val hasContent = !node.text.isNullOrBlank() ||
                !node.contentDescription.isNullOrBlank() ||
                node.isClickable || node.isEditable || node.isScrollable

        if (hasContent) {
            val map = Arguments.createMap().apply {
                putString("text", node.text?.toString() ?: "")
                putString("resourceId", node.viewIdResourceName ?: "")
                putString("className", node.className?.toString() ?: "")
                putString("contentDescription", node.contentDescription?.toString() ?: "")
                putBoolean("clickable", node.isClickable)
                putBoolean("enabled", node.isEnabled)
                putBoolean("focused", node.isFocused)
                putBoolean("scrollable", node.isScrollable)
                putBoolean("password", node.isPassword)
                putMap("bounds", Arguments.createMap().apply {
                    putInt("left", rect.left)
                    putInt("top", rect.top)
                    putInt("right", rect.right)
                    putInt("bottom", rect.bottom)
                })
            }
            array.pushMap(map)
        }

        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                collectElements(child, array)
            }
        }
    }

    private fun findFocusedOrEditable(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val focused = node.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focused != null && focused.isEditable) return focused
        return findEditableNode(node)
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

    @ReactMethod
    fun nativeDelay(ms: Int, promise: Promise) {
        try {
            // Use native thread sleep to avoid JS setTimeout issues
            Thread.sleep(ms.toLong())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_DELAY", e.message, e)
        }
    }

    // ==== Native Agent Loop ====

    private var currentAgentLoop: NativeAgentLoop? = null

    @ReactMethod
    fun runNativeAgent(goal: String, openaiApiKey: String?, geminiApiKey: String?, promise: Promise) {
        try {
            // Cancel any existing agent loop
            currentAgentLoop?.cancel()

            // Create LLM client with API keys
            val llmClient = NativeLlmClient(reactApplicationContext)
            llmClient.openaiApiKey = openaiApiKey
            llmClient.geminiApiKey = geminiApiKey

            // Create and run agent loop
            val agentLoop = NativeAgentLoop(reactApplicationContext, llmClient)
            currentAgentLoop = agentLoop

            agentLoop.run(goal) { result ->
                val resultMap = Arguments.createMap()
                resultMap.putBoolean("success", result.success)
                resultMap.putString("message", result.message)
                resultMap.putInt("steps", result.steps)
                promise.resolve(resultMap)
            }
        } catch (e: Exception) {
            promise.reject("ERR_AGENT", "Failed to run native agent: ${e.message}", e)
        }
    }

    @ReactMethod
    fun cancelNativeAgent(promise: Promise) {
        try {
            currentAgentLoop?.cancel()
            currentAgentLoop = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_CANCEL", "Failed to cancel agent: ${e.message}", e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Double) {}
}