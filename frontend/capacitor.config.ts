import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.spotdl.app',
  appName: 'SpotDL',
  webDir: 'dist',
  server: {
    url: 'http://10.0.2.2:8000',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
}

export default config
