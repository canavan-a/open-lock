import React, { useEffect } from 'react'
import { Alert, AppState, StatusBar } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useThemedAppIcon } from './appIcon'
import {
  compareVersions,
  fetchReleases,
  getVersionInfo,
} from './lib/appUpdater'
import { getConfig } from './lib/config'
import { RootNavigator } from './navigation/RootNavigator'
import { useTheme } from './theme'

// Throttle the foreground update check to once every 6h per app process.
let lastUpdateCheck = 0

async function maybeCheckForUpdate() {
  if (!getConfig().autoUpdateCheck) return
  if (Date.now() - lastUpdateCheck < 6 * 60 * 60 * 1000) return
  lastUpdateCheck = Date.now()
  try {
    const [releases, info] = await Promise.all([fetchReleases(), getVersionInfo()])
    const latest = releases[0]
    if (!latest) return
    if (compareVersions(latest.version, info.versionName) > 0) {
      Alert.alert(
        'Update available',
        `v${latest.version} is available (you have v${info.versionName}). Open Settings to download and install it.`,
      )
    }
  } catch {
    // Offline or rate-limited — try again next foreground.
  }
}

export default function App() {
  const theme = useTheme()
  useThemedAppIcon()

  useEffect(() => {
    maybeCheckForUpdate()
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') maybeCheckForUpdate()
    })
    return () => sub.remove()
  }, [])

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={theme.dark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />
      <RootNavigator />
    </SafeAreaProvider>
  )
}
