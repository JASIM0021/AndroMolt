import { NativeModulesProxy } from 'expo-modules-core';

const AndroMoltCoreModule = NativeModulesProxy.AndroMoltCore;

export interface InstalledApp {
  name: string;
  packageName: string;
}

export const AndroMoltCore = {
  /**
   * Check if AccessibilityService is enabled
   */
  isAccessibilityEnabled(): Promise<boolean> {
    return AndroMoltCoreModule.isAccessibilityEnabled();
  },

  /**
   * Open Accessibility Settings
   */
  openAccessibilitySettings(): void {
    AndroMoltCoreModule.openAccessibilitySettings();
  },

  /**
   * Execute an automation action
   */
  executeAction(actionJson: string): Promise<boolean> {
    return AndroMoltCoreModule.executeAction(actionJson);
  },

  /**
   * Get screen elements via Accessibility Service
   */
  getScreenElements(): Promise<any[]> {
    return AndroMoltCoreModule.getScreenElements();
  },

  /**
   * Perform click at coordinates
   */
  performClick(x: number, y: number): Promise<boolean> {
    return AndroMoltCoreModule.performClick(x, y);
  },

  /**
   * Input text
   */
  inputText(text: string): Promise<boolean> {
    return AndroMoltCoreModule.inputText(text);
  },

  /**
   * Press key
   */
  pressKey(keyCode: number): Promise<boolean> {
    return AndroMoltCoreModule.pressKey(keyCode);
  },

  /**
   * Scroll down
   */
  scrollDown(): Promise<boolean> {
    return AndroMoltCoreModule.scrollDown();
  },

  /**
   * Launch an app by package name
   */
  launchApp(packageName: string): Promise<boolean> {
    return AndroMoltCoreModule.launchApp(packageName);
  },

  /**
   * Get list of installed apps
   */
  getInstalledApps(): Promise<InstalledApp[]> {
    return AndroMoltCoreModule.getInstalledApps();
  },

  /**
   * Get current package name
   */
  getCurrentPackage(): Promise<string | null> {
    return AndroMoltCoreModule.getCurrentPackage();
  },

  /**
   * Start foreground service
   */
  startForegroundService(): void {
    AndroMoltCoreModule.startForegroundService();
  },

  /**
   * Stop foreground service
   */
  stopForegroundService(): void {
    AndroMoltCoreModule.stopForegroundService();
  }
};

export default AndroMoltCore;
