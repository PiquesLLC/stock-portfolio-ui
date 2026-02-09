import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nala.portfolio',
  appName: 'Nala',
  webDir: 'dist',
  server: {
    // For development with live reload, uncomment and set your LAN IP:
    // url: 'http://192.168.1.191:5173',
    // cleartext: true,
    allowNavigation: ['*.localhost', '127.0.0.1'],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#050505',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      launchShowDuration: 1500,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#050505',
    },
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#050505',
  },
  android: {
    backgroundColor: '#050505',
  },
};

export default config;
