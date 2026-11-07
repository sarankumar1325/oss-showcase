import me from './data/me.json'
import evan from './data/evan.json'

export interface PR {
  o: string
  r: string
  t: string
  k: string // 'O' organization, 'U' user
}
export interface Person {
  handle: string
  name: string
  prs: PR[]
}

const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
export const dayKey = (iso: string) => keyFmt.format(new Date(iso))
const DAY = 86_400_000

export const ME = me as Person
export const EVAN = evan as Person

export interface Repo {
  name: string
  owner: string
  count: number
  user: boolean
}

export function repos(p: Person): Repo[] {
  const m = new Map<string, Repo>()
  for (const pr of p.prs) {
    const name = `${pr.o}/${pr.r}`
    const r = m.get(name) ?? { name, owner: pr.o, count: 0, user: pr.k === 'U' }
    r.count++
    m.set(name, r)
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Daily merged-PR counts from the first merge day to the snapshot day (as on the site's Rhythm chart). */
export function daily(p: Person, endKey = '2026-11-07') {
  const counts = new Map<string, number>()
  for (const pr of p.prs) counts.set(dayKey(pr.t), (counts.get(dayKey(pr.t)) ?? 0) + 1)
  const keys = [...counts.keys()].sort()
  const out: { key: string; n: number }[] = []
  for (let t = Date.parse(keys[0] + 'T00:00:00Z'); t <= Date.parse(endKey + 'T00:00:00Z'); t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10)
    out.push({ key, n: counts.get(key) ?? 0 })
  }
  return out
}

/** The 2026 calendar as weeks × weekdays. */
export function calendar(p: Person, endKey = '2026-11-07') {
  const counts = new Map<string, number>()
  for (const pr of p.prs) counts.set(dayKey(pr.t), (counts.get(dayKey(pr.t)) ?? 0) + 1)
  const start = Date.UTC(2026, 0, 1)
  const first = new Date(start)
  first.setUTCDate(first.getUTCDate() - first.getUTCDay())
  const cells: { key: string; w: number; d: number; n: number }[] = []
  for (let t = first.getTime(); t <= Date.parse(endKey + 'T00:00:00Z'); t += DAY) {
    if (t < start) continue
    const i = Math.floor((t - first.getTime()) / DAY)
    const key = new Date(t).toISOString().slice(0, 10)
    cells.push({ key, w: Math.floor(i / 7), d: new Date(t).getUTCDay(), n: counts.get(key) ?? 0 })
  }
  return { cells, weeks: cells.at(-1)!.w + 1 }
}

/** PRs in merge order (oldest first): the order the light streaks arrive in. */
export const mergeOrder = (p: Person) => [...p.prs].sort((a, b) => a.t.localeCompare(b.t))
