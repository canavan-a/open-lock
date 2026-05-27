import { useEffect, useState } from 'react'

type LockState = 'open' | 'closed' | 'unknown'

async function fetchState(): Promise<LockState> {
  const res = await fetch('/state')
  const data = await res.json()
  return data.state as LockState
}

export default function App() {
  const [lockState, setLockState] = useState<LockState>('unknown')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchState().then(setLockState).catch(() => setLockState('unknown'))
    const id = setInterval(() => {
      fetchState().then(setLockState).catch(() => setLockState('unknown'))
    }, 2000)
    return () => clearInterval(id)
  }, [])

  async function send(cmd: 'open' | 'close') {
    setBusy(true)
    try {
      await fetch(`/${cmd}`, { method: 'POST' })
      await new Promise(r => setTimeout(r, 500))
      setLockState(await fetchState())
    } finally {
      setBusy(false)
    }
  }

  const stateLabel = busy
    ? 'wait'
    : lockState === 'open'
    ? 'unlocked'
    : lockState === 'closed'
    ? 'locked'
    : '...'

  const stateColor = busy
    ? 'text-zinc-500'
    : lockState === 'open'
    ? 'text-green-400'
    : lockState === 'closed'
    ? 'text-red-400'
    : 'text-zinc-600'

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-12">
      <p className="text-xs font-semibold tracking-widest uppercase text-zinc-600">
        open lock
      </p>

      <span className={`text-7xl font-black tracking-tight uppercase transition-colors duration-200 ${stateColor}`}>
        {stateLabel}
      </span>

      <div className="flex gap-4">
        <button
          onClick={() => send('open')}
          disabled={busy || lockState === 'open'}
          className="px-8 py-3 rounded-lg border-2 border-green-500 text-green-400 font-bold uppercase text-sm tracking-widest
                     disabled:opacity-20 disabled:cursor-not-allowed
                     not-disabled:hover:bg-green-500/10 transition-colors duration-150 cursor-pointer"
        >
          Unlock
        </button>
        <button
          onClick={() => send('close')}
          disabled={busy || lockState === 'closed'}
          className="px-8 py-3 rounded-lg border-2 border-red-500 text-red-400 font-bold uppercase text-sm tracking-widest
                     disabled:opacity-20 disabled:cursor-not-allowed
                     not-disabled:hover:bg-red-500/10 transition-colors duration-150 cursor-pointer"
        >
          Lock
        </button>
      </div>
    </div>
  )
}
