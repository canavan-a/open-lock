import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { getConfig, isConfigured, loadConfig, subscribeConfig } from '../lib/config'
import { LockScreen } from '../screens/LockScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { type Theme, useTheme } from '../theme'

const Stack = createNativeStackNavigator()

function navTheme(t: Theme) {
  const base = t.dark ? DarkTheme : DefaultTheme
  return {
    ...base,
    colors: {
      ...base.colors,
      background: t.bg,
      card: t.surface,
      text: t.text,
      border: t.border,
      primary: t.primary,
    },
  }
}

function screenOpts(t: Theme) {
  return {
    headerStyle: { backgroundColor: t.bg },
    headerTintColor: t.text,
    headerShadowVisible: false,
  } as const
}

export function RootNavigator() {
  const [ready, setReady] = useState(false)
  const configured = useSyncExternalStore(subscribeConfig, () =>
    isConfigured(getConfig()),
  )
  const theme = useTheme()
  const nav = useMemo(() => navTheme(theme), [theme])

  useEffect(() => {
    loadConfig().then(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.textMuted} />
      </View>
    )
  }

  return (
    <NavigationContainer theme={nav}>
      <Stack.Navigator screenOptions={screenOpts(theme)}>
        {configured ? (
          <>
            <Stack.Screen name="Lock" component={LockScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        ) : (
          <Stack.Screen name="Setup" component={SettingsScreen} options={{ title: 'Connect to Open Lock' }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
