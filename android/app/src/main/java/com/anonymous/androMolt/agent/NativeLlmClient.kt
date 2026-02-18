package com.anonymous.androMolt.agent

import android.content.Context
import android.util.Base64
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
        private const val GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
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
        maxSteps: Int,
        screenshot: android.graphics.Bitmap? = null,
        isQaMode: Boolean = false
    ): AgentAction {
        try {
            val prompt = buildPrompt(goal, screenSnapshot, step, maxSteps, isQaMode)

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

            // Try Gemini Vision if screenshot available
            if (!geminiApiKey.isNullOrBlank() && screenshot != null) {
                try {
                    val response = callGeminiVision(prompt, screenshot)
                    val action = parseActionFromResponse(response)
                    if (action != null) {
                        Log.d(TAG, "Gemini Vision returned action: ${action.action}")
                        return action
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Gemini Vision call failed: ${e.message}")
                }
            }

            // Fallback to Gemini text-only
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

    private fun buildPrompt(goal: String, screenSnapshot: String, step: Int, maxSteps: Int, isQaMode: Boolean = false): String {
        return ("""
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

WhatsApp Messaging — IDENTIFY YOUR SCREEN STATE FIRST, then act:

SCREEN A — WhatsApp home (past-chat list + tab bar Chats/Status/Calls + "New chat" FAB):
  → click_by_content_desc {"desc":"New chat"}

SCREEN B — Contact-search screen (title bar says "New chat"; EditText "To:" at top; list empty or short):
  → YOU ARE ALREADY ON THE RIGHT SCREEN. DO NOT click "New chat" again.
  → input_text {"text":"<contact name OR phone number from goal>"}

SCREEN C — Search results (contact names/numbers listed below the search bar):
  → click_by_text {"text":"<exact name or number you just searched>"}
  → This is MANDATORY before typing any message — you are NOT in the chat yet.

SCREEN D — Chat/conversation (message input bar at very bottom, chat bubbles above):
  STEP 1: If the message input appears EMPTY → input_text {"text":"<message from goal>"}
  STEP 2: As soon as the message text is visible in the input → click_by_content_desc {"desc":"Send"}
  CRITICAL: If you see the message text already typed in the input field (e.g. "hi" is visible),
    your action MUST be click_by_content_desc {"desc":"Send"} — NEVER type it again.
  The send button is the green arrow button; its content description is "Send".

SCREEN E — Message SENT (your message appears as a green chat bubble with a timestamp + tick marks):
  → complete_task IMMEDIATELY — the message has been delivered, the goal is achieved.
  → Signs the message was sent: green/blue chat bubble on the right side with "✓" or "✓✓" marks,
    input field shows "Type a message" or "Message" placeholder (now empty), microphone button
    visible instead of the Send arrow.
  → DO NOT click Send on an empty input — that does nothing and the task is already done.

HOW TO TELL WHICH SCREEN:
- Screen A: many chat threads visible, coloured circular "New chat" button bottom-right
- Screen B: only a To:/search field at top and a short/empty contact list; title = "New chat"
- Screen C: a filled list of contacts or phone numbers shown below the search bar
- Screen D: a "Type a message" / "Message" input pinned to the bottom; previous messages visible

CRITICAL:
- After typing in the search (Screen B) and results appear (Screen C), ALWAYS click the
  result BEFORE typing the message. Skipping this step means you are not in the chat yet.
- The search term can be a contact name OR a phone number — search for exactly what the
  goal says, then click the matching entry in the list.
- On Screen D: you only need to type the message ONCE. If the message is already in the
  input field, skip straight to clicking Send. Typing again will just append duplicate text.
NEVER use the top-right magnifier — it opens media search, not contacts.
If you see "Ask Meta AI or Search" or filter chips (Unread/Photos/Videos), press back,
then use "New chat".

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
""" + if (isQaMode) """

QA TESTER MODE — You are acting as an Android QA engineer:
1. For each action, evaluate: did the expected UI element/response appear?
2. Prefix your reasoning with [PASS] if the step behaved correctly, or [FAIL] if:
   - Expected element not found
   - Error message appeared
   - Screen is blank/stuck
   - Loading spinner did not resolve
3. At the end of the test, use complete_task with reasoning summarising findings.
4. You are testing, so be more thorough — check for empty states, errors, and edge cases.
""" else "").trimIndent()
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

    private fun callGeminiVision(prompt: String, bitmap: android.graphics.Bitmap): String {
        // Scale down to max 768px wide to limit token usage
        val scale = minOf(1f, 768f / bitmap.width)
        val scaled = android.graphics.Bitmap.createScaledBitmap(
            bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true
        )
        val stream = java.io.ByteArrayOutputStream()
        scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, stream)
        val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
        // Only recycle when createScaledBitmap returned a new instance; never recycle the caller's bitmap
        if (scaled !== bitmap) scaled.recycle()

        val requestBody = JsonObject().apply {
            add("contents", gson.toJsonTree(listOf(mapOf("parts" to listOf(
                mapOf("inline_data" to mapOf("mime_type" to "image/jpeg", "data" to base64)),
                mapOf("text" to prompt)
            )))))
            add("generationConfig", gson.toJsonTree(mapOf(
                "temperature" to 0.3, "maxOutputTokens" to 200
            )))
        }

        val request = Request.Builder()
            .url("$GEMINI_API_URL?key=$geminiApiKey")
            .post(requestBody.toString().toRequestBody("application/json".toMediaType()))
            .addHeader("Content-Type", "application/json")
            .build()

        okHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("Gemini Vision error: ${response.code}")
            val body = response.body?.string() ?: throw Exception("Empty response")
            val json = gson.fromJson(body, JsonObject::class.java)
            return json.getAsJsonArray("candidates").get(0).asJsonObject
                .getAsJsonObject("content").getAsJsonArray("parts")
                .get(0).asJsonObject.get("text").asString
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
