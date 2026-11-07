import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Filter, PR } from '../types'
import type { Derived } from '../lib/derive'
import { applyFilter, archiveHash, EMPTY_FILTER, PAGE_SIZES } from '../lib/filter'
import { dayKey, fmtDate, fmtKeyDay, tzLabel } from '../lib/format'
import { useProfile } from '../lib/profile'
import { gsap } from '../lib/gsap'
import { prefersReducedMotion } from '../lib/hooks'
import { scrollToId } from '../lib/scroll'
import { Icon } from './ui'
import { Select } from './Select'
import { PRRow } from './PRRow'

const dayLabel = fmtKeyDay

function pageList(cur: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, 2, cur - 1, cur, cur + 1, pages - 1, pages].filter((n) => n >= 1 && n <= pages))
  const sorted = [...set].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push('…')
    out.push(n)
  })
  return out
}

interface Props {
  prs: PR[]
  d: Derived
  filter: Filter
  setFilter: (f: Filter) => void
  now: number
  initialPage: number
  initialSize: number
  onHome: () => void
}

export function ArchivePage({ prs, d, filter, setFilter, now, initialPage, initialSize, onHome }: Props) {
  const profile = useProfile()
  const [page, setPage] = useState(initialPage)
  const [size, setSize] = useState(initialSize)
  const [group, setGroup] = useState(true)
  const q = useDeferredValue(filter.q)
  const root = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => applyFilter(prs, filter, q), [prs, filter, q])
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const cur = Math.min(page, pages)
  const slice = useMemo(() => rows.slice((cur - 1) * size, cur * size), [rows, cur, size])
  const grouped = group && (filter.sort === 'newest' || filter.sort === 'oldest')

  const resetKey = [filter.owner, filter.repo, filter.sort, q, size].join('|')
  const prevKey = useRef(resetKey)
  useEffect(() => {
    if (prevKey.current !== resetKey) {
      prevKey.current = resetKey
      setPage(1)
    }
  }, [resetKey])

  useEffect(() => {
    history.replaceState(null, '', archiveHash(filter, cur, size))
  }, [filter, cur, size])

  const dayCounts = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((p) => m.set(dayKey(p.mergedAt), (m.get(dayKey(p.mergedAt)) ?? 0) + 1))
    return m
  }, [rows])

  const segments = useMemo(() => {
    if (!grouped) return [{ key: 'all', label: '', items: slice }]
    const out: { key: string; label: string; items: PR[] }[] = []
    for (const p of slice) {
      const k = dayKey(p.mergedAt)
      const last = out.at(-1)
      if (last && last.key === k) last.items.push(p)
      else out.push({ key: k, label: dayLabel(k), items: [p] })
    }
    return out
  }, [slice, grouped])

  const owners = useMemo(
    () => [...d.ownerGroups].sort((a, b) => a[0].localeCompare(b[0])).map(([n, c]) => ({ value: n, label: n, hint: String(c) })),
    [d.ownerGroups],
  )
  const repos = useMemo(
    () =>
      d.repoGroups
        .filter(([n]) => !filter.owner || n.startsWith(filter.owner + '/'))
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([n, c]) => ({ value: n, label: filter.owner ? n.split('/')[1] : n, hint: String(c) })),
    [d.repoGroups, filter.owner],
  )
  const sorts = useMemo(
    () => [
      { value: 'newest', label: 'Latest merged' },
      { value: 'oldest', label: 'Earliest merged' },
      { value: 'repo', label: 'Repository A–Z' },
      { value: 'title', label: 'Title A–Z' },
    ],
    [],
  )
  const sizes = useMemo(() => PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` })), [])

  const distinctRepos = useMemo(() => new Set(rows.map((p) => `${p.owner}/${p.repo}`)).size, [rows])
  const span = useMemo(() => {
    if (!rows.length) return '—'
    const ts = rows.map((p) => p.mergedAt).sort()
    return ts[0].slice(0, 10) === ts.at(-1)!.slice(0, 10) ? fmtDate(ts[0]) : `${fmtDate(ts[0])} → ${fmtDate(ts.at(-1)!)}`
  }, [rows])
  const dirty = !!(filter.q || filter.owner || filter.repo || filter.sort !== 'newest')

  const go = (p: number) => {
    setPage(Math.max(1, Math.min(pages, p)))
    scrollToId('arch-results', -110)
  }

  // arrow keys page through results (unless the user is typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input,textarea,[role=listbox],[role=dialog]')) return
      if (e.key === 'ArrowRight') go(cur + 1)
      if (e.key === 'ArrowLeft') go(cur - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, pages])

  // entrance
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.from('.arch-head > *', { opacity: 0, y: 40, duration: 1, stagger: 0.09, ease: 'expo.out', delay: 0.15 })
      gsap.from('.arch-stat', { opacity: 0, y: 24, scale: 0.96, duration: 0.8, stagger: 0.07, ease: 'power3.out', delay: 0.4 })
      gsap.from('.tools', { opacity: 0, y: 24, duration: 0.9, ease: 'power3.out', delay: 0.55 })
    }, root)
    return () => ctx.revert()
  }, [])

  // rows cascade in whenever the visible page changes
  const sliceKey = `${cur}|${resetKey}|${grouped}|${slice.length}`
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.from('.pr-row, .day-head', { opacity: 0, y: 22, duration: 0.6, stagger: 0.028, ease: 'power3.out', clearProps: 'opacity,transform' })
    }, el)
    return () => ctx.revert()
  }, [sliceKey])

  const chips: { k: string; label: string; clear: () => void }[] = []
  if (filter.q) chips.push({ k: 'q', label: `“${filter.q}”`, clear: () => setFilter({ ...filter, q: '' }) })
  if (filter.owner) chips.push({ k: 'owner', label: `owner · ${filter.owner}`, clear: () => setFilter({ ...filter, owner: '', repo: '' }) })
  if (filter.repo) chips.push({ k: 'repo', label: `repo · ${filter.repo}`, clear: () => setFilter({ ...filter, repo: '' }) })

  return (
    <section className="archive section" ref={root}>
      <div className="arch-head">
        <button type="button" className="back-link mono" onClick={onHome}>
          <span aria-hidden="true">←</span> Overview
        </button>
        <h1 className="arch-title">
          All <em>contributions</em>
        </h1>
        <p className="chapter-lead">
          Every public, merged pull request into a repository {profile.isOwner ? 'I don’t' : 'they don’t'} own — {prs.length} and counting. Filter, group by day and page through the full record.
        </p>
      </div>

      <div className="arch-stats">
        <div className="arch-stat glass">
          <b>{rows.length}</b>
          <span className="mono">{dirty ? 'matching PRs' : 'merged PRs'}</span>
        </div>
        <div className="arch-stat glass">
          <b>{distinctRepos}</b>
          <span className="mono">repositories</span>
        </div>
        <div className="arch-stat glass wide">
          <b className="arch-span">{span}</b>
          <span className="mono">merge dates · {tzLabel()}</span>
        </div>
      </div>

      <div className="tools tools-arch glass">
        <label className="field grow">
          <span className="mono">Search</span>
          <span className="searchbox">
            <Icon name="search" size={16} />
            <input
              value={filter.q}
              onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              type="search"
              placeholder="Title, repository, label or #number"
              autoComplete="off"
              spellCheck={false}
              aria-label="Search contributions"
            />
          </span>
        </label>
        <Select label="Owner" placeholder="All owners" searchable options={owners} value={filter.owner} onChange={(v) => setFilter({ ...filter, owner: v, repo: '' })} />
        <Select
          label="Repository"
          placeholder="All repositories"
          searchable
          options={repos}
          value={filter.repo}
          onChange={(v) => setFilter({ ...filter, repo: v, owner: v ? v.split('/')[0] : filter.owner })}
        />
        <Select label="Sort" placeholder="Latest merged" options={sorts.slice(1)} value={filter.sort === 'newest' ? '' : filter.sort} onChange={(v) => setFilter({ ...filter, sort: (v || 'newest') as Filter['sort'] })} />
        <Select label="Page size" placeholder="20 per page" options={sizes.filter((o) => o.value !== '20')} value={size === 20 ? '' : String(size)} onChange={(v) => setSize(Number(v) || 20)} />
        <button type="button" className="btn btn-ghost small" onClick={() => setFilter(EMPTY_FILTER)} disabled={!dirty}>
          Reset
        </button>
      </div>

      <div className="arch-bar">
        <div className="fchips">
          {chips.map((c) => (
            <button key={c.k} type="button" className="fchip mono" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>
              {c.label} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
        <label className={`toggle mono ${grouped ? 'on' : ''} ${filter.sort === 'repo' || filter.sort === 'title' ? 'disabled' : ''}`}>
          <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} disabled={filter.sort === 'repo' || filter.sort === 'title'} />
          <i aria-hidden="true" />
          Group by day
        </label>
      </div>

      <div className="panel glass results" id="arch-results">
        <div className="panel-head">
          <span className="merged-pill mono" role="status" aria-live="polite">
            <Icon name="merge" size={15} />
            {rows.length ? `${(cur - 1) * size + 1}–${Math.min(cur * size, rows.length)} of ${rows.length}` : '0 results'}
          </span>
          <span className="readout mono">
            page <b>{cur}</b> / {pages} · use <kbd>←</kbd> <kbd>→</kbd>
          </span>
        </div>

        <div ref={listRef}>
          {rows.length === 0 && (
            <div className="empty">
              <p className="mono">No merged PRs match these filters.</p>
              <button type="button" className="btn btn-ghost small" onClick={() => setFilter(EMPTY_FILTER)}>
                Clear filters
              </button>
            </div>
          )}
          {segments.map((seg) => (
            <div key={seg.key} className="day-group">
              {grouped && (
                <div className="day-head mono">
                  <span>{seg.label}</span>
                  <i />
                  <b>{dayCounts.get(seg.key)} merged</b>
                </div>
              )}
              <ul className="pr-list">
                {seg.items.map((p) => (
                  <PRRow key={p.url} p={p} now={now} />
                ))}
              </ul>
            </div>
          ))}
        </div>

        {rows.length > 0 && (
          <nav className="pager" aria-label="Pagination">
            <button type="button" className="btn btn-ghost small" disabled={cur <= 1} onClick={() => go(cur - 1)}>
              ← Prev
            </button>
            <div className="pages">
              {pageList(cur, pages).map((n, i) =>
                n === '…' ? (
                  <span key={`g${i}`} className="gap mono">
                    …
                  </span>
                ) : (
                  <button key={n} type="button" className={`pg mono ${n === cur ? 'on' : ''}`} aria-current={n === cur ? 'page' : undefined} onClick={() => go(n)}>
                    {n}
                  </button>
                ),
              )}
            </div>
            <button type="button" className="btn btn-ghost small" disabled={cur >= pages} onClick={() => go(cur + 1)}>
              Next →
            </button>
          </nav>
        )}
      </div>
    </section>
  )
}
