# release/

Local signing material and the guided release tool for Super Lock
(`mobile/`).

Tracked in git: `release.sh`, `README.md`, `.gitignore`.
**Never** committed: `release.keystore`, `keystore.env`, built APKs.

## Cutting a release

```
./release/release.sh
```

On the first run there is no keystore yet; the script offers to create
`release.keystore` and a matching `keystore.env` with a random password.
**Back both up.** Every release must be signed with the same key — lose it and
installed copies can't take updates (uninstall + reinstall).

Then the script: checks the toolchain, sources `keystore.env`, lists existing
`mobile-v*` tags, prompts for the new tag (e.g. `mobile-v0.1.0`) and a
`versionCode`, runs `./gradlew assembleRelease` with full output, then — after a
single confirmation — creates and pushes the tag and publishes a GitHub Release
on canavan-a/open-lock with the signed APK attached as
`super-lock-mobile-v<version>.apk`. That release is what the app's in-app
updater (Settings → Updates) finds.

Assumes `git`, `java`/`keytool`, the Android SDK/build-tools, and `gh`
(authenticated) are installed.
