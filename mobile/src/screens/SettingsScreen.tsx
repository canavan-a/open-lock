import { Picker } from '@react-native-picker/picker'
import { useRoute } from '@react-navigation/native'
import React, { useEffect, useState } from 'react'
import {
  Alert,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { BATTERY_UNAVAILABLE, getBattery, getState } from '../api/client'
import {
  compareVersions,
  DowngradeBlockedError,
  fetchReleases,
  getVersionInfo,
  onDownloadProgress,
  type Release,
  runUpdate,
} from '../lib/appUpdater'
import {
  DEFAULT_CONFIG,
  getConfig,
  type LockConfig,
  loadConfig,
  saveConfig,
} from '../lib/config'
import { useTheme, useThemedStyles } from '../theme'
import { AnimationPicker } from './AnimationPicker'
import { Field, makeStyles, ManualControl, ThemePicker } from './settingsParts'

export function SettingsScreen() {
  const isSetup = useRoute().name === 'Setup'
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)

  const [cfg, setCfg] = useState<LockConfig>(DEFAULT_CONFIG)
  const [testResult, setTestResult] = useState<string>()
  const [testOk, setTestOk] = useState(false)

  const [version, setVersion] = useState<string>()
  const [releases, setReleases] = useState<Release[]>([])
  const [selectedTag, setSelectedTag] = useState<string>()
  const [updateStatus, setUpdateStatus] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [showDowngrade, setShowDowngrade] = useState(false)

  useEffect(() => {
    loadConfig().then(setCfg)
    getVersionInfo()
      .then((v) => setVersion(`${v.versionName} (${v.versionCode})`))
      .catch(() => setVersion('unknown'))
      .finally(() => void checkUpdates())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!busy) return
    const off = onDownloadProgress(({ bytesDownloaded, bytesTotal, paused }) => {
      const pct = bytesTotal > 0 ? Math.round((bytesDownloaded / bytesTotal) * 100) : 0
      setUpdateStatus(paused ? `Download paused (${paused})… ${pct}%` : `Downloading… ${pct}%`)
    })
    return off
  }, [busy])

  const currentVersionName = version?.split(' ')[0]
  const latest = releases[0]
  const updateAvailable =
    !!latest &&
    !!currentVersionName &&
    compareVersions(latest.version, currentVersionName) > 0
  const showVersionPicker = updateAvailable || showDowngrade

  const checkUpdates = async () => {
    setChecking(true)
    setUpdateStatus(undefined)
    try {
      const rs = await fetchReleases()
      setReleases(rs)
      setSelectedTag((t) => t ?? rs[0]?.tag)
    } catch (e) {
      setUpdateStatus(`Check failed: ${String(e)}`)
    } finally {
      setChecking(false)
    }
  }

  const onInstallUpdate = async () => {
    const target = releases.find((r) => r.tag === selectedTag)
    if (!target) return
    if (currentVersionName && compareVersions(target.version, currentVersionName) < 0) {
      Alert.alert(
        'Downgrade blocked',
        `v${target.version} is older than the installed v${currentVersionName}. Android will not replace a newer build — uninstall the app first, then install the older version.`,
      )
      return
    }
    setBusy(true)
    setUpdateStatus('Starting…')
    try {
      await runUpdate(target)
      setUpdateStatus('Opening installer…')
    } catch (e) {
      if (e instanceof DowngradeBlockedError) {
        Alert.alert('Downgrade blocked', 'Uninstall the app first to install an older version.')
        setUpdateStatus(undefined)
      } else {
        setUpdateStatus(`Update failed: ${String(e)}`)
      }
    } finally {
      setBusy(false)
    }
  }

  const set = <K extends keyof LockConfig>(k: K, v: LockConfig[K]) => {
    setCfg((c) => ({ ...c, [k]: v }))
    if (k === 'host' || k === 'cfAccessClientId' || k === 'cfAccessClientSecret') {
      setTestOk(false)
    }
  }

  // Keeps the theme and lock animation as they are now: each is saved on its
  // own the moment it's picked, and `cfg` may hold a stale copy.
  const persist = () =>
    saveConfig({
      ...cfg,
      themeName: getConfig().themeName,
      lockAnimation: getConfig().lockAnimation,
    })

  const onSave = async () => {
    await persist()
    Alert.alert('Saved')
  }

  // Tests the values in the form, not the saved ones.
  const onTest = async () => {
    setTestResult('…')
    setTestOk(false)
    try {
      const [{ state }, battery] = await Promise.all([
        getState(cfg),
        getBattery(cfg).catch(() => null),
      ])
      const bat = battery
        ? ` · battery ${battery.battery === BATTERY_UNAVAILABLE ? '?' : `${battery.battery}%`}`
        : ''
      setTestResult(`Connected — lock is ${state}${bat}`)
      setTestOk(true)
    } catch (e) {
      setTestResult(`Failed: ${String((e as Error).message ?? e)}`)
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Field label="Open Lock hostname">
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="lock.example.com"
          placeholderTextColor={theme.textMuted}
          value={cfg.host}
          onChangeText={(t) => set('host', t.trim())}
        />
      </Field>
      <Text style={styles.hint}>
        The cloudflared tunnel hostname for the web-controller (https). For LAN use, enter a
        full origin instead, e.g. http://192.168.1.20:8080.
      </Text>

      <Text style={styles.section}>Cloudflare Access</Text>
      <Field label="CF-Access-Client-Id">
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          value={cfg.cfAccessClientId}
          onChangeText={(t) => set('cfAccessClientId', t.trim())}
        />
      </Field>
      <Field label="CF-Access-Client-Secret">
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={cfg.cfAccessClientSecret}
          onChangeText={(t) => set('cfAccessClientSecret', t.trim())}
        />
      </Field>
      <Text style={styles.hint}>
        A service token from Zero Trust → Access → Service Auth. The application's policy needs a
        "Service Auth" rule that includes this token. Leave blank on a LAN.
      </Text>

      {!isSetup && (
        <TouchableOpacity style={styles.btn} onPress={onSave}>
          <Text style={styles.btnText}>Save</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.btnOutline} onPress={onTest}>
        <Text style={styles.btnOutlineText}>Test connection</Text>
      </TouchableOpacity>
      {testResult ? (
        <Text style={[styles.hint, testOk && { color: theme.success }]}>{testResult}</Text>
      ) : null}

      {isSetup && testOk && (
        <TouchableOpacity style={styles.btn} onPress={() => persist()}>
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.section}>Appearance</Text>
      <ThemePicker />
      <Text style={styles.hint}>The app icon follows the theme once you leave the app.</Text>

      <Text style={styles.section}>Lock animation</Text>
      <AnimationPicker />

      {!isSetup && <ManualControl />}

      <Text style={styles.section}>Updates</Text>
      <TouchableOpacity onPress={checkUpdates} disabled={checking}>
        <Text style={styles.hint}>
          {checking
            ? 'Checking…'
            : latest
              ? updateAvailable
                ? `Update available: v${latest.version}`
                : `Up to date (v${latest.version})`
              : `Current version: ${version ?? '…'}`}
        </Text>
      </TouchableOpacity>

      {!showVersionPicker && latest && (
        <TouchableOpacity onPress={() => setShowDowngrade(true)}>
          <Text style={styles.linkText}>Downgrade</Text>
        </TouchableOpacity>
      )}

      {showVersionPicker && (
        <>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={selectedTag}
              onValueChange={(v) => setSelectedTag(String(v))}
              dropdownIconColor={theme.text}
              style={styles.picker}
            >
              {releases.map((r, i) => (
                <Picker.Item
                  key={r.tag}
                  label={i === 0 ? `Latest — v${r.version}` : `v${r.version}`}
                  value={r.tag}
                  color="#111"
                />
              ))}
            </Picker>
          </View>
          <TouchableOpacity
            style={[styles.btn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={onInstallUpdate}
          >
            <Text style={styles.btnText}>
              {updateAvailable ? `Update to v${latest.version}` : 'Install selected version'}
            </Text>
          </TouchableOpacity>
        </>
      )}
      {updateStatus ? <Text style={styles.hint}>{updateStatus}</Text> : null}

      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Check for updates automatically</Text>
          <Text style={styles.hint}>Checks GitHub Releases when the app opens.</Text>
        </View>
        <Switch
          value={cfg.autoUpdateCheck}
          onValueChange={(v) => set('autoUpdateCheck', v)}
        />
      </View>
      {!isSetup && <Text style={styles.hint}>Tap Save to keep this change.</Text>}
    </ScrollView>
  )
}
