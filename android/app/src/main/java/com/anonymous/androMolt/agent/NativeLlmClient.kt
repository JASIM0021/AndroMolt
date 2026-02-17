package com.anonymous.androMolt.agent

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

data class AgentAction(
    val action: String,
    val params: Map<String, Any>,
    val reasoning: String
)

class NativeLlmClient(private val context: Context) {

    companion object {
        private const val TAG = "NativeLlmClient"
        private const val TIMEOUT_SECONDS = 30L
        private const val OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
        private const val GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent"
    }

    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    // API keys - will be set from React Native or config
    var openaiApiKey: String? = null
    var geminiApiKey: String? = null

    fun getNextAction(
        goal: String,
        screenSnapshot: String,
        step: Int,
        maxSteps: Int
    ): AgentAction {
        try {
            val prompt = buildPrompt(goal, screenSnapshot, step, maxSteps)

            // Try OpenAI first
            if (!openaiApiKey.isNullOrBlank()) {
                try {
                    val response = callOpenAI(prompt)
                    val action = parseActionFromResponse(response)
                    if (action != null) {
                        Log.d(TAG, "OpenAI returned action: ${action.action}")
                        return action
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "OpenAI call failed: ${e.message}")
                }
            }

            // Fallback to Gemini
            if (!geminiApiKey.isNullOrBlank()) {
                try {
                    val response = callGemini(prompt)
                    val action = parseActionFromResponse(response)
                    if (action != null) {
                        Log.d(TAG, "Gemini returned action: ${action.action}")
                        return action
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Gemini call failed: ${e.message}")
                }
            }

            // Fallback to heuristics
            Log.d(TAG, "Using fallback heuristics")
            return getFallbackAction(goal, screenSnapshot, step)

        } catch (e: Exception) {
            Log.e(TAG, "Error in getNextAction", e)
            return getFallbackAction(goal, screenSnapshot, step)
        }
    }

    private fun buildPrompt(goal: String, screenSnapshot: String, step: Int, maxSteps: Int): String {
        return """
You are an AI agent controlling an Android device to complete user goals.

GOAL: $goal

CURRENT SCREEN (step $step/$maxSteps):
$screenSnapshot

Your task: Analyze the screen and decide the NEXT SINGLE ACTION to take.

Available actions:
- open_app: Open an app (e.g., {"packageName": "com.google.android.youtube"})
- click_by_text: Click element by visible text (e.g., {"text": "Search"})
- click_by_content_desc: Click element by accessibility description (e.g., {"desc": "Play"})
- click_by_index: Click element by index [0-149] (e.g., {"index": 5})
- input_text: Type text into focused field (e.g., {"text": "hello world"})
- press_enter: Press enter/submit (will try keyboard search button first)
- scroll: Scroll down
- back: Press back button (USE SPARINGLY - only when truly stuck)
- wait: Wait briefly (e.g., {"ms": 2000})
- complete_task: Goal is achieved

CRITICAL RULES:
1. Return ONLY valid JSON in this exact format:
{
  "action": "action_name",
  "params": {"key": "value"},
  "reasoning": "brief explanation"
}

2. If step 1-2 and goal mentions an app (YouTube, WhatsApp, etc.), use "open_app" with package name

3. **IMPORTANT: For video/content results (YouTube videos, songs, posts, articles):**
   - ALWAYS prefer "click_by_text" with the title/name
   - Extract the video title from the screen (look for quoted text)
   - Example: {"action": "click_by_text", "params": {"text": "Main Yahaan Hoon"}, "reasoning": "..."}
   - ONLY use "click_by_index" if NO text is available (rare - most content has titles)

4. Use "click_by_index" ONLY for UI elements WITHOUT text:
   - Icons, buttons without labels, search icons
   - NOT for video thumbnails, song names, posts, articles

5. If you see search RESULTS (videos, items, posts), click a result by TEXT - DON'T search again!

6. Choose the MOST RELIABLE action (prefer text > desc > index)

7. If goal seems complete, use "complete_task"

8. AVOID "back" action unless absolutely stuck - don't go back to launcher

9. NO markdown, NO explanations outside JSON

Common app packages:
- YouTube: com.google.android.youtube
- WhatsApp: com.whatsapp
- Chrome: com.android.chrome
- Gmail: com.google.android.gm

YouTube Ad Handling:
- If you see "Skip Ad", "Skip in X", or an ad overlay on YouTube, an ad is playing
- If a "Skip Ad" or "Skip" button is visible: click_by_text {"text":"Skip Ad"} immediately
- If no skip button yet (countdown running): use wait {"ms":5000} to wait for it
- Do NOT click video thumbnails or anything else while an ad is visible

WhatsApp Messaging (send X to Y pattern):
STEP ORDER IS CRITICAL - follow exactly:
1. open_app WhatsApp
2. click_by_content_desc {"desc":"Search"} (the magnifier icon)
3. input_text {"text":"<contact name only>"} - type ONLY the person's name, NOT the message
4. click_by_text {"text":"<contact name>"} - click the contact when it appears in results
5. click on the message input field at the bottom of the chat
6. input_text {"text":"<message text>"}
7. click_by_content_desc {"desc":"Send"} or click_by_text {"text":"Send"}
NEVER search for the message content - only search for the contact name.

General multi-step rules:
- After searching and results appear, your NEXT action must CLICK a result - never type again
- Never type a new search query when you can already see the result you need

YouTube Search Rule:
- If goal says "play X" or "search for X" and you are on the YouTube home/feed (home
  recommendations visible, no active search bar), you MUST search first:
  1. click_by_content_desc {"desc":"Search"} OR click_by_text {"text":"Search"}
  2. input_text {"text":"<search query>"}
  3. press_enter
  Then click a result from the search results page.
- Do NOT click home-feed recommendations — they are unrelated content, not what was requested.
- If a YouTube video is playing (full-screen player with timeline/progress bar visible),
  use complete_task immediately — the goal is achieved.

YouTube Mini-Player / Now Playing:
- If you see a mini-player bar at the bottom (small video thumbnail + title + X button),
  the video has started. Tap it or use complete_task — do NOT try to click the search result again.
- If you see a full-screen video player with a seek bar, the task is complete.

Respond now with ONLY the JSON action:
""".trimIndent()
    }

    private fun callOpenAI(prompt: String): String {
        val requestBody = JsonObject().apply {
            addProperty("model", "gpt-4o-mini")
            add("messages", gson.toJsonTree(listOf(
                mapOf("role" to "user", "content" to prompt)
            )))
            addProperty("temperature", 0.3)
            addProperty("max_tokens", 200)
        }

        val request = Request.Builder()
            .url(OPENAI_API_URL)
            .post(requestBody.toString().toRequestBody("application/json".toMediaType()))
            .addHeader("Authorization", "Bearer $openaiApiKey")
            .addHeader("Content-Type", "application/json")
            .build()

        okHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw Exception("OpenAI API error: ${response.code}")
            }
            val responseBody = response.body?.string() ?: throw Exception("Empty response")
            val jsonResponse = gson.fromJson(responseBody, JsonObject::class.java)
            return jsonResponse
                .getAsJsonArray("choices")
                .get(0).asJsonObject
                .getAsJsonObject("message")
                .get("content").asString
        }
    }

    private fun callGemini(prompt: String): String {
        val requestBody = JsonObject().apply {
            add("contents", gson.toJsonTree(listOf(
                mapOf("parts" to listOf(mapOf("text" to prompt)))
            )))
            add("generationConfig", gson.toJsonTree(mapOf(
                "temperature" to 0.3,
                "maxOutputTokens" to 200
            )))
        }

        val request = Request.Builder()
            .url("$GEMINI_API_URL?key=$geminiApiKey")
            .post(requestBody.toString().toRequestBody("application/json".toMediaType()))
            .addHeader("Content-Type", "application/json")
            .build()

        okHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw Exception("Gemini API error: ${response.code}")
            }
            val responseBody = response.body?.string() ?: throw Exception("Empty response")
            val jsonResponse = gson.fromJson(responseBody, JsonObject::class.java)
            return jsonResponse
                .getAsJsonArray("candidates")
                .get(0).asJsonObject
                .getAsJsonObject("content")
                .getAsJsonArray("parts")
                .get(0).asJsonObject
                .get("text").asString
        }
    }

    private fun parseActionFromResponse(response: String): AgentAction? {
        try {
            // Extract JSON from response (handle markdown code blocks)
            var jsonStr = response.trim()
            if (jsonStr.startsWith("```json")) {
                jsonStr = jsonStr.removePrefix("```json").removeSuffix("```").trim()
            } else if (jsonStr.startsWith("```")) {
                jsonStr = jsonStr.removePrefix("```").removeSuffix("```").trim()
            }

            val jsonObject = gson.fromJson(jsonStr, JsonObject::class.java)
            val action = jsonObject.get("action")?.asString ?: return null
            val reasoning = jsonObject.get("reasoning")?.asString ?: ""

            val params = mutableMapOf<String, Any>()
            jsonObject.getAsJsonObject("params")?.let { paramsObj ->
                for (key in paramsObj.keySet()) {
                    val value = paramsObj.get(key)
                    params[key] = when {
                        value.isJsonPrimitive && value.asJsonPrimitive.isString -> value.asString
                        value.isJsonPrimitive && value.asJsonPrimitive.isNumber -> value.asInt
                        value.isJsonPrimitive && value.asJsonPrimitive.isBoolean -> value.asBoolean
                        else -> value.toString()
                    }
                }
            }

            return AgentAction(action, params, reasoning)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse action from response: $response", e)
            return null
        }
    }

    private fun getFallbackAction(goal: String, screenSnapshot: String, step: Int): AgentAction {
        // Use FallbackHeuristics for rule-based automation
        return FallbackHeuristics.getNextAction(goal, screenSnapshot, step)
    }
}
