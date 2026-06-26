import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aquatrak.app',
  appName: 'AquaTrak',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
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
  },
};

export default config;
