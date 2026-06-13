import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.spotdl.app',
  appName: 'SpotDL',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
}

export default config
