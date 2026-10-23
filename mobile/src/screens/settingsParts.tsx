import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { closeLock, getState, openLock } from '../api/client'
import { getConfig, saveConfig } from '../lib/config'
import {
  THEME_OPTIONS,
  THEMES,
  type Theme,
  type ThemeName,
  useTheme,
  useThemedStyles,
} from '../theme'

// The Settings sections the app (SettingsScreen.tsx) and the web build
// (SettingsScreen.web.tsx) share.

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  )
}

// Applied and saved on tap, without waiting on Save — but only the theme, so
// unsaved connection edits stay unsaved.
export function ThemePicker() {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const onPick = (name: ThemeName) => saveConfig({ ...getConfig(), themeName: name })
  return (
    <View style={styles.themeRow}>
      {THEME_OPTIONS.map((opt) => (
        <Pressable
          key={opt.name}
          style={[styles.themeSwatch, theme.name === opt.name && styles.themeSwatchActive]}
          onPress={() => onPick(opt.name)}
        >
          <View style={styles.themeSwatchColors}>
            <View style={[styles.themeSwatchDot, { backgroundColor: THEMES[opt.name].bg }]} />
            <View style={[styles.themeSwatchDot, { backgroundColor: THEMES[opt.name].primary }]} />
          </View>
          <Text style={styles.themeSwatchLabel}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

// The escape hatch for when the lock screen and the door disagree: tapping
// the lock only ever asks for the opposite of what it shows.
export function ManualControl() {
  const styles = useThemedStyles(makeStyles)
  const [result, setResult] = useState<string>()
  const [busy, setBusy] = useState(false)

  const onManual = async (action: 'open' | 'close') => {
    setBusy(true)
    setResult(action === 'open' ? 'Sending unlock…' : 'Sending lock…')
    try {
      await (action === 'open' ? openLock() : closeLock())
      // give the firmware time to move and report before reading it back
      await new Promise<void>((r) => setTimeout(() => r(), 2500))
      const { state } = await getState()
      const shown = state === 'open' ? 'unlocked' : state === 'closed' ? 'locked' : 'unknown'
      setResult(`Sent. The lock now reports ${shown}.`)
    } catch (e) {
      setResult(`Failed: ${String((e as Error).message ?? e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Text style={styles.section}>Manual control</Text>
      <Text style={styles.hint}>
        If the lock screen ever disagrees with the door, send a specific command here. The lock
        screen catches up as soon as the lock reports back.
      </Text>
      <View style={styles.manualRow}>
        <TouchableOpacity
          style={[styles.btnOutline, styles.manualBtn, busy && styles.btnDisabled]}
          disabled={busy}
          onPress={() => onManual('open')}
        >
          <Text style={styles.btnOutlineText}>Send unlock</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnOutline, styles.manualBtn, busy && styles.btnDisabled]}
          disabled={busy}
          onPress={() => onManual('close')}
        >
          <Text style={styles.btnOutlineText}>Send lock</Text>
        </TouchableOpacity>
      </View>
      {result ? <Text style={styles.hint}>{result}</Text> : null}
    </>
  )
}

export function makeStyles(theme: Theme) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: theme.bg },
    container: { padding: 16, gap: 12, backgroundColor: theme.bg },
    field: { gap: 4 },
    label: { color: theme.text, fontSize: 13 },
    hint: { color: theme.textMuted, fontSize: 11 },
    section: { color: theme.textMuted, fontSize: 12, marginTop: 12, textTransform: 'uppercase' },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: theme.text,
      backgroundColor: theme.surface,
    },
    rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
    btn: {
      backgroundColor: theme.primary,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 8,
    },
    btnText: { color: theme.primaryText, fontWeight: '600' },
    btnDisabled: { opacity: 0.5 },
    pickerWrap: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      overflow: 'hidden',
    },
    picker: { color: theme.text },
    btnOutline: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
    },
    btnOutlineText: { color: theme.text },
    manualRow: { flexDirection: 'row', gap: 12 },
    manualBtn: { flex: 1 },
    linkText: { color: theme.primary, fontSize: 12 },
    themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    themeSwatch: {
      alignItems: 'center',
      gap: 6,
      padding: 10,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    themeSwatchActive: { borderColor: theme.primary },
    themeSwatchColors: {
      flexDirection: 'row',
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
    },
    themeSwatchDot: { width: 20, height: 28 },
    themeSwatchLabel: { fontSize: 12, fontWeight: '600', color: theme.text },
  })
}
