package com.anonymous.androMolt.utils

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.provider.Settings
import android.view.accessibility.AccessibilityManager

/**
 * Helper to check AccessibilityService status
 */
object AccessibilityChecker {

    fun isEnabled(context: Context): Boolean {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)

        val packageName = context.packageName
        val serviceName = "com.anonymous.androMolt.accessibility.AndroMoltAccessibilityService"

        return enabledServices.any {
            val id = it.id
            id.contains(packageName) && id.contains(serviceName)
        }
    }

    fun getEnabledServiceNames(context: Context): List<String> {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
        return enabledServices.map { it.id }
    }
}
