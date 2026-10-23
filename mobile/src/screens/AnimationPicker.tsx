import React, { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSharedValue, withSpring } from 'react-native-reanimated'
import type { DoorState } from '../api/client'
import { saveConfig, getConfig } from '../lib/config'
import { GUMMY, type LockPhase } from '../lock/motion'
import { LOCK_ANIMATIONS, LockArt, type LockAnimationId, useLockAnimation } from '../lock/registry'
import { type Theme, useTheme, useThemedStyles } from '../theme'

const PREVIEW_SIZE = 84
const COLUMNS = 3
// demo loop for the selected card: wait as if a command were pending, flip,
// then rest long enough to watch the landing
const DEMO_PENDING_MS = 800
const DEMO_REST_MS = 1700

function AnimationCard({
  id,
  label,
  selected,
  onPick,
}: {
  id: LockAnimationId
  label: string
  selected: boolean
  onPick: () => void
}) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const press = useSharedValue(0)
  const [state, setState] = useState<DoorState>('closed')
  const [phase, setPhase] = useState<LockPhase>('idle')
  const stateRef = useRef<DoorState>('closed')

  useEffect(() => {
    if (!selected) {
      setPhase('idle')
      return
    }
    let timer = 0
    const cycle = () => {
      setPhase('pending')
      timer = setTimeout(() => {
        const next = stateRef.current === 'open' ? 'closed' : 'open'
        stateRef.current = next
        setState(next)
        setPhase('idle')
        timer = setTimeout(cycle, DEMO_REST_MS)
      }, DEMO_PENDING_MS)
    }
    timer = setTimeout(cycle, 250)
    return () => clearTimeout(timer)
  }, [selected])

  return (
    <Pressable
      style={[styles.card, selected && styles.cardActive]}
      onPress={onPick}
      onPressIn={() => (press.value = withSpring(1, GUMMY))}
      onPressOut={() => (press.value = withSpring(0, GUMMY))}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <LockArt
        animation={id}
        size={PREVIEW_SIZE}
        state={state}
        phase={phase}
        press={press}
        colors={{ ink: theme.text, accent: theme.primary, bg: theme.surface }}
      />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  )
}

// Three-column grid of live previews, names only: the selected one plays a
// lock/unlock loop. Picking saves immediately, like the theme swatches.
export function AnimationPicker() {
  const styles = useThemedStyles(makeStyles)
  const current = useLockAnimation()
  const pick = (id: LockAnimationId) => saveConfig({ ...getConfig(), lockAnimation: id })

  return (
    <View style={styles.grid}>
      {LOCK_ANIMATIONS.map((a) => (
        <AnimationCard
          key={a.id}
          id={a.id}
          label={a.label}
          selected={current === a.id}
          onPick={() => pick(a.id)}
        />
      ))}
      {/* keep a short last row lined up with the columns above */}
      {Array.from({ length: (COLUMNS - (LOCK_ANIMATIONS.length % COLUMNS)) % COLUMNS }, (_, i) => (
        <View key={i} style={styles.spacer} />
      ))}
    </View>
  )
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
    card: {
      width: '32%',
      alignItems: 'center',
      paddingBottom: 8,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    spacer: { width: '32%' },
    cardActive: { borderColor: theme.primary },
    label: { color: theme.text, fontSize: 12, fontWeight: '600' },
  })
}
