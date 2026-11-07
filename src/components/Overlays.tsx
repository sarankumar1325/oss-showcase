import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { LiveEvent, PR } from '../types'
import { SECTIONS } from './Nav'
import { EASE, Icon } from './ui'
import { OWNER, useProfile, validHandle, viewerHref } from '../lib/profile'

/* ---------------------------------------------------------------- toasts */

interface Toast {
  id: number
  kind: 'merge' | 'catchup'
  pr?: PR
  count?: number
}

export function Toasts({ subscribe }: { subscribe: (fn: (e: LiveEvent) => void) => () => void }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const id = useRef(0)
  const quiet = useRef(0)
  const quietTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const push = (t: Omit<Toast, 'id'>) => {
      const n = ++id.current
      setToasts((prev) => [{ ...t, id: n }, ...prev].slice(0, 3))
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== n)), 11_000)
    }
    const off = subscribe((e) => {
      if (e.silent) {
        quiet.current++
        clearTimeout(quietTimer.current)
        quietTimer.current = setTimeout(() => {
          push({ kind: 'catchup', count: quiet.current })
          quiet.current = 0
        }, 350)
      } else {
        push({ kind: 'merge', pr: e.pr })
      }
    })
    return () => {
      off()
      clearTimeout(quietTimer.current)
    }
  }, [subscribe])

  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className="toast glass"
            initial={{ opacity: 0, x: 60, scale: 0.94, filter: 'blur(8px)' }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            {t.kind === 'merge' && t.pr ? (
              <a href={t.pr.url} target="_blank" rel="noopener noreferrer">
                <span className="toast-tag mono">
                  <i className="live-dot" /> New merge
                </span>
                <b className="mono">
                  {t.pr.owner}/{t.pr.repo} #{t.pr.number}
                </b>
                <span>{t.pr.title}</span>
              </a>
            ) : (
              <div>
                <span className="toast-tag mono">
                  <i className="live-dot" /> Synced with GitHub
                </span>
                <span>
                  Caught up — {t.count} new {t.count === 1 ? 'merge' : 'merges'} since the last snapshot.
                </span>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------- command palette */

export function CommandPalette({ open, onClose, prs, onGo, onSearchArchive }: { open: boolean; onClose: () => void; prs: PR[]; onGo: (target: string) => void; onSearchArchive: (q: string) => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const profile = useProfile()

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      setTimeout(() => input.current?.focus(), 40)
    }
  }, [open])

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const jumps = SECTIONS.filter((s) => !needle || s.label.toLowerCase().includes(needle) || s.id.includes(needle)).map((s) => ({
      kind: 'jump' as const,
      key: 'j-' + s.id,
      title: `Go to ${s.label}`,
      sub: 'Section',
      run: () => onGo(s.id),
    }))
    jumps.push({ kind: 'jump' as const, key: 'j-archive', title: 'Open the full archive', sub: 'Page', run: () => onGo('archive') })
    const found = needle
      ? prs
          .filter((p) => `${p.title} ${p.owner}/${p.repo} #${p.number}`.toLowerCase().includes(needle))
          .slice(0, 8)
          .map((p) => ({
            kind: 'pr' as const,
            key: p.url,
            title: p.title,
            sub: `${p.owner}/${p.repo} · #${p.number}`,
            run: () => window.open(p.url, '_blank', 'noopener,noreferrer'),
          }))
      : []
    const all = needle
      ? [
          ...found,
          ...(() => {
            const h = q.trim().replace(/^@/, '')
            return OWNER.allowViewer && validHandle(h) && h.toLowerCase() !== profile.handle.toLowerCase()
              ? [{ kind: 'user' as const, key: 'u-' + h, title: `See @${h}'s open-source work`, sub: 'GitHub user', run: () => (location.href = viewerHref(h)) }]
              : []
          })(),
          {
            kind: 'jump' as const,
            key: 'j-all',
            title: `See every match for “${q.trim()}” in the archive`,
            sub: 'Archive',
            run: () => onSearchArchive(q.trim()),
          },
          ...jumps,
        ]
      : jumps
    return all
  }, [q, prs, onGo, onSearchArchive, profile.handle])

  const choose = (i: number) => {
    const it = items[i]
    if (!it) return
    onClose()
    setTimeout(it.run, 60)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(items.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(sel)
    } else if (e.key === 'Escape') onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={onClose}>
          <motion.div
            className="palette glass"
            role="dialog"
            aria-label="Search"
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={onKey}
          >
            <div className="palette-input">
              <Icon name="search" size={18} />
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setSel(0)
                }}
                placeholder="Search merged PRs, a section, or a GitHub username"
                spellCheck={false}
                autoComplete="off"
              />
              <kbd className="mono">esc</kbd>
            </div>
            <ul data-lenis-prevent>
              {items.length === 0 && <li className="palette-empty mono">No results</li>}
              {items.map((it, i) => (
                <li key={it.key}>
                  <button type="button" className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => choose(i)}>
                    <span className="palette-ico">
                      <Icon name={it.kind === 'pr' ? 'merge' : it.kind === 'user' ? 'users' : 'arrow'} size={15} />
                    </span>
                    <span className="palette-t">{it.title}</span>
                    <span className="palette-s mono">{it.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
