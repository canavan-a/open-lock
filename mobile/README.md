# Super Lock (Android)

Super Lock is the sideloaded (direct-APK, no Play Store) Android client for the
open-lock web-controller. It is the web UI (`web-controller/ui`) as a native
app: the lock glyph, battery gauge and Unlock / Lock buttons, with the same
polling and "pending" ring. A gear in the top-right corner opens Settings.

It talks to the same HTTP API the web UI uses (`/state`, `/battery`, `/open`,
`/close` — see [`web-controller/readme.md`](../web-controller/readme.md)); no
server changes are needed.

## Stack

- React Native 0.75 (bare CLI), Hermes, old architecture — the same base as
  Super Eye in horus-33.
- `react-native-svg` for the lock glyphs, `@react-navigation` native stack
  (Lock → Settings).

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
screen polls `/state` every second and `/battery` every 5 s, only while it is
on screen and the app is in the foreground.

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
