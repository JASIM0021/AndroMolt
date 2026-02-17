package com.andromolt.modules

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import com.facebook.react.bridge.*
import org.json.JSONArray
import org.json.JSONObject

class AppLauncherModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AndroMoltAppLauncher"

    // Popular app package mappings for common names
    private val appMappings = mapOf(
        "youtube" to "com.google.android.youtube",
        "whatsapp" to "com.whatsapp",
        "instagram" to "com.instagram.android", 
        "facebook" to "com.facebook.katana",
        "linkedin" to "com.linkedin.android",
        "spotify" to "com.spotify.music",
        "netflix" to "com.netflix.mediaclient",
        "gmail" to "com.google.android.gm",
        "chrome" to "com.android.chrome",
        "maps" to "com.google.android.apps.maps",
        "calculator" to "com.android.calculator2",
        "camera" to "com.android.camera",
        "messages" to "com.android.mms",
        "phone" to "com.android.dialer",
        "settings" to "com.android.settings"
    )

    @ReactMethod
    fun getInstalledApps(promise: Promise) {
        try {
            val packageManager = reactApplicationContext.packageManager
            val installedApps = packageManager.getInstalledApplications(PackageManager.GET_META_DATA)
            val appsArray = WritableNativeArray()

            for (appInfo in installedApps) {
                if (appInfo.flags and ApplicationInfo.FLAG_SYSTEM == 0) { // Only user apps
                    val appMap = WritableNativeMap()
                    
                    try {
                        val appLabel = packageManager.getApplicationLabel(appInfo).toString()
                        val packageName = appInfo.packageName
                        val icon = packageManager.getApplicationIcon(appInfo)
                        
                        appMap.putString("name", appLabel)
                        appMap.putString("packageName", packageName)
                        appMap.putBoolean("isSystemApp", appInfo.flags and ApplicationInfo.FLAG_SYSTEM != 0)
                        
                        // Add common aliases for search
                        val aliases = WritableNativeArray()
                        appMappings.entries.forEach { (name, pkg) ->
                            if (pkg == packageName) {
                                aliases.pushString(name)
                            }
                        }
                        appMap.putArray("aliases", aliases)
                        
                        appsArray.pushMap(appMap)
                    } catch (e: Exception) {
                        // Skip apps that can't be loaded
                    }
                }
            }

            promise.resolve(appsArray)
        } catch (e: Exception) {
            promise.reject("APP_ERROR", "Failed to get installed apps", e)
        }
    }

    @ReactMethod
    fun launchApp(packageName: String, promise: Promise) {
        try {
            // Try exact package name first
            var targetPackage = packageName
            
            // If not a package name, try to resolve from common names
            if (!packageName.contains(".")) {
                targetPackage = appMappings[packageName.lowercase()] ?: packageName
            }

            val packageManager = reactApplicationContext.packageManager
            val launchIntent = packageManager.getLaunchIntentForPackage(targetPackage)
            
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(launchIntent)
                promise.resolve(true)
            } else {
                // Try to find app by name
                val installedApps = packageManager.getInstalledApplications(PackageManager.GET_META_DATA)
                val foundApp = installedApps.find { appInfo ->
                    try {
                        val appLabel = packageManager.getApplicationLabel(appInfo).toString()
                        appLabel.equals(packageName, ignoreCase = true) || 
                        appLabel.lowercase().contains(packageName.lowercase())
                    } catch (e: Exception) {
                        false
                    }
                }

                if (foundApp != null) {
                    val intent = packageManager.getLaunchIntentForPackage(foundApp.packageName)
                    intent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    reactApplicationContext.startActivity(intent)
                    promise.resolve(true)
                } else {
                    promise.reject("APP_NOT_FOUND", "App not found: $packageName")
                }
            }
        } catch (e: Exception) {
            promise.reject("LAUNCH_ERROR", "Failed to launch app: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getAppInfo(packageName: String, promise: Promise) {
        try {
            val packageManager = reactApplicationContext.packageManager
            val appInfo = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
            
            val infoMap = WritableNativeMap()
            infoMap.putString("name", packageManager.getApplicationLabel(appInfo).toString())
            infoMap.putString("packageName", packageName)
            infoMap.putString("versionName", packageManager.getPackageInfo(packageName, 0).versionName)
            infoMap.putInt("versionCode", packageManager.getPackageInfo(packageName, 0).versionCode)
            infoMap.putBoolean("isSystemApp", appInfo.flags and ApplicationInfo.FLAG_SYSTEM != 0)
            
            promise.resolve(infoMap)
        } catch (e: Exception) {
            promise.reject("APP_INFO_ERROR", "Failed to get app info: ${e.message}", e)
        }
    }

    @ReactMethod
    fun searchApps(query: String, promise: Promise) {
        try {
            val packageManager = reactApplicationContext.packageManager
            val installedApps = packageManager.getInstalledApplications(PackageManager.GET_META_DATA)
            val results = WritableNativeArray()

            for (appInfo in installedApps) {
                if (appInfo.flags and ApplicationInfo.FLAG_SYSTEM == 0) { // Only user apps
                    try {
                        val appLabel = packageManager.getApplicationLabel(appInfo).toString().lowercase()
                        val packageName = appInfo.packageName.lowercase()
                        val searchQuery = query.lowercase()

                        if (appLabel.contains(searchQuery) || 
                            packageName.contains(searchQuery) ||
                            appMappings.entries.any { (name, pkg) ->
                                pkg == appInfo.packageName && name.contains(searchQuery)
                            }) {
                            
                            val appMap = WritableNativeMap()
                            appMap.putString("name", packageManager.getApplicationLabel(appInfo).toString())
                            appMap.putString("packageName", appInfo.packageName)
                            
                            results.pushMap(appMap)
                        }
                    } catch (e: Exception) {
                        // Skip apps that can't be loaded
                    }
                }
            }

            promise.resolve(results)
        } catch (e: Exception) {
            promise.reject("SEARCH_ERROR", "Failed to search apps: ${e.message}", e)
        }
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