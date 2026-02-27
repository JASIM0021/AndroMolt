import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  DeviceEventEmitter,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVoiceInput } from '../hooks/useVoiceInput';
import type { AgentEvent } from '../lib/automation/AgentEvents';
import { useAutomationStore } from '../lib/stores/automationStore';
import ApiKeySetupScreen from './ApiKeySetupScreen';
import OnboardingScreen from './OnboardingScreen';
import SettingsScreen from './SettingsScreen';

const { AndroMoltCore, AndroMoltPermission } = NativeModules;

// API keys are loaded from AsyncStorage via the store

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'report';
  content: string;
  timestamp: string;
  actionPlan?: any;
  results?: any[];
}

export default function ChatInterface() {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);
  const [agentLogs, setAgentLogs] = useState<AgentEvent[]>([]);
  const [agentProgress, setAgentProgress] = useState({ step: 0, maxSteps: 50, message: '', completedItems: 0, targetItems: 0 });
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [installedApps, setInstalledApps] = useState<{ name: string, packageName: string, icon: string }[]>([]);
  const [selectedApp, setSelectedApp] = useState<{ name: string, packageName: string, icon: string } | null>(null);
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Voice input
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { isListening, startListening, stopListening, error: voiceError } = useVoiceInput(
    (text) => setInputText(text),
  );

  // Pulse animation for voice button when listening
  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening, pulseAnim]);

  const {
    chatMessages,
    addChatMessage,
    addToHistory,
    isExecuting,
    setIsExecuting,
    settings,
    settingsLoaded,
    loadPersistedSettings,
    permissions,
  } = useAutomationStore();

  // Subscribe to native agent events
  useEffect(() => {
    // Native agent events
    const handleNativeAgentStart = (data: any) => {
      setIsAgentRunning(true);
      setAgentLogs(prev => [...prev, {
        type: 'info',
        message: `🚀 Agent started: ${data.goal}`,
        timestamp: new Date().toISOString()
      }]);
    };

    const handleNativeAgentStep = (data: any) => {
      setAgentProgress(prev => ({
        ...prev,
        step: data.step,
        maxSteps: data.maxSteps ?? prev.maxSteps,
        message: data.targetItems > 0
          ? `${data.completedItems}/${data.targetItems} done — ${data.package}`
          : `Package: ${data.package}`,
        completedItems: data.completedItems ?? 0,
        targetItems: data.targetItems ?? 0,
      }));
      setAgentLogs(prev => [...prev, {
        type: 'info',
        message: `Step ${data.step}: ${data.package} (${data.elementCount} elements)`,
        timestamp: new Date().toISOString()
      }]);
    };

    const handleAgentExtend = (data: any) => {
      setAgentLogs(prev => [...prev, {
        type: 'info',
        message: `📈 Budget extended: ${data.completedItems}/${data.targetItems} done → now ${data.newMaxSteps} max steps`,
        timestamp: new Date().toISOString()
      }]);
    };

    const handleNativeAgentAction = (data: any) => {
      setAgentProgress(prev => ({
        ...prev,
        message: `${data.action}: ${data.reasoning}`
      }));
      setAgentLogs(prev => [...prev, {
        type: 'action',
        message: `🎯 ${data.action}: ${data.reasoning}`,
        timestamp: new Date().toISOString()
      }]);
    };

    const handleNativeActionResult = (data: any) => {
      setAgentLogs(prev => [...prev, {
        type: data.success ? 'success' : 'error',
        message: `${data.success ? '✅' : '❌'} ${data.message}`,
        timestamp: new Date().toISOString()
      }]);
    };

    const handleNativeAgentThink = (data: any) => {
      setAgentLogs(prev => [...prev, {
        type: 'thinking',
        message: `💭 ${data.message}`,
        timestamp: new Date().toISOString()
      }]);
    };

    const handleNativeAgentComplete = (data: any) => {
      setIsAgentRunning(false);
      setAgentLogs(prev => [...prev, {
        type: 'goal_achieved',
        message: `🎉 Completed in ${data.steps} steps: ${data.message}`,
        timestamp: new Date().toISOString()
      }]);
    };

    const handleAgentReport = (data: any) => {
      const icon = data.overallPassed ? '✅' : '❌';
      const reportText =
        `${icon} QA Report: "${data.goal}"\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `✅ Passed: ${data.passedSteps}/${data.totalSteps} steps\n` +
        `❌ Failed: ${data.failedSteps}/${data.totalSteps} steps\n` +
        `💾 Saved: ${data.savedPath}`;
      addChatMessage({
        id: Date.now().toString(),
        type: 'report',
        content: reportText,
        timestamp: new Date().toISOString(),
      });
    };

    // Subscribe to native events
    const agentStartListener = DeviceEventEmitter.addListener('agentStart', handleNativeAgentStart);
    const agentStepListener = DeviceEventEmitter.addListener('agentStep', handleNativeAgentStep);
    const agentActionListener = DeviceEventEmitter.addListener('agentAction', handleNativeAgentAction);
    const actionResultListener = DeviceEventEmitter.addListener('actionResult', handleNativeActionResult);
    const agentThinkListener = DeviceEventEmitter.addListener('agentThink', handleNativeAgentThink);
    const agentCompleteListener = DeviceEventEmitter.addListener('agentComplete', handleNativeAgentComplete);
    const agentReportListener = DeviceEventEmitter.addListener('agentReport', handleAgentReport);
    const agentExtendListener = DeviceEventEmitter.addListener('agentExtend', handleAgentExtend);

    return () => {
      agentStartListener.remove();
      agentStepListener.remove();
      agentActionListener.remove();
      actionResultListener.remove();
      agentThinkListener.remove();
      agentCompleteListener.remove();
      agentReportListener.remove();
      agentExtendListener.remove();
    };
  }, []);

  // Load installed apps with icons on mount
  useEffect(() => {
    if (AndroMoltCore) {
      AndroMoltCore.getInstalledAppsWithIcons()
        .then((apps: any[]) => setInstalledApps(apps))
        .catch((error: any) => {
          console.error('Failed to load installed apps:', error);
          setInstalledApps([]);
        });
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [chatMessages]);

  // Load persisted settings on mount
  useEffect(() => {
    loadPersistedSettings();
  }, []);

  // Check permissions on mount and periodically
  useEffect(() => {
    setCheckingPermissions(false);
    setPermissionsGranted(false);
    checkInitialPermissions();
    const interval = setInterval(checkInitialPermissions, 2000);
    return () => clearInterval(interval);
  }, []);

  const checkInitialPermissions = async () => {
    try {
      if (!AndroMoltCore) {
        setCheckingPermissions(false);
        setPermissionsGranted(false);
        return;
      }
      const status = await AndroMoltCore.getSystemStatus();
      setCheckingPermissions(false);
      if (status.permissions.accessibility) {
        setPermissionsGranted(true);
      } else {
        setPermissionsGranted(false);
      }
    } catch (e) {
      console.error('Error checking permissions:', e);
      setCheckingPermissions(false);
      setPermissionsGranted(false);
    }
  };

  // Handle back button to prevent exiting during onboarding
  useEffect(() => {
    if (!permissionsGranted) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => backHandler.remove();
    }
  }, [permissionsGranted]);

  // Show loading while checking permissions OR loading settings
  if (checkingPermissions || !settingsLoaded) {
    return (
      <View style={styles.initialLoadingContainer}>
        <View style={styles.splashLogoWrapper}>
          <Image
            source={require('../assets/images/icon.png')}
            style={styles.splashLogoImage}
            resizeMode="cover"
          />
        </View>
        <ActivityIndicator size="large" color="#4338CA" style={{ marginTop: 28 }} />
        <Text style={styles.splashSubtitle}>Starting AndroMolt…</Text>
      </View>
    );
  }

  // Show onboarding until permissions are granted
  if (!permissionsGranted) {
    return <OnboardingScreen />;
  }

  // Show API key setup if not completed yet
  if (!settings.onboardingComplete) {
    return <ApiKeySetupScreen onComplete={() => { }} />;
  }

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    // Stop active voice recognition to prevent appending text after clear
    if (isListening) {
      stopListening();
    }

    const userMessage = inputText.trim();
    setInputText('');
    setIsLoading(true);
    setIsExecuting(true);
    setAgentLogs([]);

    // Add user message
    addChatMessage({
      id: Date.now().toString(),
      type: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    try {
      // Add instruction message
      const instructionId = `instruction_${Date.now()}`;
      addChatMessage({
        id: instructionId,
        type: 'system',
        content: `▶️ Agent started!

👉 Watch the notification for progress
👉 DO NOT click the notification - just watch it
👉 DO NOT touch your phone until task completes
👉 The target app will open automatically

Let the agent work...`,
        timestamp: new Date().toISOString(),
      });

      // Use the native agent loop for reliable background execution
      // Prepend [TARGET_APP:] prefix if an app was selected via the picker.
      const fullGoal = selectedApp
        ? `[TARGET_APP:${selectedApp.packageName}] ${userMessage}`
        : userMessage;
      const result = await AndroMoltCore.runNativeAgent(
        fullGoal,
        settings.openaiApiKey || null,
        settings.geminiApiKey || null,
        settings.openaiModel || 'gpt-4o-mini',
        settings.geminiModel || 'gemini-2.0-flash-exp'
      );

      const responseMessage = result.success
        ? `✅ Task completed in ${result.steps} steps: ${result.message}`
        : `⚠️ Task ended after ${result.steps} steps: ${result.message}`;

      addChatMessage({
        id: Date.now().toString(),
        type: 'assistant',
        content: responseMessage,
        timestamp: new Date().toISOString(),
      });

      addToHistory({
        actionId: 'agent',
        type: 'agent_loop',
        status: result.success ? 'completed' : 'failed',
        success: result.success,
        message: result.message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Agent execution error:', error);
      addChatMessage({
        id: Date.now().toString(),
        type: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
      setIsExecuting(false);
    }
  };

  const handleCancelAgent = async () => {
    try {
      await AndroMoltCore.cancelNativeAgent();
      setIsAgentRunning(false);
      setAgentLogs(prev => [...prev, {
        type: 'error',
        message: '🛑 Agent cancelled by user',
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('Failed to cancel agent:', error);
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.type === 'user';
    const isSystem = message.type === 'system';
    const isReport = message.type === 'report';
    const isAssistant = message.type === 'assistant';

    return (
      <View key={message.id} style={[styles.messageContainer, isUser && styles.userMessage]}>
        {!isUser && !isSystem && !isReport && (
          <View style={styles.avatarContainer}>
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.agentAvatarImage}
              resizeMode="cover"
            />
          </View>
        )}

        <View style={styles.bubbleWrapper}>
          <View style={[
            styles.messageBubble,
            isUser && styles.userBubble,
            isSystem && styles.systemBubble,
            isReport && styles.reportBubble,
            isAssistant && styles.assistantBubble,
          ]}>
            <Text style={[
              styles.messageText,
              isUser && styles.userText,
              isSystem && styles.systemText,
              isReport && styles.reportText,
              isAssistant && styles.assistantText,
            ]}>
              {message.content}
            </Text>

            {message.results && (
              <View style={styles.resultsContainer}>
                <Text style={styles.resultsTitle}>Action Results:</Text>
                {message.results.map((result: any, index: number) => (
                  <View key={index} style={styles.resultItem}>
                    <Text style={[
                      styles.resultText,
                      result.success ? styles.successText : styles.errorText
                    ]}>
                      {result.success ? '✓' : '✗'} {result.message}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <Text style={[styles.timestamp, isUser && styles.timestampRight]}>
            {formatTime(message.timestamp)}
          </Text>
        </View>

        {isUser && (
          <View style={styles.avatarContainer}>
            <View style={styles.userAvatar}>
              <Ionicons name="person" size={15} color="#64748B" />
            </View>
          </View>
        )}
      </View>
    );
  };

  const handleQuickAction = (action: string) => {
    setInputText(action);
  };

  const insets = useSafeAreaInsets();

  const quickActions = [
    { label: '▶ YouTube', action: 'Open YouTube and play a Hindi song' },
    { label: '💬 WhatsApp', action: 'Launch WhatsApp' },
    { label: '⚙ Settings', action: 'Open Settings' },
    { label: '📸 Instagram', action: 'Open Instagram' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" backgroundColor="#4338CA" translucent={false} />

      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* ── Premium Header ─────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerLogoRow}>
              <Image
                source={require('../assets/images/icon.png')}
                style={styles.headerLogoImage}
                resizeMode="cover"
              />
              <View>
                <Text style={styles.headerTitle}>AndroMolt</Text>
                <View style={styles.headerStatusRow}>
                  <View style={[
                    styles.statusDot,
                    isAgentRunning ? styles.statusDotRunning : styles.statusDotReady
                  ]} />
                  <Text style={styles.headerSubtitle}>
                    {isAgentRunning ? 'Agent running…' : 'Ready'}
                  </Text>
                </View>
              </View>
            </View>
            {isExecuting ? (
              <View style={styles.executingIndicator}>
                <ActivityIndicator size="small" color="#4338CA" />
                <Text style={styles.executingText}>Running…</Text>
              </View>
            ) : (
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => setShowAppPicker(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="apps-outline" size={20} color="#4338CA" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => setShowSettings(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="settings-outline" size={20} color="#4338CA" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* ── Agent Progress Panel ───────────────────────── */}
        {isAgentRunning && (
          <View style={styles.agentProgressContainer}>
            <View style={styles.agentProgressHeader}>
              <View style={styles.agentTitleRow}>
                <View style={styles.agentDot} />
                <Text style={styles.agentProgressTitle}>Agent Active</Text>
                <Text style={styles.agentProgressStep}>
                  {agentProgress.targetItems > 0
                    ? ` · ${agentProgress.completedItems}/${agentProgress.targetItems} · Step ${agentProgress.step}`
                    : ` · Step ${agentProgress.step}`}
                </Text>
              </View>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelAgent}>
                <Ionicons name="stop-circle-outline" size={14} color="#FECACA" />
                <Text style={styles.cancelButtonText}> Stop</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBar,
                  { width: '100%', opacity: 0.4 + (agentProgress.step % 3) * 0.2 }
                ]}
              />
            </View>
            {agentProgress.message ? (
              <Text style={styles.agentProgressMessage} numberOfLines={1}>
                {agentProgress.message}
              </Text>
            ) : null}
            <ScrollView style={styles.logsContainer} nestedScrollEnabled>
              {agentLogs.slice(-12).map((log, index) => (
                <Text
                  key={index}
                  style={[
                    styles.logText,
                    log.type === 'error' && styles.logError,
                    log.type === 'goal_achieved' && styles.logSuccess,
                    log.type === 'thinking' && styles.logThinking,
                  ]}
                >
                  {log.message}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Quick Actions ──────────────────────────────── */}
        <View style={styles.quickActions}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsRow}
          >
            {quickActions.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.quickAction}
                onPress={() => handleQuickAction(item.action)}
                activeOpacity={0.7}
              >
                <Text style={styles.quickActionText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Chat Messages ──────────────────────────────── */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={[styles.messagesContent, chatMessages.length === 0 && styles.messagesContentEmpty]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {chatMessages.length === 0 && !isLoading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconRing}>
                <Ionicons name="chatbubbles-outline" size={40} color="#A5B4FC" />
              </View>
              <Text style={styles.emptyTitle}>How can I help?</Text>
              <Text style={styles.emptySubtitle}>
                Give me a goal and I'll automate it on your Android device.
              </Text>
            </View>
          ) : (
            chatMessages.map(renderMessage)
          )}
          {isLoading && (
            <View style={styles.typingContainer}>
              <Image
                source={require('../assets/images/icon.png')}
                style={styles.agentAvatarImage}
                resizeMode="cover"
              />
              <View style={styles.typingBubble}>
                <View style={styles.typingDots}>
                  <View style={[styles.typingDot, { opacity: 0.4 }]} />
                  <View style={[styles.typingDot, { opacity: 0.7 }]} />
                  <View style={styles.typingDot} />
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── Bottom Toolbar ─────────────────────────────── */}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          {/* Listening Banner */}
          {isListening && (
            <View style={styles.listeningBanner}>
              <View style={styles.listeningDot} />
              <Text style={styles.listeningText}>Listening…</Text>
            </View>
          )}
          {voiceError ? (
            <Text style={styles.voiceErrorText}>{voiceError}</Text>
          ) : null}

          {/* Target App pill (compact, inside toolbar) */}
          {selectedApp && (
            <View style={styles.targetAppPill}>
              <Ionicons name="phone-portrait-outline" size={13} color="#4338CA" />
              <Text style={styles.targetAppPillText} numberOfLines={1}>{selectedApp.name}</Text>
              <TouchableOpacity onPress={() => setSelectedApp(null)}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputRow}>
            {/* App Picker trigger */}
            <TouchableOpacity
              style={styles.appPickTrigger}
              onPress={() => setShowAppPicker(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="apps-outline" size={20} color="#64748B" />
            </TouchableOpacity>

            <TextInput
              style={[styles.textInput, isLoading && styles.textInputDisabled]}
              value={inputText}
              onChangeText={setInputText}
              placeholder={isListening ? 'Speak now…' : 'Tell me what to do…'}
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={500}
              editable={!isLoading}
              textAlignVertical="center"
            />
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[
                  styles.voiceButton,
                  isListening && styles.voiceButtonActive,
                ]}
                onPress={() => isListening ? stopListening() : startListening()}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isListening ? 'radio' : 'mic'}
                  size={20}
                  color={isListening ? '#fff' : '#4338CA'}
                />
              </TouchableOpacity>
            </Animated.View>
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
              ]}
              onPress={handleSendMessage}
              disabled={!inputText.trim() || isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="arrow-up" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
          {inputText.length > 400 ? (
            <Text style={styles.charCount}>{inputText.length}/500</Text>
          ) : null}
        </View>

        {/* ── App Picker Modal ───────────────────────────── */}
        <Modal visible={showAppPicker} animationType="slide" transparent>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHandle} />
              <Text style={styles.pickerTitle}>Target App</Text>
              <TouchableOpacity
                style={styles.pickerAllApps}
                onPress={() => { setSelectedApp(null); setShowAppPicker(false); }}
              >
                <Ionicons name="layers-outline" size={20} color="#4338CA" />
                <Text style={styles.pickerAllAppsText}>All apps (auto-detect)</Text>
                {!selectedApp && <Ionicons name="checkmark" size={18} color="#10B981" />}
              </TouchableOpacity>
              <FlatList
                data={installedApps}
                keyExtractor={item => item.packageName}
                renderItem={({ item }) => {
                    const colors = ['#4338CA','#0891B2','#059669','#D97706','#DC2626','#7C3AED'];
                    const colorIdx = item.packageName.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % colors.length;
                    const iconColor = colors[colorIdx];
                    const initials = item.name.slice(0, 2).toUpperCase();
                    const hasIcon = !!item.icon;
                    return (
                  <TouchableOpacity
                    style={[styles.pickerItem, selectedApp?.packageName === item.packageName && styles.pickerItemSelected]}
                    onPress={() => { setSelectedApp(item); setShowAppPicker(false); }}
                  >
                    {hasIcon ? (
                      <Image
                        source={{ uri: item.icon }}
                        style={styles.appIconImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.appIcon, { backgroundColor: iconColor + '18', borderColor: iconColor + '40' }]}>
                        <Text style={[styles.appIconText, { color: iconColor }]}>{initials}</Text>
                      </View>
                    )}
                    <View style={styles.pickerItemLeft}>
                      <Text style={styles.pickerItemText}>{item.name}</Text>
                      <Text style={styles.pickerItemPkg}>{item.packageName}</Text>
                    </View>
                    {selectedApp?.packageName === item.packageName && (
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    )}
                  </TouchableOpacity>
                    );
                  }}
              />
              <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setShowAppPicker(false)}>
                <Text style={styles.pickerCancel}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ── Settings Modal ──────────────────────────────── */}
        <SettingsScreen visible={showSettings} onClose={() => setShowSettings(false)} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ── Splash / Loading ─────────────────────────────────────────
  splashLogo: {
    // kept for compatibility, not used directly
    width: 80, height: 80, borderRadius: 26, backgroundColor: '#4338CA',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4338CA', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
  },
  splashLogoWrapper: {
    width: 100,
    height: 100,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  splashLogoImage: {
    width: 100,
    height: 100,
  },
  splashLogoText: {
    color: '#fff', fontSize: 40, fontWeight: '900',
  },
  splashSubtitle: {
    marginTop: 16,
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },

  safeArea: {
    flex: 1,
    backgroundColor: '#4338CA',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // ── Header ──────────────────────────────────────────────
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    elevation: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#4338CA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  headerLogoImage: {
    width: 44,
    height: 44,
    borderRadius: 14,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  headerLogoText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotReady: {
    backgroundColor: '#10B981',
  },
  statusDotRunning: {
    backgroundColor: '#F59E0B',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  executingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  executingText: {
    fontSize: 13,
    color: '#4338CA',
    fontWeight: '600',
  },

  // ── Quick Actions ────────────────────────────────────────
  quickActions: {
    backgroundColor: 'transparent',
    paddingTop: 12,
    paddingBottom: 8,
  },
  quickActionsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    paddingHorizontal: 20,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  quickActionsRow: {
    paddingHorizontal: 16,
    gap: 10,
  },
  quickAction: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  quickActionText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Messages ─────────────────────────────────────────────
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  messagesContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // ── Empty State ───────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '400',
  },

  // ── Typing Indicator ──────────────────────────────────────
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  typingBubble: {
    marginLeft: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  typingDots: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
  },

  // ── Chat Bubble Wrapper + Timestamp ────────────────────────
  bubbleWrapper: {
    maxWidth: '75%',
  },
  timestamp: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    marginLeft: 4,
    fontWeight: '500',
  },
  timestampRight: {
    textAlign: 'right',
    marginRight: 4,
    marginLeft: 0,
  },

  // ── Agent Avatar image ─────────────────────────────────────────
  agentAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 12,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },

  messageContainer: {
    flexDirection: 'row',
    marginBottom: 18,
    alignItems: 'flex-end',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  avatarContainer: {
    marginHorizontal: 8,
    marginBottom: 2,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4338CA',
  },

  // ── Assistant bubble ────────────────────────────────────────
  assistantBubble: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderBottomLeftRadius: 4,
    borderRadius: 18,
  },
  assistantText: {
    color: '#1E1B4B',
    fontWeight: '500',
  },
  messageBubble: {
    maxWidth: '75%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  userBubble: {
    backgroundColor: '#4338CA',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 4,
    borderWidth: 0,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  systemBubble: {
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    maxWidth: '85%',
    borderColor: '#FDE68A',
  },
  messageText: {
    fontSize: 16,
    color: '#1E293B',
    lineHeight: 24,
    letterSpacing: 0.1,
  },
  userText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  systemText: {
    color: '#92400E',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },
  resultsContainer: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resultsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultItem: {
    marginBottom: 4,
  },
  resultText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  successText: {
    color: '#059669',
  },
  errorText: {
    color: '#DC2626',
  },

  // ── Loading ───────────────────────────────────────────────
  initialLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },

  // ── Input Container ───────────────────────────────────────
  targetAppPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  targetAppPillText: {
    fontSize: 13,
    color: '#4338CA',
    fontWeight: '600',
    flex: 1,
  },
  appPickTrigger: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  inputContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 8,
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    color: '#0F172A',
    maxHeight: 120,
    minHeight: 44,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  textInputDisabled: {
    opacity: 0.5,
  },
  charCount: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'right',
    marginTop: 8,
    marginRight: 16,
    fontWeight: '500',
  },
  sendButton: {
    width: 44,
    height: 44,
    backgroundColor: '#4338CA',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },

  // ── Voice Input ────────────────────────────────────────────
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButtonActive: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  listeningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
    marginBottom: 4,
  },
  listeningDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  listeningText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  voiceErrorText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#EF4444',
    textAlign: 'center',
    paddingBottom: 8,
  },

  // ── Agent Progress ────────────────────────────────────────
  agentProgressContainer: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 3,
    borderBottomColor: '#4338CA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  agentProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  agentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  agentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  agentProgressTitle: {
    color: '#10B981',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  agentHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  agentProgressStep: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  agentProgressMessage: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 10,
  },
  logsContainer: {
    maxHeight: 120,
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  logText: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginBottom: 4,
    lineHeight: 16,
  },
  logError: {
    color: '#F87171',
    fontWeight: '600',
  },
  logSuccess: {
    color: '#10B981',
    fontWeight: '600',
  },
  logThinking: {
    color: '#60A5FA',
  },
  cancelButton: {
    backgroundColor: '#7F1D1D',
    borderWidth: 1,
    borderColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: '#FECACA',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Report Bubble ─────────────────────────────────────────
  reportBubble: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    maxWidth: '90%',
    borderColor: '#D1FAE5',
    borderWidth: 1,
  },
  reportText: {
    color: '#064E3B',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },

  // ── App Target Row ────────────────────────────────────────
  appTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 12,
    gap: 10,
  },
  appTargetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 8,
  },
  appTargetText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  appTargetChevron: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  appTargetClear: {
    fontSize: 18,
    color: '#94A3B8',
    paddingHorizontal: 8,
    fontWeight: '600',
  },

  // ── App Picker Modal ──────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 24,
    paddingBottom: 40,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
    letterSpacing: 0.3,
  },
  pickerItem: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#1E293B',
    fontWeight: '600',
  },
  pickerItemPkg: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  pickerCancel: {
    textAlign: 'center',
    fontSize: 17,
    color: '#EF4444',
    fontWeight: '700',
    paddingVertical: 20,
    marginTop: 8,
  },
  pickerHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerAllApps: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#F1F5F9',
    marginBottom: 4,
  },
  pickerAllAppsText: {
    fontSize: 16,
    color: '#1E293B',
    fontWeight: '600',
    flex: 1,
  },
  pickerItemSelected: {
    backgroundColor: '#F0FDF4',
  },
  pickerItemLeft: {
    flex: 1,
  },
  pickerCancelBtn: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  logAction: {
    color: '#A78BFA',
    fontWeight: '600',
  },

  // ── App Icon in picker ──────────────────────────────────────
  appIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  appIconImage: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginRight: 4,
    backgroundColor: '#F1F5F9',
  },
  appIconText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
