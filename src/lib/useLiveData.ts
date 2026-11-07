import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import snapshotJson from '../data/snapshot.json'
import type { Dataset, LiveEvent, OwnerType, PR, Snapshot, SyncStatus } from '../types'
import { sortNewest } from './derive'
import { AuthError, RateLimitError, resolveOwnerTypes, searchPage, toPR } from './github'
import { readOwnerTypes, writeOwnerTypes } from './cache'

/** Data generated at build time by `bun run snapshot` for the handle in portfolio.config.ts. */
export const snapshot = snapshotJson as unknown as Snapshot

const POLL_MS = 60_000
const RETRY_MS = 90_000
const REPLAY_HOLD = 4
const REPLAY_EVERY = 6_500

/**
 * Owns the dataset on screen. Starts from whatever the app booted with (build snapshot,
 * browser cache or a fresh live load), then polls GitHub search for newly merged PRs.
 * Owners whose type is still unknown are looked up in the background as budget allows.
 * If the network or rate limit gets in the way the data simply stays on screen.
 * `?demo` replays the newest real PRs one by one so the live experience can be previewed offline.
 */
export function useLiveData(enabled: boolean, dataset: Dataset) {
  const replay = useMemo(() => new URLSearchParams(location.search).has('demo'), [])
  const ordered = useMemo(() => sortNewest(dataset.prs), [dataset])

  const [prs, setPrs] = useState<PR[]>(() => (replay ? ordered.slice(REPLAY_HOLD) : ordered))
  const [status, setStatus] = useState<SyncStatus>(replay ? 'replay' : 'boot')
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [nextSync, setNextSync] = useState<number | null>(null)
  const [limitedUntil, setLimitedUntil] = useState<number | null>(null)
  const [tokenRejected, setTokenRejected] = useState(false)
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())

  const listeners = useRef(new Set<(e: LiveEvent) => void>())
  const known = useRef(new Set<string>(prs.map((p) => p.url)))
  const ownerTypes = useRef(
    (() => {
      const m = readOwnerTypes()
      for (const p of dataset.prs) if (p.ownerType !== 'Unknown') m.set(p.owner, p.ownerType)
      return m
    })(),
  )
  const synced = useRef(false)
  const busy = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const abort = useRef<AbortController | null>(null)
  const held = useRef<PR[]>(replay ? ordered.slice(0, REPLAY_HOLD).reverse() : [])
  const lastSyncRef = useRef<number | null>(null)
  const prsRef = useRef(prs)
  prsRef.current = prs

  const typed = useCallback((p: PR): PR => {
    const t = ownerTypes.current.get(p.owner)
    return t && t !== p.ownerType ? { ...p, ownerType: t } : p
  }, [])

  const accept = useCallback(
    (incoming: PR[], silent: boolean) => {
      const add = incoming.filter((p) => !known.current.has(p.url)).map(typed)
      if (!add.length) return
      add.forEach((p) => known.current.add(p.url))
      setPrs((prev) => sortNewest([...add, ...prev]))
      if (!silent) {
        const urls = add.map((p) => p.url)
        setFresh((prev) => new Set([...prev, ...urls]))
        setTimeout(() => setFresh((prev) => new Set([...prev].filter((u) => !urls.includes(u)))), 16_000)
      }
      add.forEach((pr) => listeners.current.forEach((fn) => fn({ pr, silent })))
    },
    [typed],
  )

  /** Look up owners still marked Unknown, then repaint the PRs that belong to them. */
  const fillOwnerTypes = useCallback(
    async (signal: AbortSignal) => {
      const missing = [...new Set(prsRef.current.filter((p) => !ownerTypes.current.has(p.owner)).map((p) => p.owner))]
      if (!missing.length) return
      // owners with the most PRs first, so the visible parts settle soonest
      const weight = new Map<string, number>()
      prsRef.current.forEach((p) => weight.set(p.owner, (weight.get(p.owner) ?? 0) + 1))
      missing.sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0))
      const found = await resolveOwnerTypes(missing, { signal })
      if (!found.size) return
      found.forEach((t, o) => ownerTypes.current.set(o, t))
      writeOwnerTypes(ownerTypes.current)
      setPrs((prev) => prev.map(typed))
    },
    [typed],
  )

  const schedule = useCallback((ms: number, run: () => void) => {
    clearTimeout(timer.current)
    setNextSync(Date.now() + ms)
    timer.current = setTimeout(run, ms)
  }, [])

  const sync = useCallback(async () => {
    if (busy.current) return
    if (document.hidden) {
      schedule(POLL_MS, () => void sync())
      return
    }
    busy.current = true
    setSyncing(true)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      const found: PR[] = []
      for (let page = 1; page <= 3; page++) {
        const { items } = await searchPage(dataset.query, page, 30, ctrl.signal)
        const pagePrs = items.map((it) => toPR(it)).filter((p): p is PR => p !== null)
        const unseen = pagePrs.filter((p) => !known.current.has(p.url))
        found.push(...unseen)
        if (unseen.length < pagePrs.length || items.length < 30) break
      }
      accept(found, !synced.current)
      synced.current = true
      const now = Date.now()
      lastSyncRef.current = now
      setLastSync(now)
      setLimitedUntil(null)
      setTokenRejected(false)
      setStatus('live')
      await fillOwnerTypes(ctrl.signal).catch(() => {})
      schedule(POLL_MS, () => void sync())
    } catch (e) {
      if (ctrl.signal.aborted) return
      if (e instanceof RateLimitError) {
        setStatus('limited')
        setLimitedUntil(e.until)
        schedule(Math.max(e.until - Date.now() + 1000, 30_000), () => void sync())
      } else if (e instanceof AuthError) {
        setTokenRejected(true)
        setStatus('offline')
        schedule(RETRY_MS, () => void sync())
      } else {
        setStatus('offline')
        schedule(RETRY_MS, () => void sync())
      }
    } finally {
      busy.current = false
      setSyncing(false)
    }
  }, [accept, fillOwnerTypes, schedule, dataset.query])

  // live polling
  useEffect(() => {
    if (!enabled || replay) return
    void sync()
    const onVisible = () => {
      if (!document.hidden && (lastSyncRef.current ?? 0) < Date.now() - POLL_MS) void sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      abort.current?.abort()
      clearTimeout(timer.current)
      busy.current = false
    }
  }, [enabled, replay, sync])

  // offline replay of real merges
  useEffect(() => {
    if (!enabled || !replay) return
    synced.current = true
    let t: ReturnType<typeof setTimeout>
    const next = () => {
      const pr = held.current.shift()
      if (!pr) return
      lastSyncRef.current = Date.now()
      setLastSync(lastSyncRef.current)
      accept([pr], false)
      t = setTimeout(next, REPLAY_EVERY)
    }
    t = setTimeout(next, 3_200)
    return () => clearTimeout(t)
  }, [enabled, replay, accept])

  const subscribe = useCallback((fn: (e: LiveEvent) => void) => {
    listeners.current.add(fn)
    return () => {
      listeners.current.delete(fn)
    }
  }, [])

  const syncNow = useCallback(() => {
    if (replay || busy.current) return
    void sync()
  }, [replay, sync])

  return { prs, status, syncing, lastSync, nextSync, limitedUntil, tokenRejected, fresh, subscribe, syncNow, replay, ownerTypes: ownerTypes.current as ReadonlyMap<string, OwnerType> }
}
