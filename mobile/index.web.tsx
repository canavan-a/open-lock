import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web'
import canvasKitWasm from 'canvaskit-wasm/bin/full/canvaskit.wasm?url'
import iconFont from 'react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf?url'

// The web build's entry (index.js is Metro's). Skia draws the lock with
// CanvasKit on web, and every Skia import needs it loaded first, so the app
// itself is imported only once it is.

const font = document.createElement('style')
font.textContent = `@font-face { font-family: MaterialCommunityIcons; src: url(${iconFont}) format('truetype'); }`
document.head.appendChild(font)

if ('serviceWorker' in navigator && !__DEV__) {
  // A new build installs in the background and takes over the next time the
  // app is hidden, never mid-tap.
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') reg.waiting?.postMessage('skip-waiting')
    })
  })
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !navigator.serviceWorker.controller) return
    reloading = true
    window.location.reload()
  })
}

LoadSkiaWeb({ locateFile: () => canvasKitWasm }).then(async () => {
  const [{ createRoot }, { default: App }] = await Promise.all([
    import('react-dom/client'),
    import('./src/App'),
  ])
  createRoot(document.getElementById('root')!).render(<App />)
})
