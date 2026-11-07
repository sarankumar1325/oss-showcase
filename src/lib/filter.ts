import type { Filter, PR } from '../types'

export const EMPTY_FILTER: Filter = { q: '', owner: '', repo: '', sort: 'newest' }
export const PAGE_SIZES = [10, 20, 50, 100] as const

export function applyFilter(prs: PR[], f: Filter, q = f.q): PR[] {
  const needle = q.trim().toLowerCase()
  const rows = prs.filter(
    (p) =>
      (!f.owner || p.owner === f.owner) &&
      (!f.repo || `${p.owner}/${p.repo}` === f.repo) &&
      (!needle || `${p.title} ${p.owner}/${p.repo} #${p.number} ${p.labels.join(' ')}`.toLowerCase().includes(needle)),
  )
  const by: Record<Filter['sort'], (a: PR, b: PR) => number> = {
    newest: (a, b) => b.mergedAt.localeCompare(a.mergedAt) || b.number - a.number,
    oldest: (a, b) => a.mergedAt.localeCompare(b.mergedAt) || a.number - b.number,
    repo: (a, b) => `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`) || b.mergedAt.localeCompare(a.mergedAt),
    title: (a, b) => a.title.localeCompare(b.title),
  }
  return rows.sort(by[f.sort])
}

export type RouteName = 'home' | 'archive'

export interface HashState {
  route: RouteName
  filter: Filter
  page: number
  size: number
}

const SORTS: Filter['sort'][] = ['newest', 'oldest', 'repo', 'title']

export function readHash(): HashState {
  const h = location.hash
  if (!h.startsWith('#/contributions')) return { route: 'home', filter: EMPTY_FILTER, page: 1, size: 20 }
  const p = new URLSearchParams(h.split('?')[1] ?? '')
  const sort = p.get('sort') as Filter['sort']
  const size = Number(p.get('size'))
  return {
    route: 'archive',
    filter: {
      q: p.get('q') ?? '',
      owner: p.get('owner') ?? '',
      repo: p.get('repo') ?? '',
      sort: SORTS.includes(sort) ? sort : 'newest',
    },
    page: Math.max(1, Number(p.get('page')) || 1),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : 20,
  }
}

export function archiveHash(f: Filter, page: number, size: number): string {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.owner) p.set('owner', f.owner)
  if (f.repo) p.set('repo', f.repo)
  if (f.sort !== 'newest') p.set('sort', f.sort)
  if (page > 1) p.set('page', String(page))
  if (size !== 20) p.set('size', String(size))
  const qs = p.toString()
  return '#/contributions' + (qs ? '?' + qs : '')
}
