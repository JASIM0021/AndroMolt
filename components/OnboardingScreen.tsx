import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
  Alert,
  NativeModules,
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
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 100,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  sectionDesc: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  permissionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  permissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  permissionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeGranted: {
    backgroundColor: '#d4edda',
  },
  badgePending: {
    backgroundColor: '#fff3cd',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  permissionDesc: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    marginRight: 12,
    fontWeight: '600',
  },
  stepText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  continueButton: {
    backgroundColor: '#28a745',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  continueButtonDisabled: {
    backgroundColor: '#ccc',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#007AFF',
    fontSize: 14,
  },
});