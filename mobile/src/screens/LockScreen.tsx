import { useFocusEffect, useNavigation } from '@react-navigation/native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import {
  BATTERY_UNAVAILABLE,
  closeLock,
  type DoorState,
  getBattery,
  getState,
  openLock,
} from '../api/client'
import { type Theme, useTheme, useThemedStyles } from '../theme'

// A port of web-controller/ui/src/Lock.jsx: same polling cadence, the same
// pending ring while waiting for the state we asked for, the same glyphs.

// How long to keep the pulsing "pending" ring before giving up on seeing the
// state flip we asked for.
const PENDING_TIMEOUT_MS = 15000
const STATE_POLL_MS = 1000
const BATTERY_POLL_MS = 5000
// Consecutive failed state polls before the screen says it's offline.
const OFFLINE_AFTER = 3

const LOCK_SIZE = 200

const OPEN_PATH =
  'M11.5 2C10.6716 2 10 2.67157 10 3.5V6H13V16H1V6H8V3.5C8 1.567 9.567 0 11.5 0C13.433 0 15 1.567 15 3.5V4H13V3.5C13 2.67157 12.3284 2 11.5 2ZM9 10H5V12H9V10Z'
const CLOSED_PATH =
  'M4 6V4C4 1.79086 5.79086 0 8 0C10.2091 0 12 1.79086 12 4V6H14V16H2V6H4ZM6 4C6 2.89543 6.89543 2 8 2C9.10457 2 10 2.89543 10 4V6H6V4ZM7 13V9H9V13H7Z'

// Runs `fn` now and every `ms` while the screen is focused and the app is in
// the foreground — nothing polls from the background.
function usePoll(fn: () => void, ms: number) {
  const fnRef = useRef(fn)
  fnRef.current = fn
  useFocusEffect(
    useCallback(() => {
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
    }, [ms]),
  )
}

function LockGlyph({ path, color, dim }: { path: string; color: string; dim: boolean }) {
  return (
    <Svg
      width={LOCK_SIZE}
      height={LOCK_SIZE}
      viewBox="0 0 16 16"
      style={{ opacity: dim ? 0.3 : 1 }}
    >
      <Path fillRule="evenodd" clipRule="evenodd" d={path} fill={color} />
    </Svg>
  )
}

// The web's animate-ping-fast: a disc that grows to 2x and fades, every 0.6s.
function PendingRing({ color }: { color: string }) {
  const t = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 600,
        easing: Easing.bezier(0, 0, 0.2, 1),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [t])
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: LOCK_SIZE,
        height: LOCK_SIZE,
        borderRadius: LOCK_SIZE / 2,
        backgroundColor: color,
        opacity: t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0.2, 0, 0] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 2, 2] }) }],
      }}
    />
  )
}

function BatteryGauge({ percent }: { percent: number | null }) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  if (percent === null) return null

  const isError = percent === BATTERY_UNAVAILABLE
  const clamped = isError ? 0 : Math.min(100, Math.max(0, percent))
  const color = isError
    ? theme.textMuted
    : clamped <= 20
      ? theme.danger
      : clamped <= 50
        ? '#facc15'
        : theme.success
  const label = isError ? '?' : `${clamped}%`

  return (
    <View style={styles.battery}>
      <View style={styles.batteryShell}>
        <View style={[styles.batteryFill, { width: `${clamped}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.batteryLabel}>{label}</Text>
    </View>
  )
}

export function LockScreen() {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const navigation = useNavigation<any>()

  const [doorState, setDoorState] = useState<DoorState>('unknown')
  const [isToggling, setIsToggling] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null)
  const [error, setError] = useState<string>()
  const prevStateRef = useRef<DoorState | null>(null)
  const pendingTimeoutRef = useRef(0)
  const failuresRef = useRef(0)

  const fetchState = () => {
    getState()
      .then(({ state }) => {
        failuresRef.current = 0
        setError(undefined)
        setDoorState(state)
        if (prevStateRef.current !== null && state !== prevStateRef.current) {
          prevStateRef.current = null
          clearTimeout(pendingTimeoutRef.current)
          setIsPending(false)
        }
      })
      .catch((e) => {
        failuresRef.current += 1
        if (failuresRef.current >= OFFLINE_AFTER) setError(String(e.message ?? e))
      })
  }

  const fetchBattery = () => {
    getBattery()
      .then(({ battery }) => setBatteryPercent(battery))
      .catch(() => {})
  }

  usePoll(fetchState, STATE_POLL_MS)
  usePoll(fetchBattery, BATTERY_POLL_MS)

  useEffect(() => () => clearTimeout(pendingTimeoutRef.current), [])

  const doCommand = (action: 'open' | 'close') => {
    if (isToggling) return
    setIsToggling(true)
    ;(action === 'open' ? openLock() : closeLock())
      .then(() => {
        setIsToggling(false)
        prevStateRef.current = doorState
        setIsPending(true)
        clearTimeout(pendingTimeoutRef.current)
        pendingTimeoutRef.current = setTimeout(() => {
          prevStateRef.current = null
          setIsPending(false)
        }, PENDING_TIMEOUT_MS)
      })
      .catch((e) => {
        Alert.alert('Could not send command', String(e.message ?? e))
        setIsToggling(false)
      })
  }

  const glyph =
    isToggling || doorState === 'unknown' ? (
      <View style={styles.glyphBox}>
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    ) : (
      <LockGlyph
        path={doorState === 'open' ? OPEN_PATH : CLOSED_PATH}
        color={theme.text}
        dim={isPending}
      />
    )

  return (
    <SafeAreaView style={styles.screen}>
      <Pressable
        style={styles.gear}
        hitSlop={12}
        onPress={() => navigation.navigate('Settings')}
        accessibilityLabel="Settings"
      >
        <MaterialCommunityIcons name="cog" size={26} color={theme.textMuted} />
      </Pressable>

      <View style={styles.center}>
        <View style={styles.glyphWrap}>
          {isPending && <PendingRing color={theme.text} />}
          {glyph}
        </View>

        <BatteryGauge percent={batteryPercent} />

        <View style={styles.buttons}>
          <Pressable
            onPress={() => doCommand('open')}
            style={({ pressed }) => [
              styles.btn,
              { opacity: doorState === 'closed' ? 1 : 0.3 },
              pressed && styles.btnPressed,
            ]}
          >
            <Text style={styles.btnText}>Unlock</Text>
          </Pressable>
          <Pressable
            onPress={() => doCommand('close')}
            style={({ pressed }) => [
              styles.btn,
              { opacity: doorState === 'open' ? 1 : 0.3 },
              pressed && styles.btnPressed,
            ]}
          >
            <Text style={styles.btnText}>Lock</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>Offline: {error}</Text> : null}
      </View>
    </SafeAreaView>
  )
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bg },
    gear: { position: 'absolute', top: 12, right: 16, zIndex: 1, padding: 4 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      gap: 24,
    },
    glyphWrap: { alignItems: 'center', justifyContent: 'center' },
    glyphBox: {
      width: LOCK_SIZE,
      height: LOCK_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    battery: { flexDirection: 'row', alignItems: 'center', gap: 8, opacity: 0.6 },
    batteryShell: {
      width: 80,
      height: 12,
      borderRadius: 2,
      borderWidth: 1,
      borderColor: theme.text,
      overflow: 'hidden',
    },
    batteryFill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
    batteryLabel: { color: theme.text, fontSize: 12, fontVariant: ['tabular-nums'] },
    buttons: { flexDirection: 'row', gap: 16, width: '100%', maxWidth: 448 },
    btn: {
      flex: 1,
      height: 64,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    btnPressed: { backgroundColor: theme.border },
    btnText: { color: theme.text, fontSize: 18, fontWeight: '600' },
    error: { color: theme.danger, fontSize: 12, textAlign: 'center' },
  })
}
