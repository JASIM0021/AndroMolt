import { create } from 'zustand';
import { clearSettings, DEFAULT_SETTINGS, loadSettings, saveSettings, StoredSettings } from '../storage/settingsStorage';

// Import types from automation
import { AgentAction, AgentResult } from '../../types/agent';
import { ActionPlan, ActionResult } from '../../types/automation';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'report';
  content: string;
  timestamp: string;
  actionPlan?: ActionPlan;
  results?: ActionResult[];
}

// Types
interface AutomationStore {
  // Permission state
  permissions: {
    accessibility: boolean;
    overlay: boolean;
    usageStats: boolean;
    notifications: boolean;
    contacts: boolean;
  };

  // System status
  systemStatus: {
    isReady: boolean;
    version: string;
    platform: string;
  };

  // Automation state
  currentActionPlan: ActionPlan | null;
  actionHistory: ActionResult[];
  isExecuting: boolean;

  // Agent state
  agentResult: AgentResult | null;
  confirmationPending: AgentAction | null;

  // UI state
  activeTab: string;
  chatMessages: ChatMessage[];

  // Settings (persisted)
  settings: StoredSettings;

  // Settings loading state
  settingsLoaded: boolean;

  // Actions
  setPermissions: (permissions: any) => void;
  setSystemStatus: (status: any) => void;
  setCurrentActionPlan: (plan: ActionPlan | null) => void;
  addToHistory: (result: ActionResult) => void;
  clearHistory: () => void;
  setIsExecuting: (executing: boolean) => void;
  setActiveTab: (tab: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  updateSettings: (settings: Partial<StoredSettings>) => Promise<void>;
  clearChatMessages: () => void;
  setAgentResult: (result: AgentResult | null) => void;
  setConfirmationPending: (action: AgentAction | null) => void;
  loadPersistedSettings: () => Promise<void>;
  resetAllSettings: () => Promise<void>;
}

// Create store
export const useAutomationStore = create<AutomationStore>()(
  (set, get) => ({
    // Initial state
    permissions: {
      accessibility: false,
      overlay: false,
      usageStats: false,
      notifications: false,
      contacts: false,
    },

    systemStatus: {
      isReady: false,
      version: '1.0.0',
      platform: 'android',
    },

    currentActionPlan: null,
    actionHistory: [],
    isExecuting: false,

    agentResult: null,
    confirmationPending: null,

    activeTab: 'chat',
    chatMessages: [],

    settings: { ...DEFAULT_SETTINGS },

    settingsLoaded: false,

    // Actions
    setPermissions: (permissions) => set({ permissions }),

    setSystemStatus: (status) => set((state) => ({
      systemStatus: { ...state.systemStatus, ...status }
    })),

    setCurrentActionPlan: (plan) => set({ currentActionPlan: plan }),

    addToHistory: (result) => set((state) => ({
      actionHistory: [result, ...state.actionHistory.slice(0, 99)]
    })),

    clearHistory: () => set({ actionHistory: [] }),

    setIsExecuting: (executing) => set({ isExecuting: executing }),

    setActiveTab: (tab) => set({ activeTab: tab }),

    addChatMessage: (message) => set((state) => ({
      chatMessages: [...state.chatMessages, { ...message, id: message.id || Date.now().toString() }]
    })),

    updateSettings: async (newSettings) => {
      set((state) => ({
        settings: { ...state.settings, ...newSettings }
      }));
      await saveSettings(newSettings);
    },

    clearChatMessages: () => set({ chatMessages: [] }),

    setAgentResult: (result) => set({ agentResult: result }),
    setConfirmationPending: (action) => set({ confirmationPending: action }),

    loadPersistedSettings: async () => {
      const stored = await loadSettings();
      set({ settings: stored, settingsLoaded: true });
      // Add welcome message after loading settings
      if (get().chatMessages.length === 0) {
        set({
          chatMessages: [{
            id: '1',
            type: 'system',
            content: 'Welcome to AndroMolt! I can help you automate tasks on your Android device. Try commands like "Open YouTube" or "Launch WhatsApp".',
            timestamp: new Date().toISOString(),
          }]
        });
      }
    },

    resetAllSettings: async () => {
      await clearSettings();
      set({ settings: { ...DEFAULT_SETTINGS }, settingsLoaded: true });
    },
  })
);

// Selectors for common operations
export const usePermissions = () => useAutomationStore((state) => state.permissions);
export const useSystemStatus = () => useAutomationStore((state) => state.systemStatus);
export const useCurrentActionPlan = () => useAutomationStore((state) => state.currentActionPlan);
export const useActionHistory = () => useAutomationStore((state) => state.actionHistory);
export const useIsExecuting = () => useAutomationStore((state) => state.isExecuting);
export const useChatMessages = () => useAutomationStore((state) => state.chatMessages);
export const useSettings = () => useAutomationStore((state) => state.settings);