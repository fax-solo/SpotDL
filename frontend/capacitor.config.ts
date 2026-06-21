import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.spotdl.app',
  appName: 'SpotDL',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    cleartextNavigation: ['127.0.0.1', 'localhost'],
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SpotDL: {
      appId: 'com.spotdl.app',
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#0B0F19',
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0B0F19',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#10B981',
    },
  },
}

export default config
