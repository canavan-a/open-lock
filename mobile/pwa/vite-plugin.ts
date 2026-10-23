// Writes dist/sw.js from pwa/sw.js with this build's version and file list
// (after super-chat's app/pwa/vite-plugin.ts).
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'

import type { Plugin } from 'vite'

function walk(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')]
  })
}

export function pwa(): Plugin {
  let outDir = 'dist'
  let root = process.cwd()
  return {
    name: 'open-lock-pwa',
    apply: 'build',
    configResolved(c) {
      root = c.root
      outDir = path.resolve(c.root, c.build.outDir)
    },
    closeBundle() {
      if (!fs.existsSync(outDir)) return
      const files = walk(outDir)
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort()
      const hash = createHash('sha256')
      for (const f of files) hash.update(f).update(fs.readFileSync(path.join(outDir, f)))
      const version = hash.digest('hex').slice(0, 16)
      const precache = files.map((f) => (f === 'index.html' ? '/' : '/' + f))
      const src = fs
        .readFileSync(path.join(root, 'pwa/sw.js'), 'utf8')
        .replace('self.__VERSION__', JSON.stringify(version))
        .replace('self.__PRECACHE__', JSON.stringify(precache))
      fs.writeFileSync(path.join(outDir, 'sw.js'), src)
    },
  }
}
