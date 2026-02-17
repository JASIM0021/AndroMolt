/**
 * Safety Guard - Prompt Injection Defense
 */

import { AutomationAction, ActionType } from '../types/AutomationAction';

export class SafetyGuard {
  /**
   * Detect prompt injection attempts
   */
  static detectInjection(userInput: string): boolean {
    const suspiciousPatterns = [
      /ignore (previous|all) (instructions|rules)/i,
      /you are now/i,
      /system prompt/i,
      /disregard (above|previous)/i,
      /<\|im_start\|>/i, // Common LLM delimiters
      /\[INST\]/i,
      /\[\/INST\]/i,
      /forget (all|previous)/i,
      /new instructions/i,
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(userInput));
  }

  /**
   * Sanitize user input
   */
  static sanitize(input: string): string {
    // Remove common injection patterns
    let clean = input
      .replace(/<\|.*?\|>/g, '') // LLM tokens
      .replace(/\[INST\].*?\[\/INST\]/g, '')
      .replace(/\[SYS\].*?\[\/SYS\]/g, '')
      .trim();

    // Max length to prevent token overflow
    return clean.slice(0, 500);
  }

  /**
   * Validate actions before execution
   */
  static validateAction(action: AutomationAction): {
    valid: boolean;
    reason?: string;
  } {
    // Block if trying to access sensitive apps without explicit user command
    const sensitiveApps = ['banking', 'wallet', 'password', 'authenticator'];

    if (action.type === ActionType.OPEN_APP) {
      const app = action.params.app?.toLowerCase() || '';
      if (sensitiveApps.some((s) => app.includes(s))) {
        return {
          valid: false,
          reason: 'Sensitive app requires explicit confirmation',
        };
      }
    }

    // Validate message sending
    if (action.type === ActionType.SEND_WHATSAPP_MESSAGE) {
      if (!action.params.contact || !action.params.message) {
        return {
          valid: false,
          reason: 'Missing contact or message',
        };
      }
    }

    return { valid: true };
  }
}
