# AndroMolt

**AndroMolt** is an AI-powered Android automation assistant. Users type natural language commands — *"Open YouTube and play a Hindi song"* or *"Send good afternoon to didi on WhatsApp"* — and an AI agent autonomously performs the actions on the device.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               React Native / Expo (UI)              │
│           components/ChatInterface.tsx              │
│   • Chat input  • Live log stream  • Progress bar  │
└────────────────────┬────────────────────────────────┘
                     │  NativeModules.AndroMoltCore
                     │  .runNativeAgent(goal, apiKeys)
                     ▼
┌─────────────────────────────────────────────────────┐
│                Kotlin / Android Native              │
│                                                     │
│  AndroMoltCoreModule.kt  ←  React Native bridge    │
│    └── NativeAgentLoop.kt   (background thread)    │
│          ├── NativeLlmClient.kt                     │
│          │     └── FallbackHeuristics.kt            │
│          └── AccessibilityController.kt             │
│                └── AndroMoltAccessibilityService.kt │
└─────────────────────────────────────────────────────┘
```

**The TypeScript layer is UI-only.** All automation logic — the agent loop, LLM calls, and UI interaction — runs entirely in Kotlin on a native Android background thread. This ensures the agent keeps running even when the app moves to the background.

---

## How the Agent Loop Works

Each step inside `NativeAgentLoop.kt`:

| Phase | What happens |
|-------|-------------|
| **1. OBSERVE** | `AccessibilityController.getUiSnapshot()` reads the current screen. `UiTreeBuilder` converts it to a compact text snapshot (max 150 elements) that the LLM can understand. |
| **2. PLAN** | `NativeLlmClient.getNextAction()` sends the goal + screen snapshot to the LLM, which returns a single JSON action. |
| **3. ACT** | `AccessibilityController` executes the action (click, type, scroll, launch app, etc.) via the Android Accessibility API. |
| **4. SETTLE** | Waits 2000 ms for the UI to update, then loops. |

**Stuck detection:** if the same screen hash appears 4+ times with 2+ consecutive failures, the agent presses Back and retries.

---

## LLM Decision Chain

`NativeLlmClient.kt` tries in priority order:

1. **OpenAI GPT-4o-mini** (if `EXPO_PUBLIC_OPENAI_API_KEY` is set)
2. **Google Gemini 2.0 Flash** (if `EXPO_PUBLIC_GEMINI_API_KEY` is set)
3. **FallbackHeuristics** — rule-based decisions, no API required (limited)

---

## Event Stream (Native → UI)

`EventBridge.kt` emits events via `DeviceEventEmitter`. `ChatInterface.tsx` listens and shows them as live logs:

| Event | Payload |
|-------|---------|
| `agentStart` | `{ goal }` |
| `agentStep` | `{ step, package, elementCount }` |
| `agentThink` | `{ message }` |
| `agentAction` | `{ action, params, reasoning }` |
| `actionResult` | `{ success, message }` |
| `agentComplete` | `{ steps, message }` |

---

## Project Structure

```
androMolt/
├── app/
│   └── (tab)/index.tsx          # Entry point → renders ChatInterface
├── components/
│   ├── ChatInterface.tsx         # Main UI: chat, logs, progress bar
│   └── OnboardingScreen.tsx      # Accessibility permission setup
├── lib/
│   ├── automation/
│   │   └── AgentEvents.ts        # AgentEvent type (used by chat UI)
│   └── stores/
│       └── automationStore.ts    # Zustand: chat history + state
├── types/
│   ├── agent.ts                  # AgentAction / AgentResult interfaces
│   └── automation.ts             # Shared automation types
├── constants/
│   └── theme.ts                  # UI colors and fonts
└── android/app/src/main/java/com/anonymous/androMolt/
    ├── agent/
    │   ├── NativeAgentLoop.kt        # Main OBSERVE-PLAN-ACT loop
    │   ├── NativeLlmClient.kt        # LLM API calls (OpenAI / Gemini)
    │   └── FallbackHeuristics.kt     # Rule-based fallback decisions
    ├── accessibility/
    │   ├── AndroMoltAccessibilityService.kt  # Android Accessibility Service
    │   ├── AccessibilityController.kt         # click / type / scroll / launch
    │   └── UiTreeBuilder.kt                   # UI tree → LLM-readable text
    ├── service/
    │   └── AndroMoltForegroundService.kt      # Keeps agent alive in background
    ├── utils/
    │   ├── EventBridge.kt            # Emits events to React Native JS
    │   └── PermissionHelper.kt       # Permission checking
    └── modules/
        └── AndroMoltCoreModule.kt    # @ReactMethod bridge exports
```

---

## Setup

### Prerequisites

- Android device or emulator (API 26+)
- Node.js 18+ and npm
- Android Studio with Android SDK

### Environment

Create `.env` in the project root:

```
EXPO_PUBLIC_OPENAI_API_KEY=sk-...
EXPO_PUBLIC_GEMINI_API_KEY=AIza...
```

At least one key is required for full functionality. Without either key the agent falls back to rule-based heuristics.

### Install & Run

```bash
npm install
npx expo run:android
```

### Required Permission

The app needs **Accessibility Service** permission to control other apps. On first launch the Onboarding screen guides you:

1. Tap **Enable Accessibility** — Android Settings opens
2. Find **AndroMolt** in the Accessibility list and enable it
3. Return to the app — the chat interface appears

---

## Supported Actions

| Action | Description |
|--------|-------------|
| `open_app` | Launch app by package name |
| `click_by_text` | Click element with matching visible text |
| `click_by_content_desc` | Click element by accessibility description |
| `click_by_index` | Click element by index in the UI tree |
| `input_text` | Type text into the focused field |
| `press_enter` | Press Enter / keyboard Search button |
| `scroll` | Scroll down |
| `back` | Press the Back button |
| `wait` | Wait N milliseconds |
| `complete_task` | Mark goal as achieved |

---

## Example Commands

- *"Open YouTube and play a Hindi song"*
- *"Open WhatsApp and send good afternoon to didi"*
- *"Open Chrome and search for today's weather"*
- *"Open Settings and turn on Wi-Fi"*
- *"Open Instagram and like the first post"*

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI framework | React Native + Expo 54 |
| Navigation | Expo Router |
| State management | Zustand |
| LLM | OpenAI GPT-4o-mini / Google Gemini 2.0 Flash |
| Native automation | Kotlin + Android Accessibility Service |
| Native HTTP | OkHttp3 |
| Build | Gradle + Expo Prebuild |

---

## Known Limitations

- Android only (Kotlin + Accessibility Service)
- Accessibility Service permission must be granted manually in Settings
- Screen reading is text-based; purely graphical elements with no text or description require `click_by_index`
- Maximum 20 steps per task
- LLM API keys required for best results; heuristics cover basic app-open and search flows only
