package com.andromolt.modules

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.anonymous.androMolt.accessibility.AndroMoltAccessibilityService
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class PermissionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AndroMoltPermission"

    @ReactMethod
    fun checkPermissions(promise: Promise) {
        val context = reactApplicationContext
        val permissions = WritableNativeMap()
        
        // Check basic permissions
        permissions.putBoolean("accessibility", isAccessibilityServiceEnabled())
        permissions.putBoolean("overlay", canDrawOverlays())
        permissions.putBoolean("usage_stats", canAccessUsageStats())
        permissions.putBoolean("notifications", hasNotificationPermission())
        permissions.putBoolean("contacts", hasPermission(Manifest.permission.READ_CONTACTS))
        
        promise.resolve(permissions)
    }

    @ReactMethod
    fun requestAccessibilityPermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ACCESSIBILITY_ERROR", "Failed to open accessibility settings", e)
        }
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
            intent.data = Uri.parse("package:${reactApplicationContext.packageName}")
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OVERLAY_ERROR", "Failed to open overlay settings", e)
        }
    }

    @ReactMethod
    fun requestUsageStatsPermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("USAGE_STATS_ERROR", "Failed to open usage stats settings", e)
        }
    }

    @ReactMethod
    fun requestNotificationPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, reactApplicationContext.packageName)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("NOTIFICATION_ERROR", "Failed to open notification settings", e)
            }
        } else {
            // Notifications are automatically granted on older versions
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun getPermissionStatus(permission: String, promise: Promise) {
        val status = when (permission) {
            "accessibility" -> isAccessibilityServiceEnabled()
            "overlay" -> canDrawOverlays()
            "usage_stats" -> canAccessUsageStats()
            "notifications" -> hasNotificationPermission()
            "contacts" -> hasPermission(Manifest.permission.READ_CONTACTS)
            else -> false
        }
        promise.resolve(status)
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
            val packageManager = reactApplicationContext.packageManager
            val applicationInfo = packageManager.getApplicationInfo(
                reactApplicationContext.packageName,
                PackageManager.GET_META_DATA
            )
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

    private fun hasNotificationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                reactApplicationContext,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(
            reactApplicationContext,
            permission
        ) == PackageManager.PERMISSION_GRANTED
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for event emitter
    }

    @ReactMethod
    fun removeListeners(count: Double) {
        // Required for event emitter
    }
}