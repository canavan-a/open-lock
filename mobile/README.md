# Super Lock (Android)

Super Lock is the sideloaded (direct-APK, no Play Store) Android client for the
open-lock web-controller. The screen is one big animated padlock: tap it to ask
for the opposite of what it shows. The battery sits in the top-left corner and
a gear in the top-right opens Settings.

It talks to the web-controller's HTTP API (`/state`, `/battery`, `/open`,
`/close`) and its `/ws` socket — see
[`web-controller/readme.md`](../web-controller/readme.md).

## Lock screen

- **Tap** sends unlock if the lock shows locked, lock if it shows unlocked.
  The lock animates while the command is pending and lands when the firmware
  reports the new state (with a short vibration).
- If nothing changes within 8 s the screen shows **Didn't confirm** with a
  shake. That also happens when the screen is out of sync with the door (the
  firmware just re-reports the state it's already in). **Settings → Manual
  control** sends a specific unlock or lock to recover.
- **Settings → Lock animation** picks one of eight animations, each with a
  live preview: Jell-O, Liquid, Gummy, Taffy, Goo, Bubble Pop, Sprinkles,
  Splash. Saved the moment it's picked.

## Stack

- React Native 0.75 (bare CLI), Hermes, old architecture — the same base as
  Super Eye in horus-33.
- `@shopify/react-native-skia` 1.x draws the padlock and
  `react-native-reanimated` 3.x drives it on the UI thread (both are the last
  majors that support RN 0.75 on the old architecture). The animations live in
  `src/lock/`: `geometry.ts` is the padlock, `motion.ts` the shared springs and
  state, `animations/` one file each, `registry.tsx` the list Settings shows.
- `@react-navigation` native stack (Lock → Settings).

## Connecting

Settings has two shapes:

- **Remote** — a `cloudflared` tunnel hostname pointing at the web-controller
  (e.g. `lock.example.com`, always `https`), behind Cloudflare Access. Create a
  service token (Zero Trust → Access → Service Auth), add a **Service Auth**
  rule including it to the Access application's policy, and paste the
  **CF-Access-Client-Id / Secret** into Settings. They ride on every request.
  A missing or rejected token shows up as "blocked by Cloudflare Access".
- **LAN** — a full origin such as `http://192.168.1.20:8080`; leave the token
  blank.

"Test connection" uses the values in the form before they are saved. The lock
screen gets live state over `/ws` while it is on screen and the app is in the
foreground, reconnecting with backoff; while the socket is down it polls
`/state` every second and `/battery` every 5 s.

## Themes

Settings → Appearance picks one of five palettes — Light, Dark (default), Slate,
Sepia, Ember — the same set as Super Eye, super-chat and super-badger. It
applies immediately and is stored with the rest of the config.

The launcher icon (a padlock, keyhole in the theme accent) follows the theme:
the manifest declares one `<activity-alias>` per theme and `AppIconModule.kt`
enables exactly one. The swap only happens as the app goes to the background.
Below Android 8 every alias uses the plain black padlock.

## Updates

Settings → Updates checks GitHub Releases on canavan-a/open-lock for
`mobile-v*` tags, and downloads and hands the APK to the system installer
(`AppUpdaterModule.kt`). It also checks on launch unless turned off.

## Develop

```
npm install
npm start                 # Metro
npm run android           # debug build onto a connected device
```

## Release APK

```
./release/release.sh      # from the repo root
```

Builds a signed APK, tags `mobile-v<version>`, and publishes a GitHub Release
the in-app updater picks up. See [`release/README.md`](../release/README.md).
Without signing env vars, `./gradlew assembleRelease` in `android/` still
works but signs with the debug key.
