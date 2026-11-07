import { useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Derived } from '../lib/derive'
import type { SyncStatus } from '../types'
import { STATUS } from '../lib/status'
import { useNow } from '../lib/hooks'
import { ago, dayKey, fmtFull } from '../lib/format'
import { Chapter, EASE, Icon, OwnerAvatar } from './ui'

interface Props {
  d: Derived
  fresh: ReadonlySet<string>
  status: SyncStatus
  syncing: boolean
  lastSync: number | null
  nextSync: number | null
  syncNow: () => void
  replay: boolean
  limitedUntil: number | null
  tokenRejected: boolean
  hasToken: boolean
  onToken: () => void
}

export function Feed({ d, fresh, status, syncing, lastSync, nextSync, syncNow, replay, limitedUntil, tokenRejected, hasToken, onToken }: Props) {
  const now = useNow(1000)
  const meta = STATUS[syncing && !replay ? 'syncing' : status]
  const latest = d.newest[0]
  const list = d.newest.slice(0, 8)

  const stats = useMemo(() => {
    const today = dayKey(now)
    const month = today.slice(0, 7)
    const weekAgo = now - 7 * 86_400_000
    let t = 0
    let w = 0
    let m = 0
    for (const p of d.newest) {
      const k = dayKey(p.mergedAt)
      if (k === today) t++
      if (k.startsWith(month)) m++
      if (new Date(p.mergedAt).getTime() >= weekAgo) w++
    }
    return { t, w, m }
  }, [d.newest, now])

  const countdown = nextSync ? Math.max(0, Math.round((nextSync - now) / 1000)) : null

  return (
    <section id="feed" className="section feed">
      <Chapter
        n="04"
        kicker="Live feed"
        title={
          <>
            Merged <em>right now</em>
          </>
        }
        lead="This page asks GitHub for fresh merges every minute. When one lands, it appears here, ripples across the orbit, and lights the backdrop."
      />

      <div className="feed-grid">
        <aside className="feed-card glass">
          <div className={`status tone-${meta.tone} big`}>
            <i className="status-dot" />
            <b className="mono">{meta.label}</b>
          </div>
          <div className="feed-ago">
            <span className="mono feed-ago-k">Last merge</span>
            <strong>{latest ? ago(latest.mergedAt, now) : '—'}</strong>
            {latest && <span className="feed-ago-when mono">{fmtFull(latest.mergedAt)}</span>}
          </div>

          <div className="feed-stats">
            <div>
              <b>{stats.t}</b>
              <span className="mono">today</span>
            </div>
            <div>
              <b>{stats.w}</b>
              <span className="mono">7 days</span>
            </div>
            <div>
              <b>{stats.m}</b>
              <span className="mono">this month</span>
            </div>
          </div>

          <div className="feed-sync">
            <div className="sync-bar" aria-hidden="true">
              <i
                key={nextSync ?? 0}
                style={{ animationDuration: `${60}s`, animationPlayState: status === 'live' && !syncing ? 'running' : 'paused' }}
                className={status === 'live' ? 'run' : ''}
              />
            </div>
            <div className="feed-sync-row mono">
              <span>{replay ? 'Replaying real merges' : lastSync ? `Synced ${ago(lastSync, now)}` : meta.hint}</span>
              {!replay && countdown !== null && status === 'live' && <span>next in {countdown}s</span>}
            </div>
            <button type="button" className="btn btn-ghost small" onClick={syncNow} disabled={replay || syncing}>
              <Icon name="bolt" size={14} /> {syncing ? 'Checking…' : 'Check GitHub now'}
            </button>
            {tokenRejected ? (
              <p className="feed-note">
                GitHub rejected your token.{' '}
                <button type="button" className="inline-link" onClick={onToken}>
                  Manage token
                </button>
              </p>
            ) : status === 'limited' ? (
              <p className="feed-note">
                GitHub's rate limit is reached{limitedUntil ? `; resuming in ${Math.max(0, Math.ceil((limitedUntil - now) / 1000))}s` : ''}.
                {!hasToken && (
                  <>
                    {' '}
                    <button type="button" className="inline-link" onClick={onToken}>
                      Add a token
                    </button>{' '}
                    for higher limits.
                  </>
                )}
              </p>
            ) : (
              <p className="feed-note">
                {meta.hint}.{' '}
                <button type="button" className="inline-link" onClick={onToken}>
                  {hasToken ? 'Token settings' : 'Optional token'}
                </button>
              </p>
            )}
          </div>
        </aside>

        <ol className="feed-list">
          <AnimatePresence initial={false} mode="popLayout">
            {list.map((p) => {
              const isNew = fresh.has(p.url)
              return (
                <motion.li
                  key={p.url}
                  layout="position"
                  initial={{ opacity: 0, y: -40, scale: 0.97, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.9, ease: EASE }}
                  className={`feed-item glass ${isNew ? 'is-new' : ''}`}
                >
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    <OwnerAvatar owner={p.owner} size={40} />
                    <span className="feed-body">
                      <span className="feed-repo mono">
                        {p.owner}/{p.repo} <em>#{p.number}</em>
                        {isNew && <b className="new-tag mono">NEW</b>}
                      </span>
                      <span className="feed-title">{p.title}</span>
                      {p.labels.length > 0 && (
                        <span className="feed-labels">
                          {p.labels.slice(0, 3).map((l) => (
                            <span key={l} className="label mono">
                              {l}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="feed-when mono">
                      <Icon name="merge" size={13} /> {ago(p.mergedAt, now)}
                    </span>
                  </a>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ol>
      </div>
    </section>
  )
}
