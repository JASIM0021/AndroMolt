import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

type EventCallback = (data: any) => void;

export interface AgentEvent {
  type: 'thinking' | 'screen_analyzed' | 'action_executing' | 'action_completed' | 'goal_achieved' | 'error' | 'step_progress' | 'intent_detected';
  message: string;
  data?: any;
  timestamp: string;
}

export interface AgentState {
  isRunning: boolean;
  currentStep: number;
  maxSteps: number;
  currentCommand: string;
  intent: {
    app: string;
    action: string;
    query: string;
  } | null;
  lastAction: string;
  logs: AgentEvent[];
}

class AgentEventEmitterClass {
  private listeners: Map<string, EventCallback[]> = new Map();
  private state: AgentState = {
    isRunning: false,
    currentStep: 0,
    maxSteps: 20,
    currentCommand: '',
    intent: null,
    lastAction: '',
    logs: []
  };

  getState(): AgentState {
    return { ...this.state };
  }

  reset() {
    this.listeners.clear();
    this.state = {
      isRunning: false,
      currentStep: 0,
      maxSteps: 20,
      currentCommand: '',
      intent: null,
      lastAction: '',
      logs: []
    };
    this.emit('state_changed', this.state);
  }

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: EventCallback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event: string, data?: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
    // Also emit to 'log' for all events
    if (event !== 'log') {
      const logCallbacks = this.listeners.get('log');
      if (logCallbacks) {
        logCallbacks.forEach(cb => cb(data));
      }
    }
  }

  start(command: string, maxSteps: number = 20) {
    this.reset();
    this.state.isRunning = true;
    this.state.currentCommand = command;
    this.state.maxSteps = maxSteps;
    this.emit('state_changed', this.state);
  }

  setIntent(intent: { app: string; action: string; query: string }) {
    this.state.intent = intent;
    this.emit('intent_detected', { intent, timestamp: new Date().toISOString() });
  }

  nextStep() {
    this.state.currentStep++;
    this.emit('state_changed', this.state);
  }

  setLastAction(action: string) {
    this.state.lastAction = action;
  }

  log(event: AgentEvent) {
    event.timestamp = new Date().toISOString();
    this.state.logs.push(event);
    if (this.state.logs.length > 100) {
      this.state.logs = this.state.logs.slice(-100);
    }
    this.emit(event.type, event);
    this.emit('log', event);
  }

  think(message: string, data?: any) {
    this.log({ type: 'thinking', message, data, timestamp: new Date().toISOString() });
  }

  analyzeScreen(elementCount: number, elements: any[]) {
    this.log({ 
      type: 'screen_analyzed', 
      message: `Found ${elementCount} elements on screen`,
      data: { elementCount, elements },
      timestamp: new Date().toISOString() 
    });
  }

  executeAction(action: string, details: any) {
    this.log({ 
      type: 'action_executing', 
      message: `Executing: ${action}`,
      data: details,
      timestamp: new Date().toISOString() 
    });
  }

  actionCompleted(action: string, success: boolean, message: string) {
    this.log({ 
      type: 'action_completed', 
      message: `${action}: ${success ? '✅ Success' : '❌ Failed'} - ${message}`,
      data: { success, message },
      timestamp: new Date().toISOString() 
    });
  }

  goalAchieved(message: string) {
    this.log({ 
      type: 'goal_achieved', 
      message: `🎉 ${message}`,
      timestamp: new Date().toISOString() 
    });
    this.state.isRunning = false;
    this.emit('state_changed', this.state);
  }

  error(message: string, details?: any) {
    this.log({ 
      type: 'error', 
      message: `❌ Error: ${message}`,
      data: details,
      timestamp: new Date().toISOString() 
    });
    this.state.isRunning = false;
    this.emit('state_changed', this.state);
  }

  stepProgress(step: number, maxSteps: number, message: string) {
    this.log({
      type: 'step_progress',
      message: `Step ${step}/${maxSteps}: ${message}`,
      data: { step, maxSteps, message },
      timestamp: new Date().toISOString()
    });
  }

  complete(success: boolean, message: string) {
    this.state.isRunning = false;
    this.log({ 
      type: success ? 'goal_achieved' : 'error', 
      message: message,
      timestamp: new Date().toISOString() 
    });
    this.emit('complete', { success, message });
    this.emit('state_changed', this.state);
  }
}

export const agentEvents = new AgentEventEmitterClass();
export default agentEvents;
