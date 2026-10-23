import React, { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { RootNavigator } from './navigation/RootNavigator'
import { useTheme } from './theme'

// The web build's root (App.tsx is the app's): no APK update check and no
// launcher icon to swap, just the browser chrome following the theme.
export default function App() {
  const theme = useTheme()

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg)
    document.documentElement.style.background = theme.bg
    document.body.style.background = theme.bg
  }, [theme.bg])

  return (
    <SafeAreaProvider>
      <RootNavigator />
    </SafeAreaProvider>
  )
}
