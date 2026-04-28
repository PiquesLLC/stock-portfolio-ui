import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nala.portfolio',
  appName: 'Nala',
  webDir: 'dist',
  server: {
    // For development with live reload, uncomment and set your LAN IP:
    // url: 'http://192.168.1.191:5173',
    // cleartext: true,
    // Production: no localhost navigation needed
    // allowNavigation: ['*.localhost', '127.0.0.1'],
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#000000',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      launchShowDuration: 1500,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
    },
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#000000',
  },
  android: {
    backgroundColor: '#000000',
  },
};

export default config;
