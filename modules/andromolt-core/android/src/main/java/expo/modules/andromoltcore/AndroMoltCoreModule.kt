package expo.modules.andromoltcore

import android.content.Intent
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.anonymous.androMolt.accessibility.AndroMoltAccessibilityService
import com.anonymous.androMolt.automation.AutomationAction
import com.anonymous.androMolt.automation.AutomationExecutor
import com.anonymous.androMolt.service.AndroMoltForegroundService
import com.anonymous.androMolt.utils.AccessibilityChecker
import com.anonymous.androMolt.utils.EventBridge
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

class AndroMoltCoreModule : Module() {
    private val coroutineScope = CoroutineScope(Dispatchers.Main)

    override fun definition() = ModuleDefinition {
        Name("AndroMoltCore")

        OnCreate {
            // Initialize EventBridge with React context
            EventBridge.initialize(appContext.reactContext!!)
        }

        // Check if AccessibilityService is enabled
        AsyncFunction("isAccessibilityEnabled") {
            AccessibilityChecker.isEnabled(appContext.reactContext!!)
        }

        // Open Accessibility Settings
        Function("openAccessibilitySettings") {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            appContext.reactContext?.startActivity(intent)
        }

        // Execute automation action
        AsyncFunction("executeAction") { actionJson: String, promise: Promise ->
            coroutineScope.launch {
                try {
                    val action = AutomationAction.fromJSON(JSONObject(actionJson))
                    val result = AutomationExecutor.execute(appContext.reactContext!!, action)
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.reject("EXECUTION_ERROR", e.message, e)
                }
            }
        }

        // Get list of installed apps
        AsyncFunction("getInstalledApps") {
            val pm = appContext.reactContext?.packageManager!!
            val apps = pm.getInstalledApplications(0)
                .filter { pm.getLaunchIntentForPackage(it.packageName) != null }
                .map {
                    mapOf(
                        "name" to pm.getApplicationLabel(it).toString(),
                        "packageName" to it.packageName
                    )
                }
            apps
        }

        // Launch an app by package name
        AsyncFunction("launchApp") { packageName: String, promise: Promise ->
            try {
                val pm = appContext.reactContext?.packageManager!!
                val intent = pm.getLaunchIntentForPackage(packageName)
                if (intent != null) {
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    appContext.reactContext?.startActivity(intent)
                    promise.resolve(true)
                } else {
                    promise.reject("APP_NOT_FOUND", "App not found: $packageName")
                }
            } catch (e: Exception) {
                promise.reject("LAUNCH_ERROR", e.message, e)
            }
        }

        // Get current package name
        AsyncFunction("getCurrentPackage") {
            val service = AndroMoltAccessibilityService.getInstance()
            service?.getCurrentPackage()
        }

        // Get screen elements via Accessibility Service
        AsyncFunction("getScreenElements") {
            val service = AndroMoltAccessibilityService.getInstance()
            service?.getScreenElements() ?: emptyList<Map<String, Any>>()
        }

        // Perform click at coordinates
        AsyncFunction("performClick") { x: Double, y: Double, promise: Promise ->
            try {
                val service = AndroMoltAccessibilityService.getInstance()
                val result = service?.performClick(x.toFloat(), y.toFloat()) ?: false
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("CLICK_ERROR", e.message, e)
            }
        }

        // Input text using Accessibility Service
        AsyncFunction("inputText") { text: String, promise: Promise ->
            try {
                val service = AndroMoltAccessibilityService.getInstance()
                val result = service?.inputText(text) ?: false
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("INPUT_ERROR", e.message, e)
            }
        }

        // Press a key (e.g., Enter, Back)
        AsyncFunction("pressKey") { keyCode: Int, promise: Promise ->
            try {
                val service = AndroMoltAccessibilityService.getInstance()
                val result = service?.pressKey(keyCode) ?: false
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("KEY_ERROR", e.message, e)
            }
        }

        // Scroll down
        AsyncFunction("scrollDown") {
            val service = AndroMoltAccessibilityService.getInstance()
            service?.scrollDown() ?: false
        }

        // Start foreground service
        Function("startForegroundService") {
            val intent = Intent(appContext.reactContext, AndroMoltForegroundService::class.java)
            ContextCompat.startForegroundService(appContext.reactContext!!, intent)
        }

        // Stop foreground service
        Function("stopForegroundService") {
            val intent = Intent(appContext.reactContext, AndroMoltForegroundService::class.java)
            appContext.reactContext?.stopService(intent)
        }

        // Events from native → JS
        Events(
            "onActionStarted",
            "onActionCompleted",
            "onActionFailed",
            "onNodeFound",
            "onScreenTextExtracted",
            "screenChanged",
            "accessibilityServiceConnected"
        )
    }
}
