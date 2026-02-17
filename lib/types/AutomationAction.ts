/**
 * Automation Action Types and Interfaces
 */

export enum ActionType {
  OPEN_APP = 'open_app',
  CLICK_TEXT = 'click_text',
  CLICK_COORDINATES = 'click_coordinates',
  INPUT_TEXT = 'input_text',
  SEARCH = 'search',
  SCROLL = 'scroll',
  WAIT = 'wait',
  SEND_WHATSAPP_MESSAGE = 'send_whatsapp_message',
  GET_SCREEN_TEXT = 'get_screen_text',
}

export enum ActionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface AutomationAction {
  id: string;
  type: ActionType;
  params: Record<string, any>;
  status: ActionStatus;
  createdAt: number;
  completedAt?: number;
  error?: string;
  description?: string;
}

export enum RiskLevel {
  SAFE = 0,
  CAUTION = 1,
  DANGEROUS = 2,
}

export interface DeviceContext {
  installedApps: string[];
  currentScreen?: string;
  currentPackage?: string;
}
