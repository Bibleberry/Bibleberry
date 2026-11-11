import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.bibleberry.r20poc',
  appName: 'Bibleberry R20-1 POC',
  webDir: 'dist',
  plugins: {
    App: {
      disableBackButtonHandler: true,
    },
  },
}

export default config
