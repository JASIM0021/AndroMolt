import { NativeModules } from 'react-native';

console.log('Available NativeModules:', Object.keys(NativeModules));

// Test our modules
const { AndroMoltPermission, AndroMoltAppLauncher, AndroMoltAccessibility, AndroMoltCore } = NativeModules;

if (AndroMoltPermission) {
  console.log('AndroMoltPermission module available');
}

if (AndroMoltAppLauncher) {
  console.log('AndroMoltAppLauncher module available');
}

if (AndroMoltAccessibility) {
  console.log('AndroMoltAccessibility module available');
}

if (AndroMoltCore) {
  console.log('AndroMoltCore module available');
}