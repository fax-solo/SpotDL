import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.spotdl.app',
  appName: 'SpotDL',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SpotDL: {
      appId: 'com.spotdl.app',
    },
  },
}

export default config
