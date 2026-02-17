package com.anonymous.androMolt.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.anonymous.androMolt.utils.EventBridge
import org.json.JSONObject

/**
 * Foreground Service — keeps the process alive while the agent loop runs in JS.
 * No longer processes an action queue; it only manages the notification lifecycle.
 */
class AndroMoltForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "andromolt_automation"
        const val NOTIFICATION_ID = 1001

        private var instance: AndroMoltForegroundService? = null

        fun updateText(text: String) {
            instance?.updateNotification(text)
        }

        fun setProgress(step: Int, maxSteps: Int) {
            instance?.updateNotification("Step $step/$maxSteps")
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification("AndroMolt agent is running"))

        // Acquire wake lock to keep CPU awake while agent runs
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "AndroMolt::AgentWakeLock"
        ).apply {
            acquire(10 * 60 * 1000L) // 10 minutes max
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Check for cancel action
        if (intent?.action == "CANCEL_AGENT") {
            EventBridge.emit("agentCancelRequested", null)
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "AndroMolt Automation",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Shows when AndroMolt agent is running"
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun createNotification(text: String): Notification {
        // Cancel action
        val cancelIntent = Intent(this, AndroMoltForegroundService::class.java).apply {
            action = "CANCEL_AGENT"
        }
        val cancelPending = PendingIntent.getService(
            this, 1, cancelIntent, PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AndroMolt Agent")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .addAction(android.R.drawable.ic_delete, "Cancel", cancelPending)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, createNotification(text))
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null

        // Release wake lock
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        wakeLock = null
    }
}
