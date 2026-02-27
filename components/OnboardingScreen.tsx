import React, { useEffect, useState } from 'react';
import {
  Linking,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const { AndroMoltCore, AndroMoltPermission } = NativeModules;

interface Permission {
  id: string;
  name: string;
  description: string;
  settingsPath: string;
  required: boolean;
}

const PERMISSIONS: Permission[] = [
  {
    id: 'accessibility',
    name: 'Accessibility Service',
    description: 'Required for UI automation, clicking buttons, and interacting with apps. This is the MAIN permission needed.',
    settingsPath: 'accessibility',
    required: true,
  },
  {
    id: 'overlay',
    name: 'Display Over Apps',
    description: 'Optional - Required for some advanced gesture features',
    settingsPath: 'overlay',
    required: false,
  },
];

export default function OnboardingScreen({ onComplete }: { onComplete?: () => void }) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      if (AndroMoltPermission && typeof AndroMoltPermission.checkPermissions === 'function') {
        const perms = await AndroMoltPermission.checkPermissions();
        setPermissions(perms);
      } else if (AndroMoltCore && typeof AndroMoltCore.getSystemStatus === 'function') {
        const status = await AndroMoltCore.getSystemStatus();
        setPermissions(status.permissions || {});
      }
    } catch (e) {
      console.error('Failed to check permissions:', e);
    } finally {
      setLoading(false);
    }
  };

  const requestPermission = async (permission: Permission) => {
    try {
      if (AndroMoltPermission) {
        if (permission.id === 'accessibility') {
          await AndroMoltPermission.requestAccessibilityPermission?.();
        } else if (permission.id === 'overlay') {
          await AndroMoltPermission.requestOverlayPermission?.();
        }
      }
      Linking.openSettings();
      setTimeout(checkPermissions, 1000);
    } catch (e) {
      console.error('Failed to request permission:', e);
    }
  };

  const openSettings = () => {
    Linking.openSettings();
  };

  const allRequiredGranted = permissions.accessibility === true;

  const handleContinue = () => {
    if (onComplete) {
      onComplete();
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Checking permissions...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome to AndroMolt</Text>
        <Text style={styles.subtitle}>
          AI-Powered Android Automation Assistant
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Required Permissions</Text>
        <Text style={styles.sectionDesc}>
          AndroMolt needs these permissions to automate tasks on your device:
        </Text>

        {PERMISSIONS.map((permission) => {
          const isGranted = permissions[permission.id];
          return (
            <View key={permission.id} style={styles.permissionCard}>
              <View style={styles.permissionHeader}>
                <Text style={styles.permissionName}>{permission.name}</Text>
                <View style={[styles.badge, isGranted ? styles.badgeGranted : styles.badgePending]}>
                  <Text style={styles.badgeText}>
                    {isGranted ? '✓ Granted' : '⚠ Required'}
                  </Text>
                </View>
              </View>
              <Text style={styles.permissionDesc}>{permission.description}</Text>

              {!isGranted && (
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => requestPermission(permission)}
                >
                  <Text style={styles.buttonText}>Enable {permission.name}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How to Enable</Text>
        <View style={styles.step}>
          <Text style={styles.stepNumber}>1</Text>
          <Text style={styles.stepText}>Tap "Enable" above for each permission</Text>
        </View>
        <View style={styles.step}>
          <Text style={styles.stepNumber}>2</Text>
          <Text style={styles.stepText}>Find "AndroMolt" in the list and turn it ON</Text>
        </View>
        <View style={styles.step}>
          <Text style={styles.stepNumber}>3</Text>
          <Text style={styles.stepText}>Allow all requested permissions</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.continueButton, !allRequiredGranted && styles.continueButtonDisabled]}
        onPress={handleContinue}
        disabled={!allRequiredGranted}
      >
        <Text style={styles.continueButtonText}>
          {allRequiredGranted ? 'Continue to App →' : 'Please enable Accessibility Permission'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipButton} onPress={openSettings}>
        <Text style={styles.skipButtonText}>Open System Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 17,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '500',
  },
  loadingText: {
    fontSize: 18,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 120,
    fontWeight: '500',
  },
  section: {
    marginBottom: 36,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  sectionDesc: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 20,
    lineHeight: 22,
  },
  permissionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  permissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  permissionName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeGranted: {
    backgroundColor: '#D1FAE5',
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#064E3B', // Overridden for pending below, but we can rely on style array if needed. Wait, we use badgeText for both. Let's make it inherit color or use specific styles if possible. 
  },
  permissionDesc: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
    fontWeight: '400',
  },
  button: {
    backgroundColor: '#4338CA',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 16,
    alignItems: 'center',
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    color: '#4338CA',
    textAlign: 'center',
    lineHeight: 32,
    marginRight: 16,
    fontWeight: '800',
    fontSize: 16,
  },
  stepText: {
    fontSize: 15,
    color: '#334155',
    flex: 1,
    fontWeight: '500',
  },
  continueButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  continueButtonDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  skipButton: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipButtonText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
  },
});