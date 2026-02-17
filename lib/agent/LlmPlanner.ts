import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentAction } from '../../types/agent';
import { CostTracker } from '../ai/CostTracker';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are AndroMolt, an Android device automation agent. You observe the current screen and decide ONE action at a time.

Available actions (respond with exactly ONE as JSON):

1. open_app - Launch an app
   {"action":"open_app","params":{"package":"com.google.android.youtube"},"reasoning":"..."}

2. click_by_text - Click element by visible text
   {"action":"click_by_text","params":{"text":"Search"},"reasoning":"..."}

3. click_by_content_desc - Click element by content description
   {"action":"click_by_content_desc","params":{"desc":"Search"},"reasoning":"..."}

4. click_by_index - Click element by index from screen snapshot
   {"action":"click_by_index","params":{"index":3},"reasoning":"..."}

5. input_text - Type text into focused/editable field
   {"action":"input_text","params":{"text":"hello world"},"reasoning":"..."}

6. press_enter - Press enter/submit on current input
   {"action":"press_enter","params":{},"reasoning":"..."}

7. scroll - Scroll the screen
   {"action":"scroll","params":{"direction":"down"},"reasoning":"..."}

8. back - Press the back button
   {"action":"back","params":{},"reasoning":"..."}

9. wait - Wait for content to load
   {"action":"wait","params":{"ms":2000},"reasoning":"..."}

10. complete_task - Task is done
    {"action":"complete_task","params":{},"reasoning":"Goal achieved because..."}

Common app packages:
- YouTube: com.google.android.youtube
- WhatsApp: com.whatsapp
- Instagram: com.instagram.android
- Chrome: com.android.chrome
- Settings: com.android.settings
- Spotify: com.spotify.music
- Facebook: com.facebook.katana
- LinkedIn: com.linkedin.android
- Gmail: com.google.android.gm
- Telegram: org.telegram.messenger
- Twitter: com.twitter.android

Rules:
- Return ONLY valid JSON, no other text
- Choose exactly ONE action per response
- Use the screen snapshot to inform your decision
- **CRITICAL**: To launch an app, ALWAYS use open_app with the package name. NEVER click UI buttons/icons to open apps.
- If you're in the AndroMolt app (com.anonymous.androMolt) and need to open another app, use open_app immediately
- If a search field is visible and you need to search, click it first, then input_text, then press_enter
- If you see the desired content already playing/visible, use complete_task
- If you appear stuck (same screen 3+ times), try back or a different approach
- For messaging apps requiring sending, explain in reasoning that confirmation is needed

YouTube Ad Handling:
- If you see "Skip Ad", "Skip in X", or an ad overlay banner on YouTube, an ad is playing
- If a "Skip Ad" or "Skip" button is visible: click_by_text {"text":"Skip Ad"} immediately
- If no skip button yet (countdown still running): use wait {"ms":5000} to wait for it
- Do NOT click video thumbnails, UI icons, or anything else while an ad is visible

WhatsApp Messaging (send X to Y pattern):
STEP ORDER IS CRITICAL - follow exactly:
1. open_app WhatsApp
2. click_by_content_desc {"desc":"Search"} (the magnifier icon)
3. input_text {"text":"<contact name only>"} — type ONLY the person's name, NOT the message
4. click_by_text {"text":"<contact name>"} — click the contact when it appears in results
5. click_by_text/index on the message input field at the bottom of the chat
6. input_text {"text":"<message text>"}
7. click_by_content_desc {"desc":"Send"} or click_by_text {"text":"Send"}
NEVER search for the message content — only search for the contact name.

General multi-step task rules:
- After searching for a contact/item and results appear, your NEXT action must be to CLICK that result
- Never type a new search query when you can already see the result you need
- If you just typed in a search box and results are visible, click a result — do not type again`;

export class LlmPlanner {
  private openai: OpenAI | null = null;
  private gemini: any = null;
  private useOpenAI: boolean = false;
  private conversationHistory: ConversationEntry[] = [];
  private costTracker = new CostTracker();
  private initialized = false;

  initialize() {
    if (this.initialized) return;

    if (OPENAI_API_KEY && OPENAI_API_KEY.startsWith('sk-')) {
      this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      this.useOpenAI = true;
      console.log('LlmPlanner: Using OpenAI');
    } else if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10) {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      this.gemini = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      });
      this.useOpenAI = false;
      console.log('LlmPlanner: Using Gemini');
    } else {
      console.warn('LlmPlanner: No API key configured');
    }

    this.initialized = true;
  }

  resetConversation() {
    this.conversationHistory = [];
  }

  async getNextAction(
    goal: string,
    screenSnapshot: string,
    step: number,
    maxSteps: number
  ): Promise<AgentAction> {
    this.initialize();

    const userMessage = `Goal: ${goal}
Step: ${step}/${maxSteps}

Current screen:
${screenSnapshot}

What is the ONE next action to take? Respond with JSON only.`;

    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: userMessage });

    // Trim to last 10 exchanges (20 messages)
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }

    let responseText: string;

    try {
      console.log('[LlmPlanner] Making LLM API call...');

      // Add timeout to prevent hanging forever (reduced to 5s for background)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM call timeout - likely blocked in background')), 5000)
      );

      if (this.useOpenAI && this.openai) {
        responseText = await Promise.race([this.callOpenAI(userMessage), timeoutPromise]);
      } else if (this.gemini) {
        responseText = await Promise.race([this.callGemini(userMessage), timeoutPromise]);
      } else {
        console.log('[LlmPlanner] No LLM configured, using fallback');
        return this.fallbackAction(goal, screenSnapshot, step);
      }

      console.log('[LlmPlanner] LLM API call successful');
    } catch (error) {
      console.error('[LlmPlanner] LLM call failed:', error);
      return this.fallbackAction(goal, screenSnapshot, step);
    }

    // Add assistant response to history
    this.conversationHistory.push({ role: 'assistant', content: responseText });

    // Parse JSON response
    return this.parseResponse(responseText);
  }

  private async callOpenAI(userMessage: string): Promise<string> {
    console.log('[LlmPlanner] Calling OpenAI API...');
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.conversationHistory.map(entry => ({
        role: entry.role,
        content: entry.content,
      })),
    ];

    console.log('[LlmPlanner] Sending request to OpenAI...');
    const response = await this.openai!.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    console.log('[LlmPlanner] Received response from OpenAI');

    if (response.usage) {
      await this.costTracker.addUsage(
        response.usage.prompt_tokens,
        response.usage.completion_tokens
      );
    }

    return response.choices[0].message.content || '{}';
  }

  private async callGemini(userMessage: string): Promise<string> {
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${this.conversationHistory
      .map(e => `${e.role === 'user' ? 'User' : 'Assistant'}: ${e.content}`)
      .join('\n\n')}`;

    const result = await this.gemini.generateContent(fullPrompt);
    return result.response.text();
  }

  private parseResponse(text: string): AgentAction {
    try {
      // Try direct parse
      const parsed = JSON.parse(text.trim());
      return this.validateAction(parsed);
    } catch {
      // Try to extract JSON from text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return this.validateAction(parsed);
        } catch {
          // Fall through
        }
      }
    }

    // If parsing fails completely, return a wait action
    return {
      action: 'wait',
      params: { ms: 1500 },
      reasoning: 'Failed to parse LLM response, waiting before retry',
    };
  }

  private validateAction(parsed: any): AgentAction {
    const validActions = [
      'open_app', 'click_by_text', 'click_by_content_desc', 'click_by_index',
      'input_text', 'press_enter', 'scroll', 'wait', 'back', 'complete_task',
    ];

    if (!parsed.action || !validActions.includes(parsed.action)) {
      return {
        action: 'wait',
        params: { ms: 1500 },
        reasoning: `Invalid action: ${parsed.action}`,
      };
    }

    return {
      action: parsed.action,
      params: parsed.params || {},
      reasoning: parsed.reasoning || '',
    };
  }

  getFallbackAction(goal: string, screenSnapshot: string, step: number): AgentAction {
    return this.fallbackAction(goal, screenSnapshot, step);
  }

  private fallbackAction(goal: string, screenSnapshot: string, step: number): AgentAction {
    const lower = goal.toLowerCase();
    const screen = screenSnapshot.toLowerCase();

    console.log('[LlmPlanner] Using fallback heuristics');

    // Extract current package from screen snapshot (first line format: "Screen: com.package.name")
    const packageMatch = screenSnapshot.match(/Screen: ([\w.]+)/);
    const currentPackage = packageMatch ? packageMatch[1] : '';

    // YouTube Ad: detect and skip
    if (currentPackage.includes('youtube') &&
        (screen.includes('skip') || screen.includes('ad'))) {
      return {
        action: 'click_by_text',
        params: { text: 'Skip Ad' },
        reasoning: 'Fallback: YouTube ad detected, clicking Skip Ad',
      };
    }

    // WhatsApp: if goal has "send X to Y" pattern handle contact click and message input
    if (currentPackage.includes('whatsapp')) {
      const sendToMatch = lower.match(/(?:send|message)\s+.+?\s+to\s+(.+)/);
      const contactName = sendToMatch?.[1]?.trim();

      if (contactName && screen.includes(contactName.toLowerCase()) &&
          !screen.includes('editable')) {
        // Contact found in results, click it
        return {
          action: 'click_by_text',
          params: { text: contactName },
          reasoning: `Fallback: WhatsApp - clicking contact ${contactName}`,
        };
      }

      // If we're in a chat (editable message box), type message
      if (screen.includes('editable') && screen.includes('message')) {
        const messageMatch = lower.match(/(?:send|say|write)\s+(.+?)\s+(?:to|in)/);
        const message = messageMatch?.[1]?.trim();
        if (message) {
          return {
            action: 'input_text',
            params: { text: message },
            reasoning: `Fallback: WhatsApp - typing message "${message}"`,
          };
        }
      }
    }

    const isInAndroMolt = currentPackage.includes('andromolt') || currentPackage.includes('anonymous');

    // Step 1-3: If goal mentions an app and we're still in AndroMolt, open it
    if (step <= 3 && isInAndroMolt) {
      const appMap: Record<string, string> = {
        youtube: 'com.google.android.youtube',
        whatsapp: 'com.whatsapp',
        instagram: 'com.instagram.android',
        spotify: 'com.spotify.music',
        chrome: 'com.android.chrome',
        settings: 'com.android.settings',
        facebook: 'com.facebook.katana',
        twitter: 'com.twitter.android',
        telegram: 'org.telegram.messenger',
      };
      for (const [name, pkg] of Object.entries(appMap)) {
        if (lower.includes(name)) {
          return {
            action: 'open_app',
            params: { package: pkg },
            reasoning: `Fallback: Opening ${name}`,
          };
        }
      }
    }

    // If we're in the right app, try to execute the goal
    // Search-related: click search button
    if (screen.includes('search') && !screen.includes('editable')) {
      return {
        action: 'click_by_text',
        params: { text: 'Search' },
        reasoning: 'Fallback: Clicking search button',
      };
    }

    // If search is focused/editable, type query
    if (screen.includes('editable') && (lower.includes('play') || lower.includes('open') || lower.includes('search'))) {
      // Extract search query from goal
      let query = '';
      if (lower.includes('play ')) {
        query = lower.split('play ')[1]?.split(' on ')[0] || 'music';
      } else if (lower.includes('search ')) {
        query = lower.split('search ')[1] || 'video';
      }

      if (query) {
        return {
          action: 'input_text',
          params: { text: query },
          reasoning: `Fallback: Typing "${query}" in search`,
        };
      }
    }

    // If we just typed, press enter
    if (step > 3 && screen.includes('editable')) {
      return {
        action: 'press_enter',
        params: {},
        reasoning: 'Fallback: Pressing enter to search',
      };
    }

    // If we see clickable items after searching, click the first one
    if (step > 5 && screen.includes('clickable')) {
      return {
        action: 'click_by_index',
        params: { index: 0 },
        reasoning: 'Fallback: Clicking first result',
      };
    }

    // If we've done several steps and seem to be in the right place, complete
    if (step > 8) {
      return {
        action: 'complete_task',
        params: {},
        reasoning: 'Fallback: Task appears complete after multiple steps',
      };
    }

    return {
      action: 'wait',
      params: { ms: 2000 },
      reasoning: 'Fallback: Waiting for screen to settle',
    };
  }
}
