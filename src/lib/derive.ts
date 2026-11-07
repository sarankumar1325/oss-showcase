import type { PR, OwnerType } from '../types'
import { dayKey, hourOf } from './format'

export type Group = [name: string, count: number]

const group = (prs: PR[], key: (p: PR) => string): Group[] => {
  const m = new Map<string, number>()
  prs.forEach((p) => m.set(key(p), (m.get(key(p)) ?? 0) + 1))
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export const sortNewest = (prs: PR[]) =>
  [...prs].sort((a, b) => b.mergedAt.localeCompare(a.mergedAt) || b.number - a.number)

export interface Derived {
  total: number
  newest: PR[]
  repoGroups: Group[]
  ownerGroups: Group[]
  orgCount: number
  individualCount: number
  /** owners whose type is still being looked up (live-loaded portfolios only) */
  unknownCount: number
  ownerType: Map<string, OwnerType>
  repoOwnerType: Map<string, OwnerType>
  counts: Map<string, number>
  days: [string, number][]
  firstDay: string
  lastDay: string
  hours: number[]
  peak: { day: string; n: number }
  activeDays: number
}

export function derive(prs: PR[]): Derived {
  const repoGroups = group(prs, (p) => `${p.owner}/${p.repo}`)
  const ownerGroups = group(prs, (p) => p.owner)
  const ownerType = new Map<string, OwnerType>()
  const repoOwnerType = new Map<string, OwnerType>()
  prs.forEach((p) => {
    ownerType.set(p.owner, p.ownerType)
    repoOwnerType.set(`${p.owner}/${p.repo}`, p.ownerType)
  })
  const counts = new Map<string, number>()
  const hours = new Array<number>(24).fill(0)
  prs.forEach((p) => {
    const d = dayKey(p.mergedAt)
    counts.set(d, (counts.get(d) ?? 0) + 1)
    hours[hourOf(p.mergedAt)]++
  })
  const days = [...counts].sort((a, b) => a[0].localeCompare(b[0]))
  const peak = days.reduce((best, [day, n]) => (n > best.n ? { day, n } : best), { day: '', n: 0 })
  return {
    total: prs.length,
    newest: sortNewest(prs),
    repoGroups,
    ownerGroups,
    orgCount: [...ownerType.values()].filter((t) => t === 'Organization').length,
    individualCount: [...ownerType.values()].filter((t) => t === 'User').length,
    unknownCount: [...ownerType.values()].filter((t) => t === 'Unknown').length,
    ownerType,
    repoOwnerType,
    counts,
    days,
    firstDay: days[0]?.[0] ?? '',
    lastDay: days.at(-1)?.[0] ?? '',
    hours,
    peak,
    activeDays: days.length,
  }
}

/** Human label for an owner type (Unknown while a live-loaded owner is still being looked up). */
export const ownerLabel = (t: OwnerType | undefined, long = false) =>
  t === 'Organization' ? 'Organization' : t === 'User' ? (long ? 'Individual owner' : 'Individual') : 'Owner'
