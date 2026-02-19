import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
  AppState,
  NativeModules,
  NativeEventEmitter,
  DeviceEventEmitter,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { AgentEvent } from '../lib/automation/AgentEvents';
import { useAutomationStore } from '../lib/stores/automationStore';
import OnboardingScreen from './OnboardingScreen';

const { AndroMoltCore, AndroMoltPermission } = NativeModules;

// API keys from environment
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

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
  const [installedApps, setInstalledApps] = useState<{name: string, packageName: string}[]>([]);
  const [selectedApp, setSelectedApp] = useState<{name: string, packageName: string} | null>(null);
  const [showAppPicker, setShowAppPicker] = useState(false);

  const {
    chatMessages,
    addChatMessage,
    addToHistory,
    isExecuting,
    setIsExecuting,
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

  // Load installed apps on mount for app picker
  useEffect(() => {
    if (AndroMoltCore) {
      AndroMoltCore.getInstalledApps()
        .then((json: string) => setInstalledApps(JSON.parse(json)))
        .catch(() => {});
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [chatMessages]);

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

  // Show loading while checking permissions
  if (checkingPermissions) {
    return (
      <View style={styles.initialLoadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Checking permissions...</Text>
      </View>
    );
  }

  // Show onboarding until permissions are granted
  if (!permissionsGranted) {
    return <OnboardingScreen />;
  }

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

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
        OPENAI_API_KEY || null,
        GEMINI_API_KEY || null
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

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.type === 'user';
    const isSystem = message.type === 'system';
    const isReport = message.type === 'report';

    return (
      <View key={message.id} style={[styles.messageContainer, isUser && styles.userMessage]}>
        {!isUser && !isSystem && !isReport && (
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>A</Text>
            </View>
          </View>
        )}

        <View style={[
          styles.messageBubble,
          isUser && styles.userBubble,
          isSystem && styles.systemBubble,
          isReport && styles.reportBubble,
        ]}>
          <Text style={[
            styles.messageText,
            isUser && styles.userText,
            isSystem && styles.systemText,
            isReport && styles.reportText,
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
                    {result.success ? 'OK' : 'FAIL'} {result.message}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {isUser && (
          <View style={styles.avatarContainer}>
            <View style={styles.userAvatar}>
              <Text style={styles.avatarText}>U</Text>
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />

      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* Agent Progress Bar */}
        {isAgentRunning && (
          <View style={styles.agentProgressContainer}>
            <View style={styles.agentProgressHeader}>
              <View style={styles.agentTitleRow}>
                <View style={styles.agentDot} />
                <Text style={styles.agentProgressTitle}>Agent Running</Text>
              </View>
              <View style={styles.agentHeaderRight}>
                <Text style={styles.agentProgressStep}>
                  {agentProgress.targetItems > 0
                    ? `${agentProgress.completedItems}/${agentProgress.targetItems} · Step ${agentProgress.step}`
                    : `Step ${agentProgress.step}`}
                </Text>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancelAgent}>
                  <Text style={styles.cancelButtonText}>✕ Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBar,
                  { width: '100%', opacity: 0.4 + (agentProgress.step % 3) * 0.2 }
                ]}
              />
            </View>
            <Text style={styles.agentProgressMessage} numberOfLines={1}>
              {agentProgress.message}
            </Text>
            <ScrollView style={styles.logsContainer} nestedScrollEnabled>
              {agentLogs.slice(-10).map((log, index) => (
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

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerLogoRow}>
              <View style={styles.headerLogo}>
                <Text style={styles.headerLogoText}>A</Text>
              </View>
              <View>
                <Text style={styles.headerTitle}>AndroMolt</Text>
                <Text style={styles.headerSubtitle}>AI Automation Assistant</Text>
              </View>
            </View>
            {isExecuting && (
              <View style={styles.executingIndicator}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.executingText}>Running…</Text>
              </View>
            )}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={styles.quickActionsTitle}>Quick Actions</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsRow}
          >
            {[
              { label: '▶ YouTube', action: 'Open YouTube and play a Hindi song' },
              { label: '💬 WhatsApp', action: 'Launch WhatsApp' },
              { label: '⚙ Settings', action: 'Open Settings' },
              { label: '📸 Instagram', action: 'Open Instagram' },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.quickAction}
                onPress={() => handleQuickAction(item.action)}
                activeOpacity={0.75}
              >
                <Text style={styles.quickActionText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Chat Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {chatMessages.map(renderMessage)}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.loadingText}>Processing…</Text>
            </View>
          )}
        </ScrollView>

        {/* App Target Row */}
        <View style={styles.appTargetRow}>
          <TouchableOpacity onPress={() => setShowAppPicker(true)} style={styles.appTargetBtn}>
            <Text style={styles.appTargetText}>
              {selectedApp ? `📱 ${selectedApp.name}` : '📱 All apps'}
            </Text>
            <Text style={styles.appTargetChevron}>▾</Text>
          </TouchableOpacity>
          {selectedApp && (
            <TouchableOpacity onPress={() => setSelectedApp(null)}>
              <Text style={styles.appTargetClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Input Area */}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.textInput, isLoading && styles.textInputDisabled]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Tell me what to do…"
              placeholderTextColor="#aaa"
              multiline
              maxLength={500}
              editable={!isLoading}
              textAlignVertical="center"
            />
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
                <Text style={styles.sendButtonText}>↑</Text>
              )}
            </TouchableOpacity>
          </View>
          {inputText.length > 400 && (
            <Text style={styles.charCount}>{inputText.length}/500</Text>
          )}
        </View>
        {/* App Picker Modal */}
        <Modal visible={showAppPicker} animationType="slide" transparent>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <Text style={styles.pickerTitle}>Select Target App</Text>
              <FlatList
                data={installedApps}
                keyExtractor={item => item.packageName}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.pickerItem}
                    onPress={() => { setSelectedApp(item); setShowAppPicker(false); }}
                  >
                    <Text style={styles.pickerItemText}>{item.name}</Text>
                    <Text style={styles.pickerItemPkg}>{item.packageName}</Text>
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity onPress={() => setShowAppPicker(false)}>
                <Text style={styles.pickerCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#f2f4f7',
  },

  // ── Header ──────────────────────────────────────────────
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8eaf0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogo: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLogoText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 1,
  },
  executingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f4fd',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  executingText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },

  // ── Quick Actions ────────────────────────────────────────
  quickActions: {
    backgroundColor: '#ffffff',
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8eaf0',
  },
  quickActionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    paddingHorizontal: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickActionsRow: {
    paddingHorizontal: 12,
    gap: 8,
  },
  quickAction: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },
  quickActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },

  // ── Messages ─────────────────────────────────────────────
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 14,
    alignItems: 'flex-end',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  avatarContainer: {
    marginHorizontal: 6,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
  },
  messageBubble: {
    maxWidth: '75%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 1,
  },
  userBubble: {
    backgroundColor: '#007AFF',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  systemBubble: {
    backgroundColor: '#fffbea',
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    borderRadius: 12,
    borderBottomLeftRadius: 4,
    maxWidth: '90%',
  },
  messageText: {
    fontSize: 15,
    color: '#1a1a2e',
    lineHeight: 21,
  },
  userText: {
    color: '#ffffff',
  },
  systemText: {
    color: '#78350f',
    fontSize: 13,
    lineHeight: 19,
  },
  resultsContainer: {
    marginTop: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 8,
  },
  resultsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  resultItem: {
    marginBottom: 2,
  },
  resultText: {
    fontSize: 12,
    lineHeight: 16,
  },
  successText: {
    color: '#16a34a',
  },
  errorText: {
    color: '#dc2626',
  },

  // ── Loading ───────────────────────────────────────────────
  initialLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#888',
  },

  // ── Input ─────────────────────────────────────────────────
  inputContainer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e8eaf0',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 110,
    minHeight: 44,
    backgroundColor: '#f9fafb',
    color: '#1a1a2e',
  },
  textInputDisabled: {
    opacity: 0.6,
  },
  charCount: {
    fontSize: 11,
    color: '#f59e0b',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 2,
  },
  sendButton: {
    width: 44,
    height: 44,
    backgroundColor: '#007AFF',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#c7d2d8',
    elevation: 0,
    shadowOpacity: 0,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },

  // ── Agent Progress ────────────────────────────────────────
  agentProgressContainer: {
    backgroundColor: '#0d1117',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  agentProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  agentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  agentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00d68f',
  },
  agentProgressTitle: {
    color: '#00d68f',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  agentHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  agentProgressStep: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: '#1f2937',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#00d68f',
    borderRadius: 2,
  },
  agentProgressMessage: {
    color: '#9ca3af',
    fontSize: 11,
    marginBottom: 8,
  },
  logsContainer: {
    maxHeight: 90,
    backgroundColor: '#080c12',
    borderRadius: 6,
    padding: 8,
  },
  logText: {
    color: '#6b7280',
    fontSize: 10,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginBottom: 2,
    lineHeight: 14,
  },
  logError: {
    color: '#f87171',
  },
  logSuccess: {
    color: '#00d68f',
  },
  logThinking: {
    color: '#60a5fa',
  },
  cancelButton: {
    backgroundColor: '#7f1d1d',
    borderWidth: 1,
    borderColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cancelButtonText: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Report Bubble ─────────────────────────────────────────
  reportBubble: {
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 3,
    borderLeftColor: '#16a34a',
    borderRadius: 12,
    borderBottomLeftRadius: 4,
    maxWidth: '92%',
  },
  reportText: {
    color: '#14532d',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },

  // ── App Target Row ────────────────────────────────────────
  appTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#e8eaf0',
    gap: 8,
  },
  appTargetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f4ff',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  appTargetText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  appTargetChevron: {
    fontSize: 12,
    color: '#007AFF',
  },
  appTargetClear: {
    fontSize: 14,
    color: '#888',
    paddingHorizontal: 6,
  },

  // ── App Picker Modal ──────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  pickerItem: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickerItemText: {
    fontSize: 15,
    color: '#1a1a2e',
    fontWeight: '500',
  },
  pickerItemPkg: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  pickerCancel: {
    textAlign: 'center',
    fontSize: 15,
    color: '#dc2626',
    fontWeight: '600',
    paddingVertical: 16,
  },
});
