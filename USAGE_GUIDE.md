# AndroMolt Usage Guide

## How to Use the Agent

### ✅ Correct Usage:

1. **Send your command** (e.g., "Open YouTube and play a Hindi song")
2. **Minimize or close AndroMolt** - Press the Home button or use Recent Apps to leave AndroMolt
3. **Let the agent work** - You'll see the notification showing progress
4. **The agent will:**
   - Open YouTube
   - Click Search
   - Type your query
   - Press Enter
   - Click the first video
   - Mark task as complete

### ❌ Common Mistakes:

**DON'T switch back to AndroMolt** while the agent is running!

**Why?** The agent can only see the screen of the currently active app. When you switch back to AndroMolt to check progress:
- The agent loses sight of YouTube (or whatever app it's automating)
- It can no longer click buttons or read the screen
- The task will appear "stuck"

### Monitoring Progress:

- **Notification**: Check the ongoing notification for step-by-step updates
- **After completion**: Switch back to AndroMolt to see the final result
- **Logs**: The live logs in the progress bar show LLM reasoning in real-time

### Tips for Best Results:

1. **Keep commands clear**: "Open YouTube and play Imagine Dragons" works better than "Play something"
2. **One app at a time**: Don't ask to switch between multiple apps in one command
3. **Be patient**: Wait for the notification to say "Complete" before switching back
4. **Use Quick Actions**: The preset buttons ensure correct app names

### How the Agent Works:

```
Step 1: Open YouTube → waits 3s for app to load
Step 2: Observe screen → sees "Search" button
Step 3: Click Search → waits 2s
Step 4: Observe screen → sees search field is focused
Step 5: Type "Hindi song" → waits 2s
Step 6: Press Enter → waits 2s
Step 7: Observe screen → sees video results
Step 8: Click first video → waits 2s
Step 9: Observe screen → sees video playing
Step 10: Mark as complete ✅
```

### Canceling a Task:

1. Tap the **Cancel** button in the notification
2. Or tap the **Cancel** button in the progress bar (if AndroMolt is open)

### Troubleshooting:

**"Agent just opens the app and stops"**
→ You probably switched back to AndroMolt. Let it run in the background.

**"Agent seems stuck"**
→ Check the notification - it might be waiting for the LLM to respond. If truly stuck for >30s, cancel and retry.

**"No screen data available"**
→ Make sure Accessibility permission is enabled in Settings.

**"High-risk action detected"**
→ The agent is asking for confirmation (e.g., sending a message). Approve or deny in the modal.

## Permissions Required:

1. **Accessibility Service** (REQUIRED) - Allows reading and clicking UI elements
2. **Display Over Apps** (Optional) - For future floating controls
3. **Notifications** (Recommended) - To show progress updates

## Safety Features:

- **Prompt injection detection** - Blocks malicious instructions
- **High-risk confirmation** - Asks before sending messages or making purchases
- **Stuck detection** - Presses back if on the same screen 3 times
- **Max steps limit** - Stops after 20 actions to prevent infinite loops

## Examples:

### ✅ Good Commands:
- "Open YouTube and play a Hindi song"
- "Launch WhatsApp"
- "Open Settings and turn on WiFi"
- "Play Imagine Dragons on Spotify"

### ⚠️ Needs Improvement:
- "Play something" (too vague - what app?)
- "Send a message to John saying hi" (high-risk, will ask for confirmation)
- "Open YouTube, then Instagram, then Facebook" (too many apps, do one at a time)

---

**Remember**: After sending a command, **leave AndroMolt** and let the agent work! Check the notification for progress.
