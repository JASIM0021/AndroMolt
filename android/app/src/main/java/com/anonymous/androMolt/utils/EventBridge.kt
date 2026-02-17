package com.anonymous.androMolt.utils

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

/**
 * Bridge for sending events from native to React Native
 */
object EventBridge {
    private var reactContext: ReactApplicationContext? = null

    fun initialize(context: ReactApplicationContext) {
        reactContext = context
    }

    fun emit(eventName: String, data: JSONObject?) {
        val params = data?.let { jsonToWritableMap(it) } ?: Arguments.createMap()

        reactContext
            ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(eventName, params)
    }

    private fun jsonToWritableMap(json: JSONObject): WritableMap {
        val map = Arguments.createMap()

        val iterator = json.keys()
        while (iterator.hasNext()) {
            val key = iterator.next()
            val value = json.get(key)

            when (value) {
                is String -> map.putString(key, value)
                is Int -> map.putInt(key, value)
                is Double -> map.putDouble(key, value)
                is Boolean -> map.putBoolean(key, value)
                is JSONObject -> map.putMap(key, jsonToWritableMap(value))
                else -> map.putString(key, value.toString())
            }
        }

        return map
    }
}
