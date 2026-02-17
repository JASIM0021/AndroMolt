# Native Agent Implementation - Verification Checklist

## Build Verification

### ✅ Code Structure
- [x] Created `NativeLlmClient.kt` with HTTP client for OpenAI/Gemini
- [x] Created `FallbackHeuristics.kt` with rule-based automation
- [x] Created `NativeAgentLoop.kt` with main agent loop
- [x] Added dependencies (OkHttp, Gson) to build.gradle
- [x] Updated `AndroMoltCoreModule.kt` with bridge methods
- [x] Updated `ChatInterface.tsx` with native event listeners
- [x] Initialized EventBridge in AndroMoltCoreModule

### ⏳ Compilation Check
- [ ] Run: `cd android && ./gradlew assembleDebug`
- [ ] Verify: No compilation errors
- [ ] Verify: All imports resolved
- [ ] Verify: No Kotlin syntax errors

## Runtime Verification

### Environment Setup
- [ ] Check `.env` file has valid API keys:
  - `EXPO_PUBLIC_OPENAI_API_KEY`
  - `EXPO_PUBLIC_GEMINI_API_KEY`
- [ ] Verify Android device/emulator running Android 12+
- [ ] Accessibility service enabled for AndroMolt
- [ ] Foreground service permission granted

### Basic Functionality Tests

#### Test 1: Native Agent Starts
**Goal**: "Open YouTube"
**Steps**:
1. Launch AndroMolt
2. Type "Open YouTube" in chat
3. Press Send

**Expected**:
- [ ] Native agent starts (check logs)
- [ ] Event `agentStart` emitted
- [ ] Progress bar shows "Step 1/20"
- [ ] Notification updates with progress

#### Test 2: Background Execution
**Goal**: "Open YouTube and play a Hindi song"
**Steps**:
1. Start agent with above goal
2. Wait for YouTube to open (agent moves to background)
3. Observe notification updates

**Expected**:
- [ ] Agent continues running after YouTube opens
- [ ] Steps 2-20 execute in background
- [ ] Network requests to LLM succeed
- [ ] Actions execute correctly (click search, type, etc.)
- [ ] Task completes successfully

#### Test 3: Stuck Detection
**Scenario**: Agent gets stuck on same screen
**Steps**:
1. Create scenario where agent can't proceed (e.g., no internet)
2. Observe agent behavior

**Expected**:
- [ ] After 3 identical screens, agent presses back
- [ ] Log shows: "Stuck on same screen, going back"
- [ ] Agent recovers and tries alternative path

#### Test 4: Self-Healing
**Scenario**: User switches back to AndroMolt
**Steps**:
1. Start agent: "Open YouTube"
2. Once YouTube opens, manually switch back to AndroMolt
3. Observe behavior

**Expected**:
- [ ] Agent detects AndroMolt in foreground
- [ ] Log shows: "Moving AndroMolt to background"
- [ ] Agent moves AndroMolt to background
- [ ] YouTube comes back to foreground
- [ ] Agent continues execution

#### Test 5: Fallback Heuristics
**Scenario**: LLM API unavailable
**Steps**:
1. Temporarily set invalid API keys or disable internet
2. Start agent: "Open YouTube"

**Expected**:
- [ ] Agent falls back to heuristics
- [ ] Log shows: "Using fallback heuristics"
- [ ] Agent completes task using rules
- [ ] Opens YouTube successfully

#### Test 6: Cancel Agent
**Scenario**: User cancels mid-execution
**Steps**:
1. Start agent: "Open YouTube and play a song"
2. Press "Cancel" button after 3-4 steps

**Expected**:
- [ ] Agent stops immediately
- [ ] Log shows: "Agent cancelled by user"
- [ ] Progress bar disappears
- [ ] UI returns to normal state

### Event Flow Tests

#### Test 7: Events Reach UI
**Goal**: Any goal
**Steps**:
1. Start agent
2. Monitor React Native DevTools console
3. Check logs in ChatInterface

**Expected Events** (in order):
- [ ] `agentStart` - with goal
- [ ] `agentStep` - for each step
- [ ] `agentAction` - for each action
- [ ] `actionResult` - for each action result
- [ ] `agentThink` - for thinking/reasoning
- [ ] `agentComplete` - when done

**UI Updates**:
- [ ] Progress bar shows current step
- [ ] Logs show all events
- [ ] Final message shows success/failure

### Performance Tests

#### Test 8: API Response Time
**Goal**: "Open YouTube"
**Steps**:
1. Start agent
2. Measure time for each step

**Expected**:
- [ ] Step 1-2: < 5 seconds (network + LLM)
- [ ] Step 3-10: < 3 seconds each
- [ ] Total time: < 30 seconds for simple task
- [ ] No excessive delays

#### Test 9: Memory Usage
**Goal**: Run 3-4 tasks in sequence
**Steps**:
1. Complete task 1
2. Complete task 2
3. Complete task 3
4. Check memory usage

**Expected**:
- [ ] No memory leaks
- [ ] Memory usage stable after each task
- [ ] App remains responsive

### Edge Cases

#### Test 10: No Accessibility Service
**Scenario**: Accessibility service disabled
**Steps**:
1. Disable accessibility service
2. Try to start agent

**Expected**:
- [ ] Agent detects no accessibility service
- [ ] Error message shown to user
- [ ] App doesn't crash

#### Test 11: Invalid API Keys
**Scenario**: Both API keys invalid
**Steps**:
1. Set invalid API keys in `.env`
2. Start agent: "Open YouTube"

**Expected**:
- [ ] Agent falls back to heuristics
- [ ] Task completes using rules
- [ ] No crash or hang

#### Test 12: Network Lost Mid-Execution
**Scenario**: Internet disconnects during task
**Steps**:
1. Start agent
2. Disable WiFi/mobile data after 2-3 steps
3. Observe behavior

**Expected**:
- [ ] Agent falls back to heuristics
- [ ] Task continues (may fail gracefully)
- [ ] No crash

#### Test 13: Target App Not Installed
**Scenario**: User asks to open non-existent app
**Steps**:
1. Start agent: "Open TikTok" (if not installed)

**Expected**:
- [ ] Agent detects app not found
- [ ] Error logged
- [ ] Task ends gracefully

## Integration Tests

### Test 14: Full End-to-End
**Goal**: "Open YouTube and play latest Hindi songs"
**Steps**:
1. Start agent
2. Let it run completely without intervention

**Expected Steps**:
1. [ ] Opens YouTube (moves to background)
2. [ ] Clicks search icon
3. [ ] Types "latest Hindi songs"
4. [ ] Presses enter
5. [ ] Clicks first video
6. [ ] Waits for video to start
7. [ ] Completes task

**Verification**:
- [ ] All steps execute correctly
- [ ] Video actually playing at the end
- [ ] Task marked as successful
- [ ] Correct number of steps reported

### Test 15: Complex Multi-Step Task
**Goal**: "Open WhatsApp and send message to John saying hello"
**Expected Behavior**:
- [ ] Opens WhatsApp
- [ ] Clicks search
- [ ] Types "John"
- [ ] Clicks contact
- [ ] Types "hello"
- [ ] *May ask for confirmation before sending* (high-risk action)

## Known Issues to Watch For

### Issue 1: Screen Hash Collision
**Symptom**: Agent thinks it's stuck when it's not
**Check**: Review screen hash logic
**Fix**: Improve hash to include more unique elements

### Issue 2: Action Timing
**Symptom**: Agent clicks before UI settles
**Check**: Verify `actionDelayMs` is adequate (2000ms)
**Fix**: Increase delay or add smart waiting

### Issue 3: Event Bridge Not Initialized
**Symptom**: Events not reaching React Native UI
**Check**: EventBridge.initialize() called in AndroMoltCoreModule
**Fix**: Ensure initialization happens before any event emission

### Issue 4: API Key Not Passed
**Symptom**: Always using fallback heuristics
**Check**: API keys passed correctly from ChatInterface
**Fix**: Verify process.env.EXPO_PUBLIC_* is set

## Post-Verification Steps

Once all tests pass:
1. [ ] Document any issues found and fixes applied
2. [ ] Update NATIVE_AGENT_IMPLEMENTATION.md with lessons learned
3. [ ] Create user-facing documentation
4. [ ] Add automated tests for critical paths
5. [ ] Set up crash reporting (if not already done)
6. [ ] Monitor success rate in production

## Success Criteria

- ✅ All compilation errors resolved
- ✅ All runtime tests pass
- ✅ Background execution works reliably (Test 2)
- ✅ Stuck detection works (Test 3)
- ✅ Self-healing works (Test 4)
- ✅ Events flow correctly (Test 7)
- ✅ End-to-end task succeeds (Test 14)
- ✅ Success rate > 80% for simple tasks

## Rollback Plan

If critical issues found:
1. Revert ChatInterface.tsx to use JS agentLoop
2. Keep native code for future use
3. Document blocking issues
4. Fix issues before re-enabling native agent

---

**Status**: Implementation Complete ✅ | Testing In Progress ⏳
**Last Updated**: 2026-02-16
