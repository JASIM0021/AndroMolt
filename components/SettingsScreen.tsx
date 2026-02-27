import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    Alert,
    Linking,
    Modal,
    NativeModules,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAutomationStore } from '../lib/stores/automationStore';

const { AndroMoltPermission } = NativeModules;

// All available OpenAI models
const OPENAI_MODELS = [
    { id: 'gpt-4o', label: 'GPT-4o', desc: 'Most capable, higher cost' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Fast & affordable (recommended)' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', desc: 'Powerful, good context' },
    { id: 'gpt-4', label: 'GPT-4', desc: 'Classic GPT-4' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', desc: 'Very fast, low cost' },
    { id: 'o1-mini', label: 'o1 Mini', desc: 'Reasoning model' },
    { id: 'o3-mini', label: 'o3 Mini', desc: 'Latest reasoning model' },
];

// All available Gemini models
const GEMINI_MODELS = [
    { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Exp', desc: 'Latest experimental, fastest' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'Fast & capable (recommended)' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', desc: 'High quality, long context' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', desc: 'Balanced speed & quality' },
    { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B', desc: 'Lightweight, very fast' },
    { id: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro Exp', desc: 'Most advanced (experimental)' },
];

type Tab = 'ai' | 'agent' | 'permissions' | 'about';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export default function SettingsScreen({ visible, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('ai');
    const { settings, updateSettings, resetAllSettings, permissions } = useAutomationStore();

    const [showOpenai, setShowOpenai] = useState(false);
    const [showGemini, setShowGemini] = useState(false);
    const [openaiKey, setOpenaiKey] = useState(settings.openaiApiKey);
    const [geminiKey, setGeminiKey] = useState(settings.geminiApiKey);
    const [showOpenaiModelPicker, setShowOpenaiModelPicker] = useState(false);
    const [showGeminiModelPicker, setShowGeminiModelPicker] = useState(false);

    // Sync local key state when modal opens
    React.useEffect(() => {
        if (visible) {
            setOpenaiKey(settings.openaiApiKey);
            setGeminiKey(settings.geminiApiKey);
        }
    }, [visible, settings.openaiApiKey, settings.geminiApiKey]);

    const saveKeys = async () => {
        await updateSettings({
            openaiApiKey: openaiKey.trim(),
            geminiApiKey: geminiKey.trim(),
        });
    };

    const handleReset = () => {
        Alert.alert(
            'Reset All Settings',
            'This will clear all API keys and reset settings to defaults. You will need to set up your keys again.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                        await resetAllSettings();
                        onClose();
                    },
                },
            ],
        );
    };

    const openPermissionSettings = (type: 'accessibility' | 'overlay') => {
        if (AndroMoltPermission) {
            if (type === 'accessibility') {
                AndroMoltPermission.requestAccessibilityPermission?.().catch(() => { });
            } else {
                AndroMoltPermission.requestOverlayPermission?.().catch(() => { });
            }
        }
        Linking.openSettings();
    };

    const tabs: { id: Tab; icon: string; label: string }[] = [
        { id: 'ai', icon: 'key-outline', label: 'AI Keys' },
        { id: 'agent', icon: 'settings-outline', label: 'Agent' },
        { id: 'permissions', icon: 'shield-outline', label: 'Permissions' },
        { id: 'about', icon: 'information-circle-outline', label: 'About' },
    ];

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Settings</Text>
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                        <Ionicons name="close" size={22} color="#0F172A" />
                    </TouchableOpacity>
                </View>

                {/* Tab Bar */}
                <View style={styles.tabBar}>
                    {tabs.map((t) => (
                        <TouchableOpacity
                            key={t.id}
                            style={[styles.tab, activeTab === t.id && styles.tabActive]}
                            onPress={() => setActiveTab(t.id)}
                        >
                            <Ionicons
                                name={t.icon as any}
                                size={18}
                                color={activeTab === t.id ? '#4338CA' : '#64748B'}
                            />
                            <Text style={[styles.tabLabel, activeTab === t.id && styles.tabLabelActive]}>
                                {t.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">

                    {/* ── AI Keys Tab ─────────────────────────────────────── */}
                    {activeTab === 'ai' && (
                        <View>
                            <SectionHeader icon="logo-openai" title="OpenAI" color="#10B981" />

                            <SettingCard>
                                <Text style={styles.fieldLabel}>API Key</Text>
                                <View style={styles.keyRow}>
                                    <TextInput
                                        style={styles.keyInput}
                                        value={openaiKey}
                                        onChangeText={setOpenaiKey}
                                        placeholder="sk-..."
                                        placeholderTextColor="#94A3B8"
                                        secureTextEntry={!showOpenai}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        onBlur={saveKeys}
                                    />
                                    <TouchableOpacity onPress={() => setShowOpenai(v => !v)}>
                                        <Ionicons name={showOpenai ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.fieldLabel}>Model</Text>
                                <TouchableOpacity
                                    style={styles.dropdownBtn}
                                    onPress={() => setShowOpenaiModelPicker(true)}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.dropdownValue}>
                                            {OPENAI_MODELS.find(m => m.id === settings.openaiModel)?.label ?? settings.openaiModel}
                                        </Text>
                                        <Text style={styles.dropdownDesc}>
                                            {OPENAI_MODELS.find(m => m.id === settings.openaiModel)?.desc ?? ''}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-down" size={18} color="#64748B" />
                                </TouchableOpacity>
                            </SettingCard>

                            <SectionHeader icon="hardware-chip-outline" title="Google Gemini" color="#4338CA" />

                            <SettingCard>
                                <Text style={styles.fieldLabel}>API Key</Text>
                                <View style={styles.keyRow}>
                                    <TextInput
                                        style={styles.keyInput}
                                        value={geminiKey}
                                        onChangeText={setGeminiKey}
                                        placeholder="AIza..."
                                        placeholderTextColor="#94A3B8"
                                        secureTextEntry={!showGemini}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        onBlur={saveKeys}
                                    />
                                    <TouchableOpacity onPress={() => setShowGemini(v => !v)}>
                                        <Ionicons name={showGemini ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.fieldLabel}>Model</Text>
                                <TouchableOpacity
                                    style={styles.dropdownBtn}
                                    onPress={() => setShowGeminiModelPicker(true)}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.dropdownValue}>
                                            {GEMINI_MODELS.find(m => m.id === settings.geminiModel)?.label ?? settings.geminiModel}
                                        </Text>
                                        <Text style={styles.dropdownDesc}>
                                            {GEMINI_MODELS.find(m => m.id === settings.geminiModel)?.desc ?? ''}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-down" size={18} color="#64748B" />
                                </TouchableOpacity>
                            </SettingCard>

                            <SectionHeader icon="git-branch-outline" title="Active Provider" color="#F59E0B" />
                            <SettingCard>
                                <Text style={styles.fieldDesc}>Which provider the agent uses when both keys are set.</Text>
                                {(['both', 'openai', 'gemini'] as const).map((opt) => (
                                    <TouchableOpacity
                                        key={opt}
                                        style={[styles.radioRow, settings.preferredLLM === opt && styles.radioRowActive]}
                                        onPress={() => updateSettings({ preferredLLM: opt })}
                                    >
                                        <View style={[styles.radioCircle, settings.preferredLLM === opt && styles.radioCircleActive]}>
                                            {settings.preferredLLM === opt && <View style={styles.radioDot} />}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.radioLabel}>
                                                {opt === 'both' ? 'Both (OpenAI first, Gemini fallback)' : opt === 'openai' ? 'OpenAI only' : 'Gemini only'}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </SettingCard>

                            <TouchableOpacity style={styles.saveBtn} onPress={saveKeys}>
                                <Text style={styles.saveBtnText}>Save Keys</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* ── Agent Behaviour Tab ─────────────────────────── */}
                    {activeTab === 'agent' && (
                        <View>
                            <SectionHeader icon="flash-outline" title="Risk Controls" color="#EF4444" />
                            <SettingCard>
                                <ToggleRow
                                    label="Auto-confirm Low Risk"
                                    desc="Automatically execute low-risk actions without asking"
                                    value={settings.autoConfirmLowRisk}
                                    onChange={(v) => updateSettings({ autoConfirmLowRisk: v })}
                                />
                                <Divider />
                                <ToggleRow
                                    label="Confirm Medium Risk"
                                    desc="Ask before executing medium-risk actions"
                                    value={settings.requireConfirmationMediumRisk}
                                    onChange={(v) => updateSettings({ requireConfirmationMediumRisk: v })}
                                />
                                <Divider />
                                <ToggleRow
                                    label="Block High Risk"
                                    desc="Prevent potentially dangerous actions (delete, send, payment)"
                                    value={settings.blockHighRisk}
                                    onChange={(v) => updateSettings({ blockHighRisk: v })}
                                />
                            </SettingCard>

                            <SectionHeader icon="timer-outline" title="Performance" color="#4338CA" />
                            <SettingCard>
                                <View style={styles.sliderRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.toggleLabel}>Rate Limit (actions/minute)</Text>
                                        <Text style={styles.toggleDesc}>Current: {settings.rateLimitPerMinute}</Text>
                                    </View>
                                    <View style={styles.rateButtons}>
                                        {[10, 20, 30, 60].map((v) => (
                                            <TouchableOpacity
                                                key={v}
                                                style={[styles.rateBtn, settings.rateLimitPerMinute === v && styles.rateBtnActive]}
                                                onPress={() => updateSettings({ rateLimitPerMinute: v })}
                                            >
                                                <Text style={[styles.rateBtnText, settings.rateLimitPerMinute === v && styles.rateBtnTextActive]}>
                                                    {v}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </SettingCard>
                        </View>
                    )}

                    {/* ── Permissions Tab ─────────────────────────────── */}
                    {activeTab === 'permissions' && (
                        <View>
                            <SectionHeader icon="shield-checkmark-outline" title="App Permissions" color="#10B981" />
                            <SettingCard>
                                <PermissionRow
                                    label="Accessibility Service"
                                    desc="Required for UI automation — clicking buttons and reading screen content"
                                    granted={permissions.accessibility}
                                    onEnable={() => openPermissionSettings('accessibility')}
                                    required
                                />
                                <Divider />
                                <PermissionRow
                                    label="Display Over Other Apps"
                                    desc="Optional — enables advanced gesture and overlay features"
                                    granted={permissions.overlay}
                                    onEnable={() => openPermissionSettings('overlay')}
                                    required={false}
                                />
                            </SettingCard>

                            <View style={styles.infoBox}>
                                <Ionicons name="information-circle-outline" size={16} color="#4338CA" />
                                <Text style={styles.infoText}>
                                    Permissions are checked every time the app launches. If you revoke them in system settings, the agent will stop working.
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* ── About Tab ───────────────────────────────────── */}
                    {activeTab === 'about' && (
                        <View>
                            <SectionHeader icon="apps-outline" title="AndroMolt" color="#4338CA" />
                            <SettingCard>
                                <InfoRow label="Version" value="1.0.0" />
                                <Divider />
                                <InfoRow label="Platform" value="Android" />
                                <Divider />
                                <InfoRow label="Active Model (OpenAI)" value={OPENAI_MODELS.find(m => m.id === settings.openaiModel)?.label ?? settings.openaiModel} />
                                <Divider />
                                <InfoRow label="Active Model (Gemini)" value={GEMINI_MODELS.find(m => m.id === settings.geminiModel)?.label ?? settings.geminiModel} />
                            </SettingCard>

                            <SectionHeader icon="warning-outline" title="Danger Zone" color="#EF4444" />
                            <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
                                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                <Text style={styles.resetBtnText}>Reset All Settings</Text>
                            </TouchableOpacity>
                            <Text style={styles.resetWarning}>
                                This clears all API keys and resets settings to defaults. You will see the setup wizard again.
                            </Text>
                        </View>
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>

                {/* ── OpenAI Model Picker ─────────────────────────── */}
                <ModelPickerModal
                    visible={showOpenaiModelPicker}
                    title="OpenAI Model"
                    models={OPENAI_MODELS}
                    selected={settings.openaiModel}
                    onSelect={(id) => {
                        updateSettings({ openaiModel: id });
                        setShowOpenaiModelPicker(false);
                    }}
                    onClose={() => setShowOpenaiModelPicker(false)}
                />

                {/* ── Gemini Model Picker ─────────────────────────── */}
                <ModelPickerModal
                    visible={showGeminiModelPicker}
                    title="Gemini Model"
                    models={GEMINI_MODELS}
                    selected={settings.geminiModel}
                    onSelect={(id) => {
                        updateSettings({ geminiModel: id });
                        setShowGeminiModelPicker(false);
                    }}
                    onClose={() => setShowGeminiModelPicker(false)}
                />
            </SafeAreaView>
        </Modal>
    );
}

// ── Sub-components ───────────────────────────────────────────

function SectionHeader({ icon, title, color }: { icon: string; title: string; color: string }) {
    return (
        <View style={sectionStyles.row}>
            <View style={[sectionStyles.icon, { backgroundColor: color + '20' }]}>
                <Ionicons name={icon as any} size={16} color={color} />
            </View>
            <Text style={sectionStyles.title}>{title}</Text>
        </View>
    );
}

function SettingCard({ children }: { children: React.ReactNode }) {
    return <View style={cardStyles.card}>{children}</View>;
}

function Divider() {
    return <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 }} />;
}

function ToggleRow({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
        <View style={toggleStyles.row}>
            <View style={{ flex: 1 }}>
                <Text style={toggleStyles.label}>{label}</Text>
                <Text style={toggleStyles.desc}>{desc}</Text>
            </View>
            <Switch
                value={value}
                onValueChange={onChange}
                trackColor={{ false: '#CBD5E1', true: '#818CF8' }}
                thumbColor={value ? '#4338CA' : '#94A3B8'}
            />
        </View>
    );
}

function PermissionRow({
    label, desc, granted, onEnable, required,
}: { label: string; desc: string; granted: boolean; onEnable: () => void; required: boolean }) {
    return (
        <View>
            <View style={permStyles.header}>
                <Text style={permStyles.label}>{label}</Text>
                <View style={[permStyles.badge, granted ? permStyles.badgeGranted : permStyles.badgePending]}>
                    <Text style={[permStyles.badgeText, granted ? permStyles.badgeTextGranted : permStyles.badgeTextPending]}>
                        {granted ? '✓ Granted' : required ? '⚠ Required' : 'Optional'}
                    </Text>
                </View>
            </View>
            <Text style={permStyles.desc}>{desc}</Text>
            {!granted && (
                <TouchableOpacity style={permStyles.btn} onPress={onEnable}>
                    <Text style={permStyles.btnText}>Open Settings to Enable</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.toggleLabel, { flex: 1 }]}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
        </View>
    );
}

interface ModelOption { id: string; label: string; desc: string }
function ModelPickerModal({
    visible, title, models, selected, onSelect, onClose,
}: { visible: boolean; title: string; models: ModelOption[]; selected: string; onSelect: (id: string) => void; onClose: () => void }) {
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={pickerStyles.overlay}>
                <View style={pickerStyles.sheet}>
                    <View style={pickerStyles.handle} />
                    <Text style={pickerStyles.title}>{title}</Text>
                    <ScrollView>
                        {models.map((m) => (
                            <TouchableOpacity
                                key={m.id}
                                style={[pickerStyles.item, selected === m.id && pickerStyles.itemActive]}
                                onPress={() => onSelect(m.id)}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={pickerStyles.itemLabel}>{m.label}</Text>
                                    <Text style={pickerStyles.itemDesc}>{m.desc}</Text>
                                </View>
                                {selected === m.id && <Ionicons name="checkmark-circle" size={20} color="#4338CA" />}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={pickerStyles.cancelBtn} onPress={onClose}>
                        <Text style={pickerStyles.cancel}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        paddingHorizontal: 8,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        gap: 4,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: '#4338CA' },
    tabLabel: { fontSize: 11, color: '#64748B', fontWeight: '500' },
    tabLabelActive: { color: '#4338CA', fontWeight: '700' },
    body: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    // Key inputs
    fieldLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    fieldDesc: { fontSize: 13, color: '#64748B', marginBottom: 12, lineHeight: 18 },
    keyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        paddingRight: 12,
        marginBottom: 16,
    },
    keyInput: {
        flex: 1,
        fontSize: 14,
        color: '#0F172A',
        paddingHorizontal: 14,
        paddingVertical: 12,
        letterSpacing: 0.3,
    },
    // Dropdown
    dropdownBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 4,
    },
    dropdownValue: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
    dropdownDesc: { fontSize: 12, color: '#64748B', marginTop: 2 },
    // Radio
    radioRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        gap: 12,
        marginBottom: 8,
        borderWidth: 1.5,
        borderColor: '#F1F5F9',
        backgroundColor: '#F8FAFC',
    },
    radioRowActive: { borderColor: '#818CF8', backgroundColor: '#EEF2FF' },
    radioCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#CBD5E1',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioCircleActive: { borderColor: '#4338CA' },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4338CA' },
    radioLabel: { fontSize: 14, color: '#1E293B', fontWeight: '500' },
    // Save button
    saveBtn: {
        backgroundColor: '#4338CA',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 4,
        shadowColor: '#4338CA',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    // Agent sliders
    toggleLabel: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
    toggleDesc: { fontSize: 12, color: '#64748B', marginTop: 2 },
    sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rateButtons: { flexDirection: 'row', gap: 6 },
    rateBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#F1F5F9',
    },
    rateBtnActive: { backgroundColor: '#4338CA' },
    rateBtnText: { fontSize: 13, fontWeight: '600', color: '#475569' },
    rateBtnTextActive: { color: '#fff' },
    // Info
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: '#EEF2FF',
        borderRadius: 12,
        padding: 14,
        marginTop: 4,
        marginHorizontal: 0,
    },
    infoText: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 19 },
    infoValue: { fontSize: 13, fontWeight: '600', color: '#4338CA', textAlign: 'right', maxWidth: '55%' },
    // Reset
    resetBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#FEF2F2',
        borderRadius: 14,
        paddingVertical: 16,
        borderWidth: 1.5,
        borderColor: '#FECACA',
        marginBottom: 8,
    },
    resetBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 15 },
    resetWarning: { fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 17 },
});

const sectionStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 4,
        paddingTop: 20,
        paddingBottom: 8,
    },
    icon: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: { fontSize: 13, fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: 0.5 },
});

const cardStyles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
});

const toggleStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    label: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
    desc: { fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 17 },
});

const permStyles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    label: { fontSize: 15, fontWeight: '700', color: '#1E293B', flex: 1 },
    desc: { fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 10 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    badgeGranted: { backgroundColor: '#D1FAE5' },
    badgePending: { backgroundColor: '#FEF3C7' },
    badgeText: { fontSize: 12, fontWeight: '700' },
    badgeTextGranted: { color: '#065F46' },
    badgeTextPending: { color: '#92400E' },
    btn: {
        backgroundColor: '#EEF2FF',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
        marginTop: 4,
    },
    btnText: { color: '#4338CA', fontWeight: '700', fontSize: 13 },
});

const pickerStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(15,23,42,0.5)',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 12,
        paddingBottom: 32,
        maxHeight: '80%',
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#CBD5E1',
        alignSelf: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 17,
        fontWeight: '800',
        color: '#0F172A',
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: -0.3,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        gap: 12,
    },
    itemActive: { backgroundColor: '#EEF2FF' },
    itemLabel: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
    itemDesc: { fontSize: 12, color: '#64748B', marginTop: 2 },
    cancelBtn: {
        marginHorizontal: 20,
        marginTop: 12,
        backgroundColor: '#F1F5F9',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    cancel: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
});
