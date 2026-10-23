import React from 'react'
import { ScrollView, Text } from 'react-native'
import { useThemedStyles } from '../theme'
import { AnimationPicker } from './AnimationPicker'
import { makeStyles, ManualControl, ThemePicker } from './settingsParts'

// The web build's Settings (SettingsScreen.tsx is the app's). The connection
// is fixed at build time and a browser has no APK to update, so only the
// look and the manual commands are left.
export function SettingsScreen() {
  const styles = useThemedStyles(makeStyles)
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.section}>Appearance</Text>
      <ThemePicker />

      <Text style={styles.section}>Lock animation</Text>
      <AnimationPicker />

      <ManualControl />
    </ScrollView>
  )
}
