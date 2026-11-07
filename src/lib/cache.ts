/**
 * Per-browser cache so a portfolio loaded live opens instantly next time.
 * Best effort: storage can be blocked or full, and everything still works without it.
 */
import type { OwnerType, PR } from '../types'

const DATA = (handle: string) => `oss:data:v1:${handle.toLowerCase()}`
const OWNERS = 'oss:owner-types:v1'
/** after this, reload the full history instead of trusting the cache plus polling */
export const CACHE_MAX_AGE = 7 * 86_400_000

export interface CachedData {
  query: string
  prs: PR[]
  fetchedAt: number
}

export function readData(handle: string, query: string): CachedData | null {
  try {
    const raw = localStorage.getItem(DATA(handle))
    if (!raw) return null
    const d = JSON.parse(raw) as CachedData
    if (d.query !== query || !Array.isArray(d.prs)) return null
    if (Date.now() - d.fetchedAt > CACHE_MAX_AGE) return null
    return d
  } catch {
    return null
  }
}

export function writeData(handle: string, query: string, prs: PR[], fetchedAt = Date.now()) {
  try {
    localStorage.setItem(DATA(handle), JSON.stringify({ query, prs, fetchedAt } satisfies CachedData))
  } catch {
    /* full or blocked */
  }
}

export function readOwnerTypes(): Map<string, OwnerType> {
  try {
    const raw = localStorage.getItem(OWNERS)
    return new Map(raw ? (JSON.parse(raw) as [string, OwnerType][]) : [])
  } catch {
    return new Map()
  }
}

export function writeOwnerTypes(m: Map<string, OwnerType>) {
  try {
    const known = [...m].filter(([, t]) => t !== 'Unknown').slice(-4000)
    localStorage.setItem(OWNERS, JSON.stringify(known))
  } catch {
    /* full or blocked */
  }
}
