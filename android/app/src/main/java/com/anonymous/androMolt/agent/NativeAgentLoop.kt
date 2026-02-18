package com.anonymous.androMolt.agent

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.anonymous.androMolt.accessibility.AccessibilityController
import com.anonymous.androMolt.accessibility.UiSnapshot
import com.anonymous.androMolt.accessibility.UiTreeBuilder
import com.anonymous.androMolt.utils.EventBridge
import org.json.JSONObject
import java.security.MessageDigest

data class AgentConfig(
    val maxSteps: Int = 30,
    val actionDelayMs: Long = 2000,
    val stuckThreshold: Int = 4  // Increased from 3 to 4 to be less aggressive
)

data class AgentResult(
    val success: Boolean,
    val message: String,
    val steps: Int
)

class NativeAgentLoop(
    private val context: Context,
    private val llmClient: NativeLlmClient
) {

    companion object {
        private const val TAG = "NativeAgentLoop"
        @Volatile var activeLoop: NativeAgentLoop? = null
    }

    @Volatile
    private var running = false
    private val handler = Handler(Looper.getMainLooper())
    private val config = AgentConfig(maxSteps = 20, actionDelayMs = 2000, stuckThreshold = 4)

    fun run(goal: String, onComplete: (AgentResult) -> Unit) {
        if (running) {
            Log.w(TAG, "Agent loop already running")
            return
        }

        activeLoop = this
        running = true
        Log.i(TAG, "Starting native agent loop for goal: $goal")

        // Run in background thread
        Thread {
            try {
                val result = runLoop(goal)
                handler.post { onComplete(result) }
            } catch (e: Exception) {
                Log.e(TAG, "Agent loop crashed", e)
                handler.post {
                    onComplete(AgentResult(false, "Error: ${e.message}", 0))
                }
            } finally {
                running = false
                activeLoop = null
            }
        }.start()
    }

    fun cancel() {
        running = false
        Log.i(TAG, "Agent loop cancelled")
    }

    private fun runLoop(goal: String): AgentResult {
        // Extract TARGET_APP if present and determine QA mode
        val targetAppMatch = Regex("""\[TARGET_APP:([^\]]+)\]""").find(goal)
        val targetPackage = targetAppMatch?.groupValues?.get(1)
        val cleanGoal = goal.replace(targetAppMatch?.value ?: "", "").trim()
        val isQaMode = targetPackage != null ||
            Regex("(?i)\\b(test|check|verify|qa|assert|validate)\\b").containsMatchIn(cleanGoal)
        val testSteps = mutableListOf<TestStep>()

        var step = 0
        val screenHashes = mutableListOf<String>()
        var consecutiveFailures = 0
        var lastClickAction: String? = null
        var sameActionClickCount = 0

        emitEvent("agentStart", mapOf("goal" to cleanGoal))

        // Pre-launch: force-fresh open the target app if identifiable from goal
        (targetPackage ?: detectTargetPackage(cleanGoal))?.let { pkg ->
            preLaunchAppFresh(pkg)
        }

        while (running && step < config.maxSteps) {
            step++
            Log.d(TAG, "=== Step $step/${config.maxSteps} ===")

            // 1. OBSERVE
            val snapshot = AccessibilityController.getUiSnapshot()
            if (snapshot == null) {
                Log.w(TAG, "No UI snapshot available, waiting...")
                emitEvent("agentThink", mapOf("message" to "Waiting for UI access..."))
                Thread.sleep(config.actionDelayMs)
                continue
            }

            val compactSnapshot = UiTreeBuilder.toCompactString(snapshot)
            emitEvent("agentStep", mapOf(
                "step" to step,
                "package" to snapshot.packageName,
                "elementCount" to snapshot.nodes.size
            ))

            // 2. STUCK DETECTION
            val hash = hashScreen(snapshot.packageName, snapshot.nodes.size, compactSnapshot)
            screenHashes.add(hash)

            // Stuck detection: same screen OR same action repeated config.stuckThreshold+ times
            val isStuckOnScreen = isStuck(screenHashes)
            val isStuckOnAction = sameActionClickCount >= config.stuckThreshold

            if (isStuckOnScreen || isStuckOnAction) {
                if (isStuckOnAction) {
                    Log.w(TAG, "Stuck repeating same action ${sameActionClickCount} times ($lastClickAction), trying scroll")
                    emitEvent("agentThink", mapOf("message" to "Stuck repeating same action, scrolling to find other elements"))
                    AccessibilityController.scrollDown()
                    sameActionClickCount = 0
                    lastClickAction = null
                } else {
                    val snapLower = compactSnapshot.lowercase()
                    val onWhatsApp = snapshot.packageName.contains("whatsapp", ignoreCase = true)
                    when {
                        // Still in chat with text in input → click Send to unblock
                        onWhatsApp && snapLower.contains("send") && snapLower.contains("editable") -> {
                            Log.w(TAG, "Stuck in WhatsApp chat with text — clicking Send instead of Back")
                            emitEvent("agentThink", mapOf("message" to "Stuck in chat, clicking Send to unblock"))
                            AccessibilityController.clickByContentDesc("Send")
                        }
                        // Input is now empty (shows placeholder) → message was sent, task done
                        onWhatsApp && snapLower.contains("type a message") -> {
                            Log.w(TAG, "WhatsApp message sent (empty input), completing task")
                            emitEvent("agentComplete", mapOf("steps" to step, "message" to "Message sent successfully"))
                            val waResult = AgentResult(true, "Message sent to contact", step)
                            emitQaReportIfNeeded(isQaMode, waResult, testSteps, cleanGoal, targetPackage)
                            return waResult
                        }
                        else -> {
                            Log.w(TAG, "Stuck detection triggered (same screen + ${consecutiveFailures} failures), pressing back")
                            emitEvent("agentThink", mapOf("message" to "Stuck on same screen with failures, going back"))
                            AccessibilityController.pressBack()
                        }
                    }
                }
                screenHashes.clear()  // Clear history after recovery attempt
                consecutiveFailures = 0
                Thread.sleep(config.actionDelayMs)
                continue
            }

            // 3. SELF-HEALING - if back on AndroMolt, move to background
            if (step > 1 && snapshot.packageName.contains("andromolt", ignoreCase = true)) {
                Log.w(TAG, "Self-healing: Back on AndroMolt, moving to background")
                emitEvent("agentThink", mapOf("message" to "Moving AndroMolt to background"))
                moveToBackground()
                Thread.sleep(1500)
                continue
            }

            // 4. PLAN - Get next action from LLM or fallback
            Log.d(TAG, "Getting next action from planner")
            val screenshot = AccessibilityController.takeScreenshot()
            val action = try {
                llmClient.getNextAction(cleanGoal, compactSnapshot, step, config.maxSteps, screenshot, isQaMode)
            } finally {
                screenshot?.recycle()
            }

            emitEvent("agentAction", mapOf(
                "action" to action.action,
                "params" to action.params.toString(),
                "reasoning" to action.reasoning
            ))
            Log.i(TAG, "Action: ${action.action}, Reasoning: ${action.reasoning}")

            // 5. DONE CHECK
            if (action.action == "complete_task") {
                Log.i(TAG, "Task completed!")
                emitEvent("agentComplete", mapOf("steps" to step, "message" to action.reasoning))
                val completeResult = AgentResult(true, action.reasoning, step)
                emitQaReportIfNeeded(isQaMode, completeResult, testSteps, cleanGoal, targetPackage)
                return completeResult
            }

            // 6. ACT - Execute the action
            // Capture fresh snapshot to ensure we search in current UI state
            val freshSnapshot = AccessibilityController.getUiSnapshot()
            val outcome = if (freshSnapshot != null) {
                Log.d(TAG, "Captured fresh snapshot before action (${freshSnapshot.nodes.size} nodes)")
                executeActionWithSnapshot(action, freshSnapshot)
            } else {
                Log.w(TAG, "Failed to capture fresh snapshot before action, using fallback")
                executeAction(action)
            }
            emitEvent("actionResult", mapOf(
                "success" to outcome.success,
                "message" to outcome.message
            ))
            Log.d(TAG, "Action outcome: ${outcome.message}")

            // Accumulate test steps in QA mode
            if (isQaMode) {
                val passed = outcome.success && !action.reasoning.startsWith("[FAIL]", ignoreCase = true)
                testSteps.add(TestStep(
                    step = step,
                    action = action.action,
                    params = action.params.toString(),
                    reasoning = action.reasoning.removePrefix("[PASS]").removePrefix("[FAIL]").trim(),
                    outcome = outcome.message,
                    passed = passed
                ))
            }

            // Track repeated click actions to detect stuck loops
            if (action.action in listOf("click_by_index", "click_by_text", "click_by_content_desc")) {
                val actionKey = "${action.action}:${action.params}"
                if (actionKey == lastClickAction) {
                    sameActionClickCount++
                    Log.d(TAG, "Same action repeated ${sameActionClickCount} times: $actionKey")
                } else {
                    sameActionClickCount = 1
                    lastClickAction = actionKey
                }
            } else {
                // Reset tracking for non-click actions
                sameActionClickCount = 0
                lastClickAction = null
            }

            // Track consecutive failures for stuck detection
            if (!outcome.success) {
                consecutiveFailures++
                emitEvent("agentThink", mapOf("message" to "Action failed: ${outcome.message} (failure #${consecutiveFailures})"))
            } else {
                consecutiveFailures = 0  // Reset on success
            }

            // 7. SETTLE - Wait for UI to update
            Thread.sleep(config.actionDelayMs)
        }

        // Max steps reached
        val finalMessage = if (step >= config.maxSteps) {
            "Max steps (${config.maxSteps}) reached"
        } else {
            "Agent stopped"
        }

        Log.w(TAG, finalMessage)
        emitEvent("agentComplete", mapOf("steps" to step, "message" to finalMessage))
        val finalResult = AgentResult(false, finalMessage, step)
        emitQaReportIfNeeded(isQaMode, finalResult, testSteps, cleanGoal, targetPackage)
        return finalResult
    }

    private fun executeAction(action: AgentAction): com.anonymous.androMolt.accessibility.ActionOutcome {
        return when (action.action) {
            "click_by_text" -> {
                val text = action.params["text"] as? String ?: ""
                AccessibilityController.clickByText(text)
            }
            "click_by_content_desc" -> {
                val desc = action.params["desc"] as? String ?: ""
                AccessibilityController.clickByContentDesc(desc)
            }
            "click_by_index" -> {
                val index = when (val idx = action.params["index"]) {
                    is Int -> idx
                    is Double -> idx.toInt()
                    is String -> idx.toIntOrNull() ?: 0
                    else -> 0
                }
                val snapshot = AccessibilityController.getUiSnapshot()
                if (snapshot != null) {
                    AccessibilityController.clickByIndex(index, snapshot)
                } else {
                    com.anonymous.androMolt.accessibility.ActionOutcome(false, "No UI snapshot available")
                }
            }
            "input_text" -> {
                val text = action.params["text"] as? String ?: ""
                AccessibilityController.inputText(text)
            }
            "press_enter" -> {
                AccessibilityController.pressEnter()
            }
            "scroll" -> {
                AccessibilityController.scrollDown()
            }
            "back" -> {
                AccessibilityController.pressBack()
            }
            "open_app" -> {
                val packageName = action.params["packageName"] as? String ?: ""
                AccessibilityController.openApp(context, packageName)
            }
            "wait" -> {
                val ms = when (val duration = action.params["ms"]) {
                    is Int -> duration
                    is Double -> duration.toInt()
                    is String -> duration.toIntOrNull() ?: 2000
                    else -> 2000
                }
                Thread.sleep(ms.toLong())
                com.anonymous.androMolt.accessibility.ActionOutcome(true, "Waited ${ms}ms")
            }
            "complete_task" -> {
                com.anonymous.androMolt.accessibility.ActionOutcome(true, "Task completed")
            }
            else -> {
                com.anonymous.androMolt.accessibility.ActionOutcome(false, "Unknown action: ${action.action}")
            }
        }
    }

    private fun executeActionWithSnapshot(action: AgentAction, snapshot: UiSnapshot): com.anonymous.androMolt.accessibility.ActionOutcome {
        return when (action.action) {
            "click_by_text" -> {
                val text = action.params["text"] as? String ?: ""
                AccessibilityController.clickByTextWithSnapshot(text, snapshot)
            }
            "click_by_index" -> {
                val index = when (val idx = action.params["index"]) {
                    is Int -> idx
                    is Double -> idx.toInt()
                    is String -> idx.toIntOrNull() ?: 0
                    else -> 0
                }
                AccessibilityController.clickByIndex(index, snapshot)
            }
            // Other actions don't benefit from snapshot-based search
            else -> executeAction(action)
        }
    }

    private fun isStuck(hashes: List<String>): Boolean {
        if (hashes.size < config.stuckThreshold) return false

        // Check if last N hashes are identical
        val recent = hashes.takeLast(config.stuckThreshold)
        val allSame = recent.distinct().size == 1

        if (allSame) {
            Log.w(TAG, "Stuck detected: same screen hash ${config.stuckThreshold} times")
        }

        return allSame
    }

    private fun hashScreen(packageName: String, elementCount: Int, compactSnapshot: String): String {
        // Better hash: package name + element count + first clickable element
        val lines = compactSnapshot.lines()
        val firstClickable = lines.find { it.contains("clickable") }?.take(50) ?: ""

        val hashInput = "$packageName:$elementCount:$firstClickable"

        // Use MD5 for a more reliable hash
        return try {
            val md = MessageDigest.getInstance("MD5")
            val digest = md.digest(hashInput.toByteArray())
            digest.joinToString("") { "%02x".format(it) }.take(16)
        } catch (e: Exception) {
            hashInput.hashCode().toString()
        }
    }

    private fun moveToBackground() {
        try {
            val intent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to move to background", e)
        }
    }

    private fun emitQaReportIfNeeded(
        isQaMode: Boolean,
        result: AgentResult,
        testSteps: List<TestStep>,
        cleanGoal: String,
        targetPackage: String?
    ) {
        if (!isQaMode) return
        try {
            val passedCount = testSteps.count { it.passed }
            val overallPassed = result.success && passedCount > testSteps.size / 2
            val testRun = TestRun(
                goal = cleanGoal,
                targetApp = targetPackage,
                timestamp = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss",
                    java.util.Locale.US).format(java.util.Date()),
                overallPassed = overallPassed,
                totalSteps = testSteps.size,
                passedSteps = passedCount,
                failedSteps = testSteps.size - passedCount,
                steps = testSteps,
                summary = result.message
            )
            val savedPath = try {
                QaReportWriter.write(context, testRun)
            } catch (e: Exception) {
                Log.w(TAG, "QA report write failed: ${e.message}")
                "save_failed"
            }
            emitEvent("agentReport", mapOf(
                "overallPassed" to overallPassed,
                "passedSteps" to passedCount,
                "failedSteps" to (testSteps.size - passedCount),
                "totalSteps" to testSteps.size,
                "savedPath" to savedPath,
                "goal" to cleanGoal
            ))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit QA report", e)
        }
    }

    private fun emitEvent(eventName: String, data: Map<String, Any>) {
        try {
            val jsonData = JSONObject()
            for ((key, value) in data) {
                when (value) {
                    is String -> jsonData.put(key, value)
                    is Int -> jsonData.put(key, value)
                    is Boolean -> jsonData.put(key, value)
                    is Double -> jsonData.put(key, value)
                    else -> jsonData.put(key, value.toString())
                }
            }
            EventBridge.emit(eventName, jsonData)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit event $eventName", e)
        }
    }

    private fun detectTargetPackage(goal: String): String? {
        val g = goal.lowercase()
        return when {
            "whatsapp" in g                          -> "com.whatsapp"
            "youtube" in g                           -> "com.google.android.youtube"
            "gmail" in g || "email" in g             -> "com.google.android.gm"
            "chrome" in g || "browser" in g          -> "com.android.chrome"
            "instagram" in g                         -> "com.instagram.android"
            "twitter" in g || "x.com" in g           -> "com.twitter.android"
            "facebook" in g                          -> "com.facebook.katana"
            "maps" in g || "google maps" in g        -> "com.google.android.apps.maps"
            "spotify" in g                           -> "com.spotify.music"
            "netflix" in g                           -> "com.netflix.mediaclient"
            "telegram" in g                          -> "org.telegram.messenger"
            "snapchat" in g                          -> "com.snapchat.android"
            else                                     -> null
        }
    }

    private fun preLaunchAppFresh(packageName: String) {
        try {
            val intent = context.packageManager.getLaunchIntentForPackage(packageName)
                ?: return
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            context.startActivity(intent)
            Log.i(TAG, "Pre-launched $packageName fresh (task cleared)")
            emitEvent("agentThink", mapOf("message" to "Launching $packageName fresh from start..."))
            Thread.sleep(2500)  // Allow app to fully cold-start before step 1
        } catch (e: Exception) {
            Log.w(TAG, "Pre-launch failed for $packageName: ${e.message}")
        }
    }

}
