import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAutomationStore } from '../lib/stores/automationStore';

const STEPS = ['welcome', 'openai', 'gemini', 'done'] as const;
type Step = typeof STEPS[number];

interface Props {
    onComplete: () => void;
}

export default function ApiKeySetupScreen({ onComplete }: Props) {
    const [step, setStep] = useState<Step>('welcome');
    const [openaiKey, setOpenaiKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [showOpenai, setShowOpenai] = useState(false);
    const [showGemini, setShowGemini] = useState(false);
    const [saving, setSaving] = useState(false);

    const { updateSettings } = useAutomationStore();

    const goNext = () => {
        const idx = STEPS.indexOf(step);
        if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
    };

    const handleFinish = async () => {
        if (!openaiKey.trim() && !geminiKey.trim()) {
            Alert.alert(
                'API Key Required',
                'Please enter at least one API key (OpenAI or Gemini) to use AndroMolt.',
                [{ text: 'OK' }],
            );
            return;
        }
        setSaving(true);
        try {
            await updateSettings({
                openaiApiKey: openaiKey.trim(),
                geminiApiKey: geminiKey.trim(),
                onboardingComplete: true,
                preferredLLM: openaiKey.trim() && geminiKey.trim()
                    ? 'both'
                    : openaiKey.trim() ? 'openai' : 'gemini',
            });
            onComplete();
        } finally {
            setSaving(false);
        }
    };

    // ── Step: Welcome ────────────────────────────────────────────
    if (step === 'welcome') {
        return (
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.center}>
                    <View style={styles.logoRing}>
                        <View style={styles.logo}>
                            <Ionicons name="hardware-chip" size={40} color="#fff" />
                        </View>
                    </View>
                    <Text style={styles.heading}>Welcome to AndroMolt</Text>
                    <Text style={styles.sub}>
                        AI-powered Android automation at your fingertips.{'\n'}
                        Let's set up your AI model keys to get started.
                    </Text>

                    <View style={styles.featureList}>
                        {[
                            { icon: 'flash-outline', label: 'Automate any task, any app' },
                            { icon: 'shield-checkmark-outline', label: 'Keys stay on your device' },
                            { icon: 'swap-horizontal-outline', label: 'Supports OpenAI & Gemini' },
                        ].map((f) => (
                            <View key={f.label} style={styles.featureItem}>
                                <View style={styles.featureIcon}>
                                    <Ionicons name={f.icon as any} size={18} color="#4338CA" />
                                </View>
                                <Text style={styles.featureText}>{f.label}</Text>
                            </View>
                        ))}
                    </View>

                    <TouchableOpacity style={styles.primaryBtn} onPress={goNext}>
                        <Text style={styles.primaryBtnText}>Get Started →</Text>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ── Step: OpenAI ─────────────────────────────────────────────
    if (step === 'openai') {
        return (
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                    <ScrollView contentContainerStyle={styles.center}>
                        <StepIndicator current={1} total={2} />
                        <View style={styles.providerBadge}>
                            <Text style={styles.providerBadgeText}>OpenAI</Text>
                        </View>
                        <Text style={styles.heading}>ChatGPT API Key</Text>
                        <Text style={styles.sub}>
                            Your key is stored locally and never sent to our servers.
                        </Text>

                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.keyInput}
                                value={openaiKey}
                                onChangeText={setOpenaiKey}
                                placeholder="sk-..."
                                placeholderTextColor="#94A3B8"
                                secureTextEntry={!showOpenai}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowOpenai(v => !v)}>
                                <Ionicons name={showOpenai ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.helpCard}>
                            <Ionicons name="information-circle-outline" size={16} color="#4338CA" />
                            <Text style={styles.helpText}>
                                Get your key at{' '}
                                <Text style={styles.link}>platform.openai.com/api-keys</Text>
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={[styles.primaryBtn, !openaiKey.trim() && styles.primaryBtnOutline]}
                            onPress={goNext}
                        >
                            <Text style={[styles.primaryBtnText, !openaiKey.trim() && styles.primaryBtnOutlineText]}>
                                {openaiKey.trim() ? 'Continue →' : 'Skip for now'}
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    // ── Step: Gemini ─────────────────────────────────────────────
    if (step === 'gemini') {
        return (
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                    <ScrollView contentContainerStyle={styles.center}>
                        <StepIndicator current={2} total={2} />
                        <View style={[styles.providerBadge, styles.providerBadgeGemini]}>
                            <Text style={styles.providerBadgeText}>Google Gemini</Text>
                        </View>
                        <Text style={styles.heading}>Gemini API Key</Text>
                        <Text style={styles.sub}>
                            Add your Gemini key for vision-based automation (screenshot understanding).
                        </Text>

                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.keyInput}
                                value={geminiKey}
                                onChangeText={setGeminiKey}
                                placeholder="AIza..."
                                placeholderTextColor="#94A3B8"
                                secureTextEntry={!showGemini}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowGemini(v => !v)}>
                                <Ionicons name={showGemini ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.helpCard}>
                            <Ionicons name="information-circle-outline" size={16} color="#4338CA" />
                            <Text style={styles.helpText}>
                                Get your key at{' '}
                                <Text style={styles.link}>aistudio.google.com/app/apikey</Text>
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={[styles.primaryBtn, !geminiKey.trim() && styles.primaryBtnOutline]}
                            onPress={goNext}
                        >
                            <Text style={[styles.primaryBtnText, !geminiKey.trim() && styles.primaryBtnOutlineText]}>
                                {geminiKey.trim() ? 'Continue →' : 'Skip for now'}
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    // ── Step: Done ───────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.center}>
                <View style={styles.doneIcon}>
                    <Ionicons name="checkmark-circle" size={56} color="#10B981" />
                </View>
                <Text style={styles.heading}>All Set!</Text>
                <Text style={styles.sub}>
                    {openaiKey.trim() && geminiKey.trim()
                        ? 'Both OpenAI and Gemini are configured — you get the best of both!'
                        : openaiKey.trim()
                            ? 'OpenAI configured. You can add Gemini later in Settings.'
                            : 'Gemini configured. You can add OpenAI later in Settings.'}
                </Text>

                <View style={styles.summaryCard}>
                    <SummaryRow label="OpenAI" value={openaiKey.trim() ? '✓ Added' : '— Not set'} ok={!!openaiKey.trim()} />
                    <SummaryRow label="Gemini" value={geminiKey.trim() ? '✓ Added' : '— Not set'} ok={!!geminiKey.trim()} />
                </View>

                <TouchableOpacity
                    style={[styles.primaryBtn, saving && { opacity: 0.7 }]}
                    onPress={handleFinish}
                    disabled={saving}
                >
                    <Text style={styles.primaryBtnText}>
                        {saving ? 'Saving…' : 'Start using AndroMolt →'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.backBtn} onPress={() => setStep('gemini')}>
                    <Text style={styles.backBtnText}>← Back</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

// ── Sub-components ───────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
    return (
        <View style={styles.stepIndicatorRow}>
            {Array.from({ length: total }).map((_, i) => (
                <View
                    key={i}
                    style={[styles.stepDot, i + 1 === current && styles.stepDotActive]}
                />
            ))}
        </View>
    );
}

function SummaryRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
    return (
        <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <Text style={[styles.summaryValue, ok ? styles.summaryOk : styles.summaryMissing]}>{value}</Text>
        </View>
    );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
    center: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingVertical: 48,
    },
    logoRing: {
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
    },
    logo: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#4338CA',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#4338CA',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 10,
    },
    heading: {
        fontSize: 28,
        fontWeight: '800',
        color: '#0F172A',
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: -0.5,
    },
    sub: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 23,
        marginBottom: 32,
    },
    featureList: { width: '100%', marginBottom: 32, gap: 12 },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 16,
        gap: 14,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        elevation: 2,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
    },
    featureIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    featureText: { fontSize: 15, color: '#1E293B', fontWeight: '600', flex: 1 },
    primaryBtn: {
        width: '100%',
        backgroundColor: '#4338CA',
        borderRadius: 16,
        paddingVertical: 18,
        alignItems: 'center',
        shadowColor: '#4338CA',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 5,
    },
    primaryBtnOutline: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '#4338CA',
        shadowOpacity: 0,
        elevation: 0,
    },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    primaryBtnOutlineText: { color: '#4338CA' },
    backBtn: { marginTop: 16, paddingVertical: 10 },
    backBtnText: { color: '#64748B', fontSize: 15, fontWeight: '600' },
    // Inputs
    inputWrapper: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        marginBottom: 16,
        paddingRight: 12,
    },
    keyInput: {
        flex: 1,
        fontSize: 15,
        color: '#0F172A',
        paddingHorizontal: 16,
        paddingVertical: 16,
        letterSpacing: 0.5,
    },
    eyeBtn: { padding: 6 },
    helpCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        backgroundColor: '#EEF2FF',
        borderRadius: 12,
        padding: 14,
        marginBottom: 32,
        width: '100%',
    },
    helpText: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 19 },
    link: { color: '#4338CA', fontWeight: '600' },
    // Badges
    providerBadge: {
        backgroundColor: '#10B981',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 6,
        marginBottom: 16,
    },
    providerBadgeGemini: { backgroundColor: '#4338CA' },
    providerBadgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    // Step indicator
    stepIndicatorRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
    stepDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#CBD5E1',
    },
    stepDotActive: { backgroundColor: '#4338CA', width: 24, borderRadius: 4 },
    // Done
    doneIcon: { marginBottom: 24 },
    summaryCard: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        elevation: 2,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        gap: 12,
    },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    summaryLabel: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
    summaryValue: { fontSize: 14, fontWeight: '600' },
    summaryOk: { color: '#10B981' },
    summaryMissing: { color: '#94A3B8' },
});
