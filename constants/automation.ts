// Popular app package mappings for automation
export const APP_MAPPINGS = {
  'youtube': 'com.google.android.youtube',
  'whatsapp': 'com.whatsapp',
  'instagram': 'com.instagram.android',
  'facebook': 'com.facebook.katana',
  'linkedin': 'com.linkedin.android',
  'spotify': 'com.spotify.music',
  'netflix': 'com.netflix.mediaclient',
  'gmail': 'com.google.android.gm',
  'chrome': 'com.android.chrome',
  'maps': 'com.google.android.apps.maps',
  'calculator': 'com.android.calculator2',
  'camera': 'com.android.camera',
  'messages': 'com.android.mms',
  'phone': 'com.android.dialer',
  'settings': 'com.android.settings',
  'play store': 'com.android.vending',
  'twitter': 'com.twitter.android',
  'tiktok': 'com.zhiliaoapp.musically',
  'discord': 'com.discord',
  'telegram': 'org.telegram.messenger',
  'signal': 'org.thoughtcrime.securesms',
} as const;

// Common action patterns for automation
export const ACTION_PATTERNS = {
  open_app: [
    'open', 'launch', 'start', 'run', 'go to'
  ],
  click_ui: [
    'click', 'tap', 'press', 'select', 'choose'
  ],
  input_text: [
    'type', 'enter', 'write', 'input', 'fill in'
  ],
  scroll: [
    'scroll', 'swipe', 'move', 'navigate'
  ],
  search: [
    'search', 'find', 'look for', 'search for'
  ],
  settings: [
    'turn on', 'enable', 'activate', 'start',
    'turn off', 'disable', 'deactivate', 'stop'
  ]
} as const;

// Risk assessment rules
export const RISK_RULES = {
  // Low risk actions
  low: [
    'launch_app', 'ui_click', 'ui_scroll', 'wait'
  ],
  // Medium risk actions  
  medium: [
    'ui_input', 'device_control'
  ],
  // High risk actions
  high: [
    'send_message', 'send_email', 'make_call', 'install_app', 'delete_files'
  ]
} as const;

// Permission requirements
export const PERMISSION_REQUIREMENTS = {
  accessibility: {
    required_for: ['ui_click', 'ui_input', 'ui_scroll', 'find_elements'],
    description: 'Required for detecting and interacting with UI elements',
    settings_action: 'accessibility'
  },
  overlay: {
    required_for: ['system_overlay', 'gesture_simulation'],
    description: 'Required for drawing overlays and simulating gestures',
    settings_action: 'overlay'
  },
  usage_stats: {
    required_for: ['app_discovery', 'usage_tracking'],
    description: 'Required for discovering installed apps and usage patterns',
    settings_action: 'usage_stats'
  },
  notifications: {
    required_for: ['status_notifications', 'foreground_service'],
    description: 'Required for showing automation status notifications',
    settings_action: 'notifications'
  },
  contacts: {
    required_for: ['contact_search', 'message_by_name'],
    description: 'Required for searching contacts and messaging by name',
    settings_action: 'contacts'
  }
} as const;

// Error messages and user guidance
export const ERROR_MESSAGES = {
  permission_denied: {
    accessibility: 'Please enable Accessibility permission in Settings > Accessibility > AndroMolt',
    overlay: 'Please enable Overlay permission in Settings > Apps > Special Access > Display over other apps',
    usage_stats: 'Please enable Usage Stats permission in Settings > Privacy > Usage access',
    notifications: 'Please enable Notifications permission in Settings > Apps > AndroMolt',
    contacts: 'Please enable Contacts permission in Settings > Apps > AndroMolt'
  },
  app_not_found: 'App not found. Please check if the app is installed and try again.',
  service_not_connected: 'Accessibility service not connected. Please restart the app.',
  action_failed: 'Action failed. Please try again or check app permissions.',
  rate_limit: 'Too many requests. Please wait before trying again.',
  network_error: 'Network error. Please check your internet connection.',
  api_error: 'AI service error. Please try again in a moment.'
} as const;

// Default timeouts and delays
export const TIMINGS = {
  app_launch_timeout: 5000, // 5 seconds
  ui_action_timeout: 3000,   // 3 seconds
  scroll_delay: 500,          // 0.5 seconds
  input_delay: 200,           // 0.2 seconds
  action_between_delay: 1000, // 1 second between actions
  retry_delay: 2000,          // 2 seconds before retry
  max_execution_time: 30000    // 30 seconds total
} as const;

// Retry configuration
export const RETRY_CONFIG = {
  max_retries: 3,
  retry_backoff_multiplier: 2,
  initial_retry_delay: 1000
} as const;

// UI element detection strategies in order of preference
export const DETECTION_STRATEGIES = [
  'resource_id',    // Most reliable
  'text',           // Common but can be ambiguous
  'content_description', // Good for accessibility elements
  'class_name',     // Systematic but may vary
  'coordinates',    // Last resort
] as const;

// Device control mappings
export const DEVICE_CONTROLS = {
  wifi: {
    on: 'enable',
    off: 'disable',
    setting: 'wifi'
  },
  bluetooth: {
    on: 'enable',
    off: 'disable',
    setting: 'bluetooth'
  },
  volume: {
    up: 'increase',
    down: 'decrease',
    mute: 'mute',
    setting: 'volume'
  }
} as const;