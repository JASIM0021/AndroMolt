import { NativeModules } from 'react-native';
import { LlmPlanner } from './LlmPlanner';
import { AgentAction, AgentResult } from '../../types/agent';
import { agentEvents } from '../automation/AgentEvents';
import { SafetyGuard } from '../ai/SafetyGuard';
import { RISK_RULES } from '../../constants/automation';

const getNativeModule = () => NativeModules.AndroMoltCore || null;

interface AgentLoopConfig {
  maxSteps: number;
  actionDelayMs: number;
  stuckThreshold: number;
}

const DEFAULT_CONFIG: AgentLoopConfig = {
  maxSteps: 20,
  actionDelayMs: 2000, // Increased from 1500ms to 2000ms
  stuckThreshold: 3,
};

export class AgentLoop {
  private planner = new LlmPlanner();
  private config: AgentLoopConfig;
  private running = false;
  private onConfirmationNeeded?: (action: AgentAction) => Promise<boolean>;

  constructor(config?: Partial<AgentLoopConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setConfirmationCallback(cb: (action: AgentAction) => Promise<boolean>) {
    this.onConfirmationNeeded = cb;
  }

  cancel() {
    this.running = false;
    agentEvents.complete(false, 'Agent cancelled by user');
  }

  isRunning() {
    return this.running;
  }

  async run(goal: string): Promise<AgentResult> {
    // Safety check
    if (SafetyGuard.detectInjection(goal)) {
      return { success: false, message: 'Potential prompt injection detected', steps: 0 };
    }

    const sanitizedGoal = SafetyGuard.sanitize(goal);
    this.running = true;
    this.planner.resetConversation();

    agentEvents.start(sanitizedGoal, this.config.maxSteps);
    agentEvents.think(`Starting agent for: "${sanitizedGoal}"`);

    // Start foreground service
    try {
      const nativeModule = getNativeModule();
      if (nativeModule?.startAgent) {
        await nativeModule.startAgent();
      }
    } catch (e) {
      console.warn('Failed to start foreground service:', e);
    }

    const screenHashes: string[] = [];
    let step = 0;

    try {
      while (this.running && step < this.config.maxSteps) {
        step++;
        console.log(`[AgentLoop] Step ${step}/${this.config.maxSteps}`);
        agentEvents.nextStep();

        // 1. OBSERVE
        agentEvents.stepProgress(step, this.config.maxSteps, 'Observing screen...');
        const snapshot = await this.getUiSnapshot();

        if (!snapshot) {
          agentEvents.think('No screen data available, waiting...');
          await this.delay(this.config.actionDelayMs);
          continue;
        }

        const elementCount = snapshot.compact.split('\n').length - 2; // Subtract header and total line
        console.log(`[AgentLoop] Observing ${snapshot.packageName}: ${elementCount} elements`);
        agentEvents.think(`Current app: ${snapshot.packageName}, ${elementCount} elements`);

        // CRITICAL: If we're still in AndroMolt after step 1, user hasn't let the target app come to foreground
        // Auto-press HOME to get out of AndroMolt
        if (step > 1 && snapshot.packageName === 'com.anonymous.androMolt') {
          agentEvents.think('Still in AndroMolt app - pressing HOME to let target app take foreground');
          const nativeModule = getNativeModule();
          if (nativeModule?.moveToBackground) {
            try {
              await nativeModule.moveToBackground();
              await this.delay(1500); // Wait for home screen transition
              continue; // Skip this step and re-observe on next iteration
            } catch (e) {
              console.warn('Failed to move to background:', e);
            }
          }
        }

        // 2. STUCK DETECTION
        const screenHash = this.hashScreen(snapshot.compact);
        screenHashes.push(screenHash);

        if (this.isStuck(screenHashes)) {
          agentEvents.think('Appears stuck on same screen, pressing back...');
          await this.executeNativeAction({ action: 'back', params: {}, reasoning: 'Stuck detection' });
          await this.delay(this.config.actionDelayMs);
          continue;
        }

        // 3. PLAN - Always try LLM first (foreground service keeps network alive)
        // Fall back to heuristics only if LLM fails/times out
        agentEvents.stepProgress(step, this.config.maxSteps, 'Deciding next action...');
        agentEvents.think('Analyzing screen and deciding next action...');

        let action;

        try {
          console.log(`[AgentLoop] Calling LLM for step ${step} (${snapshot.packageName})...`);
          action = await this.planner.getNextAction(
            sanitizedGoal,
            snapshot.compact,
            step,
            this.config.maxSteps
          );
          console.log(`[AgentLoop] LLM responded with: ${action.action}`, action.params);
        } catch (error) {
          console.warn(`[AgentLoop] LLM call failed at step ${step}, using fallback heuristics:`, error);
          agentEvents.think(`LLM unavailable, using fallback heuristics`);
          action = this.planner.getFallbackAction(sanitizedGoal, snapshot.compact, step);
        }

        console.log(`[AgentLoop] Decided: ${action.action}`, action.params);
        agentEvents.think(`Decision: ${action.action} - ${action.reasoning}`);

        // SAFEGUARD: If at early steps, still in AndroMolt, and LLM didn't choose open_app, override it
        if (step <= 2 && snapshot.packageName === 'com.anonymous.androMolt' && action.action !== 'open_app') {
          const appHint = this.detectAppInGoal(sanitizedGoal);
          if (appHint) {
            agentEvents.think(`Overriding LLM decision - we need to open ${appHint.name} first`);
            action = {
              action: 'open_app',
              params: { package: appHint.pkg },
              reasoning: `Corrected: Need to launch ${appHint.name} before proceeding`,
            };
            console.log(`[AgentLoop] Overridden to: ${action.action}`, action.params);
          }
        }

        // Update notification
        try {
          const nativeModule = getNativeModule();
          if (nativeModule?.updateNotification) {
            await nativeModule.updateNotification(`Step ${step}/${this.config.maxSteps}: ${action.action}`);
          }
        } catch {}

        // 4. DONE CHECK
        if (action.action === 'complete_task') {
          agentEvents.goalAchieved(action.reasoning || 'Task completed');
          this.running = false;
          await this.stopAgent();
          return { success: true, message: action.reasoning || 'Task completed', steps: step };
        }

        // 5. SAFETY CHECK
        if (this.isHighRisk(action)) {
          if (this.onConfirmationNeeded) {
            agentEvents.think('High-risk action detected, requesting confirmation...');
            const confirmed = await this.onConfirmationNeeded(action);
            if (!confirmed) {
              agentEvents.think('User denied high-risk action, skipping');
              continue;
            }
          }
        }

        // 6. ACT
        agentEvents.executeAction(action.action, action);
        const outcome = await this.executeNativeAction(action);
        agentEvents.actionCompleted(action.action, outcome.success, outcome.message);

        if (!outcome.success && action.action !== 'wait') {
          agentEvents.think(`Action failed, but continuing to next step...`);
        }

        // 7. SETTLE
        const waitMs = action.action === 'wait'
          ? (action.params.ms || this.config.actionDelayMs)
          : this.config.actionDelayMs;
        agentEvents.think(`Waiting ${waitMs}ms before next step...`);
        await this.delay(waitMs);
      }

      if (this.running) {
        agentEvents.complete(false, `Max steps (${this.config.maxSteps}) reached`);
        this.running = false;
        await this.stopAgent();
        return { success: false, message: 'Max steps reached', steps: step };
      }

      // Cancelled
      await this.stopAgent();
      return { success: false, message: 'Agent was cancelled', steps: step };

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      agentEvents.error(msg);
      this.running = false;
      await this.stopAgent();
      return { success: false, message: msg, steps: step };
    }
  }

  private async getUiSnapshot(): Promise<{ compact: string; json: string; packageName: string } | null> {
    try {
      const nativeModule = getNativeModule();
      if (!nativeModule?.getUiSnapshot) return null;
      const result = await nativeModule.getUiSnapshot();
      if (!result || !result.compact) return null;
      return {
        compact: result.compact,
        json: result.json,
        packageName: result.packageName,
      };
    } catch (e) {
      console.warn('getUiSnapshot failed:', e);
      return null;
    }
  }

  private async executeNativeAction(action: AgentAction): Promise<{ success: boolean; message: string }> {
    const nativeModule = getNativeModule();
    if (!nativeModule) {
      return { success: false, message: 'Native module not available' };
    }

    try {
      switch (action.action) {
        case 'open_app': {
          const pkg = action.params.package;
          if (!pkg) return { success: false, message: 'No package specified' };
          if (typeof nativeModule.launchApp === 'function') {
            console.log(`[AgentLoop] Opening ${pkg}...`);
            const result = await nativeModule.launchApp(pkg);
            console.log(`[AgentLoop] Opened ${pkg}, result: ${result}`);
            // Note: Don't wait here. The standard action delay will handle it.
            return { success: !!result, message: result ? `Opened ${pkg}` : `Failed to open ${pkg}` };
          }
          return { success: false, message: 'launchApp not available' };
        }

        case 'click_by_text': {
          const text = action.params.text;
          if (!text) return { success: false, message: 'No text specified' };
          if (typeof nativeModule.clickByText === 'function') {
            const result = await nativeModule.clickByText(text);
            return { success: result.success, message: result.message };
          }
          return { success: false, message: 'clickByText not available' };
        }

        case 'click_by_content_desc': {
          const desc = action.params.desc;
          if (!desc) return { success: false, message: 'No desc specified' };
          if (typeof nativeModule.clickByContentDesc === 'function') {
            const result = await nativeModule.clickByContentDesc(desc);
            return { success: result.success, message: result.message };
          }
          return { success: false, message: 'clickByContentDesc not available' };
        }

        case 'click_by_index': {
          const index = action.params.index;
          if (index === undefined) return { success: false, message: 'No index specified' };
          if (typeof nativeModule.clickByIndex === 'function') {
            const result = await nativeModule.clickByIndex(index);
            return { success: result.success, message: result.message };
          }
          return { success: false, message: 'clickByIndex not available' };
        }

        case 'input_text': {
          const text = action.params.text;
          if (!text) return { success: false, message: 'No text specified' };
          if (typeof nativeModule.inputText === 'function') {
            const result = await nativeModule.inputText(text);
            return { success: !!result, message: result ? `Typed: ${text}` : 'Input failed' };
          }
          return { success: false, message: 'inputText not available' };
        }

        case 'press_enter': {
          if (typeof nativeModule.pressEnter === 'function') {
            const result = await nativeModule.pressEnter();
            return { success: result.success, message: result.message };
          }
          // Fallback to pressKey
          if (typeof nativeModule.pressKey === 'function') {
            const result = await nativeModule.pressKey(66);
            return { success: !!result, message: result ? 'Pressed Enter' : 'Enter failed' };
          }
          return { success: false, message: 'pressEnter not available' };
        }

        case 'scroll': {
          const direction = action.params.direction || 'down';
          if (direction === 'up' && typeof nativeModule.scrollUp === 'function') {
            const result = await nativeModule.scrollUp();
            return { success: result.success, message: result.message };
          }
          if (typeof nativeModule.scrollDown === 'function') {
            const result = await nativeModule.scrollDown();
            return { success: !!result, message: result ? 'Scrolled down' : 'Scroll failed' };
          }
          return { success: false, message: 'scroll not available' };
        }

        case 'back': {
          if (typeof nativeModule.pressBack === 'function') {
            const result = await nativeModule.pressBack();
            return { success: result.success, message: result.message };
          }
          return { success: false, message: 'pressBack not available' };
        }

        case 'wait': {
          const ms = action.params.ms || 1500;
          await this.delay(ms);
          return { success: true, message: `Waited ${ms}ms` };
        }

        default:
          return { success: false, message: `Unknown action: ${action.action}` };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, message: `Action error: ${msg}` };
    }
  }

  private isHighRisk(action: AgentAction): boolean {
    // Messaging and sending actions are high risk
    const highRiskPatterns = ['send', 'message', 'delete', 'purchase', 'pay', 'install'];
    const reasoning = (action.reasoning || '').toLowerCase();
    const actionStr = JSON.stringify(action.params).toLowerCase();

    return highRiskPatterns.some(
      pattern => reasoning.includes(pattern) || actionStr.includes(pattern)
    );
  }

  private detectAppInGoal(goal: string): { name: string; pkg: string } | null {
    const lower = goal.toLowerCase();
    const appMap: Record<string, string> = {
      youtube: 'com.google.android.youtube',
      whatsapp: 'com.whatsapp',
      instagram: 'com.instagram.android',
      spotify: 'com.spotify.music',
      chrome: 'com.android.chrome',
      browser: 'com.android.chrome',
      settings: 'com.android.settings',
      facebook: 'com.facebook.katana',
      twitter: 'com.twitter.android',
      telegram: 'org.telegram.messenger',
      gmail: 'com.google.android.gm',
      linkedin: 'com.linkedin.android',
    };

    for (const [name, pkg] of Object.entries(appMap)) {
      if (lower.includes(name)) {
        return { name, pkg };
      }
    }
    return null;
  }

  private hashScreen(compact: string): string {
    // Simple hash: first 200 chars of compact representation
    return compact.slice(0, 200);
  }

  private isStuck(hashes: string[]): boolean {
    if (hashes.length < this.config.stuckThreshold) return false;
    const recent = hashes.slice(-this.config.stuckThreshold);
    return recent.every(h => h === recent[0]);
  }

  private async stopAgent() {
    try {
      const nativeModule = getNativeModule();
      if (nativeModule?.stopAgent) {
        await nativeModule.stopAgent();
      }
    } catch {}
  }

  private async delay(ms: number): Promise<void> {
    // Use native delay to avoid JS setTimeout being paused when app is in background
    const nativeModule = getNativeModule();
    if (nativeModule?.nativeDelay) {
      try {
        await nativeModule.nativeDelay(ms);
        return;
      } catch (e) {
        console.warn('Native delay failed, falling back to setTimeout:', e);
      }
    }
    // Fallback to JS setTimeout
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
