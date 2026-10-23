import path from 'path'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, transformWithEsbuild } from 'vite'

import { pwa } from './pwa/vite-plugin'

// The web build (a PWA) of the same src/ Metro bundles for Android, with
// "react-native" aliased to react-native-web. Files with a .web.ts(x) twin
// (App, lib/config, the Settings screen) are swapped for it, which is how the
// APK updater, launcher icons and Cloudflare Access settings stay out of it.
//
// API_ORIGIN is the web-controller the build talks to, fixed at build time
// (the Nix package's apiOrigin). Empty means the origin the page is served
// from. The dev server proxies the API to API_ORIGIN or localhost:8080.
const apiOrigin = (process.env.API_ORIGIN ?? '').replace(/\/+$/, '')
const devTarget = apiOrigin || 'http://localhost:8080'
const apiPaths = ['/state', '/battery', '/open', '/close', '/healthz']

// RN libraries ship JSX in plain .js files (react-native-vector-icons), which
// Rollup can't parse, and load images with Metro's require('./x.png')
// (React Navigation's back arrow), which a browser can't run. Both are
// rewritten: the JSX compiled, each image require made an import.
const IMAGE_REQUIRE = /require\((['"])([^'"]+\.(?:png|jpe?g|gif|webp))\1\)/g

function rnLibraries(): Plugin {
  return {
    name: 'rn-libraries',
    enforce: 'pre',
    async transform(code, id) {
      if (!/node_modules\/.*\.js$/.test(id)) return null
      const images: string[] = []
      let out = code.replace(IMAGE_REQUIRE, (_m, _q, file: string) => {
        images.push(`import __rnImage${images.length} from ${JSON.stringify(file)}`)
        return `__rnImage${images.length - 1}`
      })
      if (images.length) out = images.join('\n') + '\n' + out
      if (!images.length && !/<[A-Za-z]/.test(code)) return null
      return transformWithEsbuild(out, id, { loader: 'jsx', jsx: 'automatic' })
    },
  }
}

// Skia finds Reanimated with a bare require() inside ES modules, which Vite
// leaves as-is: the proxy throws "react-native-reanimated is not installed!"
// and HAS_REANIMATED_3 stays false, so shared values never reach the canvas.
// Both are swapped for static imports.
const skiaReanimated: Record<string, string> = {
  'external/reanimated/ReanimatedProxy.js':
    "import * as Reanimated from 'react-native-reanimated'\nexport default Reanimated\n",
  'external/reanimated/renderHelpers.js': 'export const HAS_REANIMATED_3 = true\n',
}

function skiaWeb(): Plugin {
  return {
    name: 'skia-reanimated',
    enforce: 'pre',
    transform(_code, id) {
      const m = id.match(/@shopify\/react-native-skia\/lib\/module\/(.*)$/)
      const code = m && skiaReanimated[m[1]]
      return code ? { code, map: null } : null
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    skiaWeb(),
    rnLibraries(),
    react({
      include: /\.(jsx|js|tsx|ts)$/,
      // Same plugin as babel.config.js: Reanimated needs its worklets
      // compiled on web too.
      babel: { plugins: ['react-native-reanimated/plugin'] },
    }),
    pwa(),
  ],
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, 'node_modules/react-native-web'),
    },
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
  },
  define: {
    __API_ORIGIN__: JSON.stringify(mode === 'production' ? apiOrigin : ''),
    __DEV__: JSON.stringify(mode !== 'production'),
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    // React Native's `global`, which react-native-web and Reanimated still use.
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      // Libraries ship JSX and RN-only syntax in .js files.
      loader: { '.js': 'jsx' },
      resolveExtensions: ['.web.js', '.web.ts', '.web.tsx', '.js', '.ts', '.tsx'],
    },
  },
  server: {
    proxy: {
      ...Object.fromEntries(apiPaths.map((p) => [p, { target: devTarget, changeOrigin: true }])),
      '/ws': { target: devTarget.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
}))
