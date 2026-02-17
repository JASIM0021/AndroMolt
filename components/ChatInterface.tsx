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
  Modal,
  BackHandler,
  AppState,
  NativeModules,
  NativeEventEmitter,
  DeviceEventEmitter,
} from 'react-native';
import { AgentLoop } from '../lib/agent/AgentLoop';
import { agentEvents, AgentEvent } from '../lib/automation/AgentEvents';
import { useAutomationStore } from '../lib/stores/automationStore';
import { AgentAction } from '../types/agent';
import OnboardingScreen from './OnboardingScreen';

const { AndroMoltCore, AndroMoltPermission } = NativeModules;

// API keys from environment
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  actionPlan?: any;
  results?: any[];
}

// Singleton agent loop
const agentLoop = new AgentLoop();

export default function ChatInterface() {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);
  const [agentLogs, setAgentLogs] = useState<AgentEvent[]>([]);
  const [agentProgress, setAgentProgress] = useState({ step: 0, maxSteps: 20, message: '' });
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Confirmation modal state
  const [confirmationAction, setConfirmationAction] = useState<AgentAction | null>(null);
  const confirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const {
    chatMessages,
    addChatMessage,
    addToHistory,
    isExecuting,
    setIsExecuting,
  } = useAutomationStore();

  // Set up confirmation callback on agent loop
  useEffect(() => {
    agentLoop.setConfirmationCallback(async (action: AgentAction) => {
      return new Promise<boolean>((resolve) => {
        confirmResolveRef.current = resolve;
        setConfirmationAction(action);
      });
    });
  }, []);

  const confirmAction = () => {
    confirmResolveRef.current?.(true);
    confirmResolveRef.current = null;
    setConfirmationAction(null);
  };

  const denyAction = () => {
    confirmResolveRef.current?.(false);
    confirmResolveRef.current = null;
    setConfirmationAction(null);
  };

  // Subscribe to agent events (both JS and Native)
  useEffect(() => {
    const handleLog = (event: AgentEvent) => {
      setAgentLogs(prev => [...prev.slice(-50), event]);
    };

    const handleStateChanged = (state: any) => {
      setIsAgentRunning(state.isRunning);
      if (state.currentStep) {
        setAgentProgress({
          step: state.currentStep,
          maxSteps: state.maxSteps,
          message: state.lastAction || 'Thinking...'
        });
      }
    };

    const handleComplete = () => {
      setIsAgentRunning(false);
    };

    // JS agent events (legacy)
    agentEvents.on('log', handleLog);
    agentEvents.on('state_changed', handleStateChanged);
    agentEvents.on('complete', handleComplete);

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
        message: `Package: ${data.package}`
      }));
      setAgentLogs(prev => [...prev, {
        type: 'info',
        message: `Step ${data.step}: ${data.package} (${data.elementCount} elements)`,
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

    // Subscribe to native events
    const agentStartListener = DeviceEventEmitter.addListener('agentStart', handleNativeAgentStart);
    const agentStepListener = DeviceEventEmitter.addListener('agentStep', handleNativeAgentStep);
    const agentActionListener = DeviceEventEmitter.addListener('agentAction', handleNativeAgentAction);
    const actionResultListener = DeviceEventEmitter.addListener('actionResult', handleNativeActionResult);
    const agentThinkListener = DeviceEventEmitter.addListener('agentThink', handleNativeAgentThink);
    const agentCompleteListener = DeviceEventEmitter.addListener('agentComplete', handleNativeAgentComplete);

    return () => {
      // Unsubscribe JS events
      agentEvents.off('log', handleLog);
      agentEvents.off('state_changed', handleStateChanged);
      agentEvents.off('complete', handleComplete);

      // Unsubscribe native events
      agentStartListener.remove();
      agentStepListener.remove();
      agentActionListener.remove();
      actionResultListener.remove();
      agentThinkListener.remove();
      agentCompleteListener.remove();
    };
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
      // The agent will naturally open the target app (e.g., YouTube) as first action,
      // which will bring it to foreground and put AndroMolt in background automatically.
      const result = await AndroMoltCore.runNativeAgent(
        userMessage,
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

    return (
      <View key={message.id} style={[styles.messageContainer, isUser && styles.userMessage]}>
        {!isUser && !isSystem && (
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
        ]}>
          <Text style={[
            styles.messageText,
            isUser && styles.userText,
            isSystem && styles.systemText,
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

  return (
    <View style={styles.container}>
      {/* Confirmation Modal */}
      <Modal visible={confirmationAction !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>High-Risk Action</Text>
            <Text style={styles.modalDesc}>
              {confirmationAction?.reasoning}
            </Text>
            <Text style={styles.modalAction}>
              Action: {confirmationAction?.action}
            </Text>
            <Text style={styles.modalParams}>
              {JSON.stringify(confirmationAction?.params, null, 2)}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.denyButton} onPress={denyAction}>
                <Text style={styles.denyButtonText}>Deny</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.allowButton} onPress={confirmAction}>
                <Text style={styles.allowButtonText}>Allow</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Agent Progress Bar */}
      {isAgentRunning && (
        <View style={styles.agentProgressContainer}>
          <View style={styles.agentProgressHeader}>
            <Text style={styles.agentProgressTitle}>Agent Running</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.agentProgressStep}>
                Step {agentProgress.step}/{agentProgress.maxSteps}
              </Text>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelAgent}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${(agentProgress.step / agentProgress.maxSteps) * 100}%` }
              ]}
            />
          </View>
          <Text style={styles.agentProgressMessage}>{agentProgress.message}</Text>

          {/* Live Logs */}
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
        <Text style={styles.headerTitle}>AndroMolt</Text>
        <Text style={styles.headerSubtitle}>AI Automation Assistant</Text>
        {isExecuting && (
          <View style={styles.executingIndicator}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.executingText}>Executing...</Text>
          </View>
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Text style={styles.quickActionsTitle}>Quick Actions:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => handleQuickAction('Open YouTube and play a Hindi song')}
          >
            <Text style={styles.quickActionText}>YouTube</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => handleQuickAction('Launch WhatsApp')}
          >
            <Text style={styles.quickActionText}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => handleQuickAction('Open Settings')}
          >
            <Text style={styles.quickActionText}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => handleQuickAction('Open Instagram')}
          >
            <Text style={styles.quickActionText}>Instagram</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Chat Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {chatMessages.map(renderMessage)}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.loadingText}>Processing your command...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
      >
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Tell me what you want to do..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
            editable={!isLoading}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
            ]}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  executingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#e8f4fd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  executingText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#007AFF',
  },
  quickActions: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  quickAction: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 12,
    marginRight: 4,
  },
  quickActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  avatarContainer: {
    marginHorizontal: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  messageBubble: {
    maxWidth: '70%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userBubble: {
    backgroundColor: '#007AFF',
  },
  systemBubble: {
    backgroundColor: '#fff3cd',
    borderLeftWidth: 3,
    borderLeftColor: '#ffc107',
  },
  messageText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 20,
  },
  userText: {
    color: '#fff',
  },
  systemText: {
    color: '#856404',
    fontSize: 13,
  },
  resultsContainer: {
    marginTop: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 8,
  },
  resultsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
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
    color: '#28a745',
  },
  errorText: {
    color: '#dc3545',
  },
  initialLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#666',
  },
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    backgroundColor: '#f9f9f9',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Agent Progress Styles
  agentProgressContainer: {
    backgroundColor: '#1a1a2e',
    padding: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  agentProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  agentProgressTitle: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: 'bold',
  },
  agentProgressStep: {
    color: '#888',
    fontSize: 12,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#00ff88',
    borderRadius: 2,
  },
  agentProgressMessage: {
    color: '#fff',
    fontSize: 12,
    marginBottom: 8,
  },
  logsContainer: {
    maxHeight: 100,
    backgroundColor: '#0a0a15',
    borderRadius: 8,
    padding: 8,
  },
  logText: {
    color: '#aaa',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  logError: {
    color: '#ff4444',
  },
  logSuccess: {
    color: '#00ff88',
  },
  logThinking: {
    color: '#4488ff',
  },
  cancelButton: {
    marginLeft: 12,
    backgroundColor: '#ff4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  // Confirmation Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 12,
  },
  modalDesc: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
  },
  modalAction: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  modalParams: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  denyButton: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  denyButtonText: {
    color: '#333',
    fontWeight: '600',
  },
  allowButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  allowButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
