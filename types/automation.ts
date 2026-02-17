// Core Types for AndroMolt Automation

export interface AndroMoltCoreSpec {
  // Core system methods
  getSystemStatus(): Promise<SystemStatus>;
  getDeviceInfo(): Promise<DeviceInfo>;
  executeActionPlan(actionPlanJson: string): Promise<ActionResult[]>;
  validateActionPlan(actionPlanJson: string): Promise<ValidationResult>;
}

export interface AndroMoltPermissionSpec {
  checkPermissions(): Promise<PermissionStatus>;
  requestAccessibilityPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  requestUsageStatsPermission(): Promise<boolean>;
  requestNotificationPermission(): Promise<boolean>;
  getPermissionStatus(permission: string): Promise<boolean>;
}

export interface AndroMoltAppLauncherSpec {
  getInstalledApps(): Promise<AppInfo[]>;
  launchApp(packageName: string): Promise<boolean>;
  getAppInfo(packageName: string): Promise<AppInfo>;
  searchApps(query: string): Promise<AppInfo[]>;
}

export interface AndroMoltAccessibilitySpec {
  findUIElements(query: UIQuery): Promise<UIElement[]>;
  performUIAction(action: UIAction): Promise<string>;
  isServiceConnected(): Promise<boolean>;
  clickElement(elementId: string): Promise<string>;
  clickByText(text: string): Promise<string>;
  inputText(text: string, targetElement: TargetElement): Promise<string>;
  scrollUp(): Promise<string>;
  scrollDown(): Promise<string>;
  scrollLeft(): Promise<string>;
  scrollRight(): Promise<string>;
  swipe(startX: number, startY: number, endX: number, endY: number, duration?: number): Promise<string>;
  longClick(elementId: string): Promise<string>;
}

// Core Data Structures
export interface SystemStatus {
  version: string;
  platform: string;
  isReady: boolean;
  permissions: {
    accessibility: boolean;
    overlay: boolean;
    usageStats: boolean;
  };
  modules: {
    appLauncher: boolean;
    accessibility: boolean;
    permissions: boolean;
  };
}

export interface DeviceInfo {
  androidVersion: string;
  sdkVersion: number;
  manufacturer: string;
  model: string;
  brand: string;
}

export interface PermissionStatus {
  accessibility: boolean;
  overlay: boolean;
  usageStats: boolean;
  notifications: boolean;
  contacts: boolean;
}

export interface AppInfo {
  name: string;
  packageName: string;
  versionName?: string;
  versionCode?: number;
  isSystemApp: boolean;
  aliases?: string[];
}

export interface UIElement {
  id: string;
  text: string;
  contentDescription: string;
  className: string;
  resourceId: string;
  isClickable: boolean;
  isEditable: boolean;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface UIQuery {
  text?: string;
  resourceId?: string;
  contentDescription?: string;
  elementId?: string;
  className?: string;
  isClickable?: boolean;
  isEditable?: boolean;
}

export interface UIAction {
  action: 'click' | 'input' | 'scroll' | 'swipe' | 'long_click';
  text?: string;
  elementId?: string;
  resourceId?: string;
  contentDescription?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  duration?: number;
}

export interface TargetElement {
  text?: string;
  resourceId?: string;
  contentDescription?: string;
  elementId?: string;
}

export interface ActionResult {
  actionId: string;
  type: string;
  status: 'pending' | 'completed' | 'failed';
  success: boolean;
  message: string;
  timestamp: string;
}

export interface ValidationResult {
  valid: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  message: string;
  warnings: string[];
}

// Action Plan Types
export interface ActionPlan {
  understanding: string;
  confidence: number;
  risk_assessment: {
    level: 'low' | 'medium' | 'high';
    concerns: string[];
    requires_confirmation: boolean;
  };
  actions: Action[];
  prerequisites: string[];
  fallback_suggestions: string[];
}

export interface Action {
  type: 'launch_app' | 'ui_click' | 'ui_input' | 'ui_scroll' | 'device_control' | 'wait';
  description: string;
  parameters: Record<string, any>;
  timeout?: number;
  retry_policy?: RetryPolicy;
}

export interface RetryPolicy {
  max_retries: number;
  retry_delay: number;
}