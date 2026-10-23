import { useFocusEffect, useNavigation } from '@react-navigation/native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, Vibration, View } from 'react-native'
import { useSharedValue, withSpring } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import {
  BATTERY_UNAVAILABLE,
  closeLock,
  type DoorState,
  getBattery,
  getState,
  openLock,
} from '../api/client'
import { useLockSocket } from '../api/socket'
import { GUMMY, type LockPhase } from '../lock/motion'
import { LockArt, useLockAnimation } from '../lock/registry'
import { type Theme, useTheme, useThemedStyles } from '../theme'

// One big lock: tapping it asks for the opposite of what it shows. State
// arrives live over the /ws socket, with polling as the fallback. If the
// screen and the door ever disagree, Settings → Manual control sends a
// specific command.

// How long to wait for the firmware to report the state we asked for before
// calling it failed. A healthy round trip is about a second.
const PENDING_TIMEOUT_MS = 8000
// Fallback polling cadence, used only while the /ws socket is down.
const STATE_POLL_MS = 1000
const BATTERY_POLL_MS = 5000
// Consecutive failed state polls before the screen says it's offline.
const OFFLINE_AFTER = 3

const LOCK_SIZE = 300

// Runs `fn` now and every `ms` while `enabled`, the screen is focused and the
// app is in the foreground — nothing polls from the background.
function usePoll(fn: () => void, ms: number, enabled: boolean) {
  const fnRef = useRef(fn)
  fnRef.current = fn
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return
      let timer: ReturnType<typeof setInterval> | undefined
      const start = () => {
        if (timer) return
        fnRef.current()
        timer = setInterval(() => fnRef.current(), ms)
      }
      const stop = () => {
        if (timer) clearInterval(timer)
        timer = undefined
      }
      if (AppState.currentState === 'active') start()
      const sub = AppState.addEventListener('change', (s) =>
        s === 'active' ? start() : stop(),
      )
      return () => {
        sub.remove()
        stop()
      }
    }, [ms, enabled]),
  )
}

function batteryIcon(percent: number, charging: boolean): string {
  if (percent === BATTERY_UNAVAILABLE) return 'battery-unknown'
  const base = charging ? 'battery-charging' : 'battery'
  if (percent >= 95) return charging ? 'battery-charging-100' : base
  if (percent < 5) return `${base}-outline`
  return `${base}-${Math.max(10, Math.round(percent / 10) * 10)}`
}

function Battery({ percent, charging }: { percent: number | null; charging: boolean }) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  if (percent === null) return <View />

  const isError = percent === BATTERY_UNAVAILABLE
  const clamped = Math.min(100, Math.max(0, percent))
  const showCharging = charging && !isError
  const color = isError || clamped > 20 || showCharging ? theme.textMuted : theme.danger
  const label = isError ? 'Battery unknown' : `Battery ${clamped}%${showCharging ? ', charging' : ''}`
  return (
    <View style={styles.battery} accessibilityLabel={label}>
      <MaterialCommunityIcons
        name={batteryIcon(percent, showCharging)}
        size={22}
        color={color}
        style={styles.batteryIcon}
      />
      <Text style={[styles.batteryLabel, { color }]}>{isError ? '?' : `${clamped}%`}</Text>
    </View>
  )
}

function statusText(state: DoorState, phase: LockPhase, action: 'open' | 'close' | null) {
  if (phase === 'pending') return action === 'open' ? 'Unlocking…' : 'Locking…'
  if (phase === 'failed') return "Didn't confirm"
  if (state === 'open') return 'Unlocked'
  if (state === 'closed') return 'Locked'
  return 'Connecting…'
}

function hintText(state: DoorState, phase: LockPhase) {
  if (phase === 'pending') return ' '
  if (phase === 'failed') return 'Tap to try again, or use Settings → Manual control'
  if (state === 'open') return 'Tap to lock'
  if (state === 'closed') return 'Tap to unlock'
  return ' '
}

export function LockScreen() {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const navigation = useNavigation<any>()
  const animation = useLockAnimation()

  const [doorState, setDoorState] = useState<DoorState>('unknown')
  const [phase, setPhase] = useState<LockPhase>('idle')
  const [action, setAction] = useState<'open' | 'close' | null>(null)
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null)
  const [charging, setCharging] = useState(false)
  const [error, setError] = useState<string>()
  const prevStateRef = useRef<DoorState | null>(null)
  const pendingTimeoutRef = useRef(0)
  const failuresRef = useRef(0)
  const doorStateRef = useRef<DoorState>('unknown')
  const press = useSharedValue(0)

  const applyState = (state: DoorState) => {
    failuresRef.current = 0
    setError(undefined)
    // the door moving on its own (button, another phone) clears a stale failure
    if (state !== doorStateRef.current) setPhase((p) => (p === 'failed' ? 'idle' : p))
    doorStateRef.current = state
    setDoorState(state)
    if (prevStateRef.current !== null && state !== prevStateRef.current) {
      prevStateRef.current = null
      clearTimeout(pendingTimeoutRef.current)
      setPhase('idle')
      Vibration.vibrate(30)
    }
  }

  const fetchState = () => {
    getState()
      .then(({ state }) => applyState(state))
      .catch((e) => {
        failuresRef.current += 1
        if (failuresRef.current >= OFFLINE_AFTER) setError(String(e.message ?? e))
      })
  }

  const fetchBattery = () => {
    getBattery()
      .then(({ battery, charging }) => {
        setBatteryPercent(battery)
        setCharging(!!charging)
      })
      .catch(() => {})
  }

  const socketConnected = useLockSocket(({ state, battery, charging }) => {
    applyState(state)
    setBatteryPercent(battery)
    setCharging(!!charging)
  })

  usePoll(fetchState, STATE_POLL_MS, !socketConnected)
  usePoll(fetchBattery, BATTERY_POLL_MS, !socketConnected)

  useEffect(() => () => clearTimeout(pendingTimeoutRef.current), [])

  const fail = (message?: string) => {
    prevStateRef.current = null
    clearTimeout(pendingTimeoutRef.current)
    setPhase('failed')
    if (message) setError(message)
    Vibration.vibrate([0, 40, 70, 40])
  }

  // Asks for the opposite of what's on screen. If the screen is wrong, the
  // firmware just re-reports the same state, nothing flips, and this times out
  // as failed; Settings → Manual control is the way out.
  const onTap = () => {
    if (phase === 'pending' || doorState === 'unknown') return
    const next = doorState === 'open' ? 'close' : 'open'
    setAction(next)
    setPhase('pending')
    prevStateRef.current = doorState
    clearTimeout(pendingTimeoutRef.current)
    pendingTimeoutRef.current = setTimeout(() => fail(), PENDING_TIMEOUT_MS)
    ;(next === 'open' ? openLock() : closeLock()).catch((e) =>
      fail(`Could not send command: ${String(e.message ?? e)}`),
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Battery percent={batteryPercent} charging={charging} />
        <Pressable
          hitSlop={12}
          onPress={() => navigation.navigate('Settings')}
          accessibilityLabel="Settings"
        >
          <MaterialCommunityIcons name="cog" size={26} color={theme.textMuted} />
        </Pressable>
      </View>

      <View style={styles.center}>
        <Pressable
          onPress={onTap}
          onPressIn={() => (press.value = withSpring(1, GUMMY))}
          onPressOut={() => (press.value = withSpring(0, GUMMY))}
          disabled={doorState === 'unknown'}
          accessibilityRole="button"
          accessibilityLabel={doorState === 'open' ? 'Lock' : 'Unlock'}
        >
          <LockArt
            animation={animation}
            size={LOCK_SIZE}
            state={doorState}
            phase={phase}
            press={press}
            colors={{ ink: theme.text, accent: theme.primary, bg: theme.bg }}
          />
        </Pressable>

        <View style={styles.status}>
          <Text style={[styles.statusText, phase === 'failed' && { color: theme.danger }]}>
            {statusText(doorState, phase, action)}
          </Text>
          <Text style={styles.hint}>{hintText(doorState, phase)}</Text>
        </View>

        {error ? <Text style={styles.error}>Offline: {error}</Text> : null}
      </View>
    </SafeAreaView>
  )
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    battery: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    // the battery glyphs are drawn vertical; lay it on its side
    batteryIcon: { transform: [{ rotate: '90deg' }] },
    batteryLabel: { fontSize: 13, fontVariant: ['tabular-nums'] },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      gap: 8,
      // optical centre: sit the lock a little above the middle
      paddingBottom: 48,
    },
    status: { alignItems: 'center', gap: 4 },
    statusText: { color: theme.text, fontSize: 20, fontWeight: '600' },
    hint: { color: theme.textMuted, fontSize: 13 },
    error: { color: theme.danger, fontSize: 12, textAlign: 'center', marginTop: 12 },
  })
}
