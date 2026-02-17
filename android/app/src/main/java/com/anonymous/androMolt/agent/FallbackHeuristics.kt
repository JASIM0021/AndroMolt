package com.anonymous.androMolt.agent

import android.util.Log

object FallbackHeuristics {

    private const val TAG = "FallbackHeuristics"

    fun getNextAction(goal: String, screenSnapshot: String, step: Int): AgentAction {
        val goalLower = goal.lowercase()
        val screenLower = screenSnapshot.lowercase()

        // Parse package name from screen snapshot
        val packageName = extractPackageName(screenSnapshot)
        val isOnAndroMolt = packageName.contains("andromolt", ignoreCase = true)

        Log.d(TAG, "Heuristic analysis - Step: $step, Package: $packageName")

        // YouTube Ad: detect and skip
        if (packageName.contains("youtube", ignoreCase = true) &&
            (screenLower.contains("skip") || screenLower.contains(" ad "))) {
            Log.d(TAG, "Heuristic: YouTube ad detected, clicking Skip Ad")
            return AgentAction(
                action = "click_by_text",
                params = mapOf("text" to "Skip Ad"),
                reasoning = "Fallback: YouTube ad detected, clicking Skip Ad"
            )
        }

        // WhatsApp: screen-state–based navigation
        if (packageName.contains("whatsapp", ignoreCase = true)) {
            val contactOrNumber = extractWhatsAppContactOrNumber(goalLower)

            // SCREEN B: "New chat" title present + editable/focused field → type contact/number
            val isNewChatSearchScreen = screenLower.contains("new chat") &&
                (screenLower.contains("editable") || screenLower.contains("focused"))
            // SCREEN C: search results list visible below search bar
            val hasSearchResults = screenLower.contains("contacts on whatsapp") ||
                (!contactOrNumber.isNullOrBlank() && screenLower.contains(contactOrNumber.lowercase()))

            if (isNewChatSearchScreen && !hasSearchResults && !contactOrNumber.isNullOrBlank()) {
                Log.d(TAG, "Heuristic: WhatsApp Screen B — typing: $contactOrNumber")
                return AgentAction(
                    action = "input_text",
                    params = mapOf("text" to contactOrNumber),
                    reasoning = "Fallback: New Chat search screen, typing: $contactOrNumber"
                )
            }

            if (hasSearchResults && !contactOrNumber.isNullOrBlank()) {
                Log.d(TAG, "Heuristic: WhatsApp Screen C — clicking result: $contactOrNumber")
                return AgentAction(
                    action = "click_by_text",
                    params = mapOf("text" to contactOrNumber),
                    reasoning = "Fallback: Contact/number results visible, clicking: $contactOrNumber"
                )
            }

            // SCREEN D: inside a chat — type the message
            val isInChat = screenLower.contains("type a message") ||
                (screenLower.contains("editable") && screenLower.contains("message"))
            if (isInChat) {
                val message = extractWhatsAppMessage(goalLower)
                if (!message.isNullOrBlank()) {
                    Log.d(TAG, "Heuristic: WhatsApp Screen D — typing message: $message")
                    return AgentAction(
                        action = "input_text",
                        params = mapOf("text" to message),
                        reasoning = "Fallback: In chat, typing message: $message"
                    )
                }
            }
        }

        // 1. Open app (step 1-3) - if goal mentions app name and still on AndroMolt or launcher
        // Also handle case where we're on home screen
        val targetApp = extractTargetApp(goalLower)
        if (targetApp != null && step <= 3) {
            val isOnLauncher = packageName.contains("launcher", ignoreCase = true)
                || packageName.contains("trebuchet", ignoreCase = true)
                || packageName == "com.android.launcher3"

            if (isOnAndroMolt || isOnLauncher) {
                Log.d(TAG, "Heuristic: Open app $targetApp (on $packageName)")
                return AgentAction(
                    action = "open_app",
                    params = mapOf("packageName" to targetApp),
                    reasoning = "Opening target app: $targetApp"
                )
            }
        }

        // 2. Click first result - if search results visible (MOVED UP - higher priority than search button)
        if (packageName.contains("youtube", ignoreCase = true)) {
            // Check if we're on YouTube Shorts (different UI, needs scrolling)
            val isShorts = screenLower.contains("shorts") &&
                          (screenLower.contains("subscribe") || screenLower.contains("like"))

            if (isShorts && step > 3) {
                // On Shorts page - scroll down to find regular videos
                Log.d(TAG, "Heuristic: On YouTube Shorts, scrolling to find regular videos")
                return AgentAction(
                    action = "scroll",
                    params = emptyMap(),
                    reasoning = "Scrolling past Shorts to find regular video results"
                )
            }

            // Check if we're on search results page (many elements, not on home)
            val hasResults = screenSnapshot.split("\n").size > 15
            val hasVideoElements = screenLower.contains("views") || screenLower.contains("ago") ||
                                   screenLower.contains("duration") || screenLower.contains("verified")

            if (hasResults || hasVideoElements) {
                // First try to find and click by text - more reliable than index
                val lines = screenSnapshot.split("\n")

                // Look for video titles (usually contain Hindi/English text, views, duration)
                for ((index, line) in lines.withIndex()) {
                    // Skip early indices (0-5 are usually headers/navigation)
                    if (index < 6) continue
                    if (index > 20) break  // Don't go too far down

                    // Video results typically have:
                    // - Text content (title)
                    // - Are clickable
                    // - NOT search/home/navigation buttons
                    val hasText = line.contains("\"") && line.length > 50  // Has meaningful text
                    val isClickable = line.contains("clickable", ignoreCase = true)
                    val isNotButton = !line.contains("button", ignoreCase = true)
                    val isNotNav = !line.contains("search", ignoreCase = true) &&
                                   !line.contains("home", ignoreCase = true) &&
                                   !line.contains("shorts", ignoreCase = true) &&
                                   !line.contains("library", ignoreCase = true) &&
                                   !line.contains("subscribe", ignoreCase = true)

                    if (hasText && isClickable && isNotButton && isNotNav) {
                        // Extract the text to click
                        val textMatch = """"([^"]+)"""".toRegex().find(line)
                        if (textMatch != null && textMatch.groupValues.size > 1) {
                            val videoTitle = textMatch.groupValues[1].take(50) // First 50 chars
                            Log.d(TAG, "Heuristic: Found video at index $index: $videoTitle")

                            // Try multiple title lengths to increase match chance
                            // Start with shorter variations (more likely to match truncated UI text)
                            val titleVariations = listOf(
                                videoTitle.split(" ").take(3).joinToString(" "),  // First 3 words (most reliable)
                                videoTitle.take(30),  // First 30 chars
                                videoTitle  // Full title (50 chars)
                            )

                            for (titleVariation in titleVariations) {
                                if (titleVariation.isNotBlank() && titleVariation.length >= 3) {
                                    Log.d(TAG, "Heuristic: Trying to click by text: '$titleVariation'")
                                    return AgentAction(
                                        action = "click_by_text",
                                        params = mapOf("text" to titleVariation),
                                        reasoning = "Clicking video by title: $titleVariation"
                                    )
                                }
                            }
                        }

                        // Fallback to click by index if can't extract text
                        Log.d(TAG, "Heuristic: Click video at index $index (no text extracted)")
                        return AgentAction(
                            action = "click_by_index",
                            params = mapOf("index" to index),
                            reasoning = "Clicking video from search results"
                        )
                    }
                }

                // If no good result found, scroll to see more
                if (step > 5) {
                    Log.d(TAG, "Heuristic: No clickable video found, scrolling")
                    return AgentAction(
                        action = "scroll",
                        params = emptyMap(),
                        reasoning = "Scrolling to find more video results"
                    )
                }
            }
        }

        // 3. Click search - ONLY if we haven't searched yet (no results visible)
        if ((goalLower.contains("play") || goalLower.contains("search") || goalLower.contains("find"))
            && (screenLower.contains("search") && screenLower.contains("clickable"))
            && step <= 5) {  // Only in early steps

            // Don't click search if we already have results
            val hasResults = screenSnapshot.split("\n").size > 15
            val hasVideoContent = screenLower.contains("views") || screenLower.contains("ago")

            if (!hasResults && !hasVideoContent) {
                // Try to find search button by text
                if (screenLower.contains("\"search\"")) {
                    Log.d(TAG, "Heuristic: Click Search button")
                    return AgentAction(
                        action = "click_by_text",
                        params = mapOf("text" to "Search"),
                        reasoning = "Clicking search to start query"
                    )
                }

                // Try to find search icon by description
                if (screenLower.contains("desc=\"search\"")) {
                    Log.d(TAG, "Heuristic: Click Search icon")
                    return AgentAction(
                        action = "click_by_content_desc",
                        params = mapOf("desc" to "Search"),
                        reasoning = "Clicking search icon"
                    )
                }
            } else {
                Log.d(TAG, "Skipping search click - results already visible")
            }
        }

        // 4. Input text - if editText is focused/visible and haven't input yet
        if ((screenLower.contains("editable") || screenLower.contains("focused"))
            && !screenSnapshot.contains("desc=\"Clear query\"")) { // Not already searched

            val query = extractQuery(goalLower)
            if (query.isNotBlank()) {
                Log.d(TAG, "Heuristic: Input text '$query'")
                return AgentAction(
                    action = "input_text",
                    params = mapOf("text" to query),
                    reasoning = "Typing search query"
                )
            }
        }

        // 5. Submit search - try keyboard search button first, then enter
        if (screenLower.contains("focused") && step > 3) {
            // Check if there's a visible "Search" button (keyboard search button)
            if (screenLower.contains("\"search\"") && screenLower.contains("button")) {
                Log.d(TAG, "Heuristic: Click keyboard Search button")
                return AgentAction(
                    action = "click_by_text",
                    params = mapOf("text" to "Search"),
                    reasoning = "Clicking keyboard search button"
                )
            }

            // Try clicking search icon if available
            if (screenLower.contains("desc=\"search\"") && screenLower.contains("imagebutton")) {
                Log.d(TAG, "Heuristic: Click Search ImageButton")
                return AgentAction(
                    action = "click_by_content_desc",
                    params = mapOf("desc" to "Search"),
                    reasoning = "Clicking search icon button"
                )
            }

            // Fallback to press enter
            Log.d(TAG, "Heuristic: Press Enter")
            return AgentAction(
                action = "press_enter",
                params = emptyMap(),
                reasoning = "Submitting search query"
            )
        }

        // 6. Complete after 8-10 successful steps
        if (step >= 8 && step <= 12) {
            Log.d(TAG, "Heuristic: Task likely complete after $step steps")
            return AgentAction(
                action = "complete_task",
                params = emptyMap(),
                reasoning = "Task completed (heuristic based on step count)"
            )
        }

        // 7. Press back ONLY if truly stuck (removed automatic back every 3 steps)
        // This is now handled by NativeAgentLoop's stuck detection
        // Don't add automatic back here as it interferes with normal flow

        // 8. Default: Wait
        Log.d(TAG, "Heuristic: Wait (no clear action)")
        return AgentAction(
            action = "wait",
            params = mapOf("ms" to 2000),
            reasoning = "Waiting for screen to settle"
        )
    }

    private fun extractPackageName(screenSnapshot: String): String {
        // Screen format: "Screen: com.package.name\n[0] ..."
        val firstLine = screenSnapshot.lines().firstOrNull() ?: ""
        return firstLine.removePrefix("Screen:").trim()
    }

    private fun extractTargetApp(goalLower: String): String? {
        return when {
            goalLower.contains("youtube") -> "com.google.android.youtube"
            goalLower.contains("whatsapp") -> "com.whatsapp"
            goalLower.contains("chrome") -> "com.android.chrome"
            goalLower.contains("gmail") -> "com.google.android.gm"
            goalLower.contains("maps") -> "com.google.android.apps.maps"
            goalLower.contains("spotify") -> "com.spotify.music"
            goalLower.contains("instagram") -> "com.instagram.android"
            goalLower.contains("facebook") -> "com.facebook.katana"
            goalLower.contains("twitter") || goalLower.contains("x.com") -> "com.twitter.android"
            goalLower.contains("tiktok") -> "com.zhiliaoapp.musically"
            else -> null
        }
    }

    private fun extractWhatsAppContactOrNumber(goalLower: String): String? {
        // Handles both "send hi to di" (name) and "send hi to 7679349780" (number)
        val patterns = listOf(
            Regex("(?:send|message|msg|text)\\s+.+?\\s+to\\s+([\\w\\s]+?)(?:\\s+(?:and|saying|with)|$)"),
            Regex("(?:send|message|msg)\\s+to\\s+([\\w\\s]+?)(?:\\s+(?:and|saying|with)|$)"),
            Regex("whatsapp\\s+([\\w\\s]+?)(?:\\s+(?:and|saying|with)|$)")
        )
        for (pattern in patterns) {
            val contact = pattern.find(goalLower)?.groupValues?.getOrNull(1)?.trim()
            if (!contact.isNullOrBlank()) return contact
        }
        return null
    }

    private fun extractWhatsAppMessage(goalLower: String): String? {
        val patterns = listOf(
            Regex("saying\\s+['\"]?([^'\"]+)['\"]?"),
            Regex("message\\s+(?:is\\s+)?['\"]([^'\"]+)['\"]"),
            Regex("send\\s+['\"]([^'\"]+)['\"]\\s+to"),
            // "send hi to ..." — extract the word(s) before "to"
            Regex("send\\s+([a-zA-Z][\\w\\s]{0,30}?)\\s+to\\s")
        )
        for (pattern in patterns) {
            val msg = pattern.find(goalLower)?.groupValues?.getOrNull(1)?.trim()
            if (!msg.isNullOrBlank() && !msg.contains("whatsapp")) return msg
        }
        return null
    }

    private fun extractQuery(goalLower: String): String {
        // Extract query from goal patterns like:
        // "play [query]"
        // "search for [query]"
        // "find [query]"

        val patterns = listOf(
            "play\\s+(.+)".toRegex(),
            "search\\s+(?:for\\s+)?(.+)".toRegex(),
            "find\\s+(.+)".toRegex(),
            "open\\s+(.+)\\s+(?:in|on)".toRegex()
        )

        for (pattern in patterns) {
            val match = pattern.find(goalLower)
            if (match != null && match.groupValues.size > 1) {
                val query = match.groupValues[1].trim()
                // Clean up common suffixes
                return query
                    .replace(Regex("\\s+in\\s+youtube$"), "")
                    .replace(Regex("\\s+on\\s+youtube$"), "")
                    .trim()
            }
        }

        // Fallback: return whole goal if short enough
        return if (goalLower.length < 50) goalLower else ""
    }
}
