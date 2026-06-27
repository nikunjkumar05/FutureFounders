import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aquatrak.app',
  appName: 'AquaTrak',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['*.firebaseapp.com', '*.google.com'],
  },
  android: {
    backgroundColor: '#0a192f',
    allowMixedContent: true,
  },
  ios: {
    backgroundColor: '#0a192f',
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0a192f',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#0ab5ff',
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
