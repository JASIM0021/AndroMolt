import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'andromolt_settings_v2';

export interface StoredSettings {
    openaiApiKey: string;
    geminiApiKey: string;
    openaiModel: string;
    geminiModel: string;
    preferredLLM: 'openai' | 'gemini' | 'both';
    autoConfirmLowRisk: boolean;
    requireConfirmationMediumRisk: boolean;
    blockHighRisk: boolean;
    rateLimitPerMinute: number;
    onboardingComplete: boolean;
}

export const DEFAULT_SETTINGS: StoredSettings = {
    openaiApiKey: '',
    geminiApiKey: '',
    openaiModel: 'gpt-4o-mini',
    geminiModel: 'gemini-2.0-flash-exp',
    preferredLLM: 'both',
    autoConfirmLowRisk: true,
    requireConfirmationMediumRisk: true,
    blockHighRisk: true,
    rateLimitPerMinute: 20,
    onboardingComplete: false,
};

export async function loadSettings(): Promise<StoredSettings> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export async function saveSettings(settings: Partial<StoredSettings>): Promise<void> {
    try {
        const current = await loadSettings();
        const merged = { ...current, ...settings };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

export async function clearSettings(): Promise<void> {
    try {
        await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.error('Failed to clear settings:', e);
    }
}
