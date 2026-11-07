import { useEffect, useRef, useState } from 'react'
import type { Dataset } from '../types'
import { AuthError, getUser, NotFoundError, rates, searchAll } from '../lib/github'
import { readData, writeData } from '../lib/cache'
import { OWNER, ownerProfile, viewerHref, viewerProfile, validHandle, type Profile } from '../lib/profile'
import { getToken, onTokenChange } from '../lib/token'
import { TokenSheet } from './TokenSheet'
import { ViewAnother } from './ViewAnother'

type Stage =
  | { k: 'profile' }
  | { k: 'search'; loaded: number; total: number }
  | { k: 'error'; title: string; body: string; retry?: boolean }
  | { k: 'empty'; profile: Profile }

/**
 * Loads a whole portfolio from GitHub in the browser: profile, then every merged PR
 * (paged, split by date past GitHub's 1,000-result cap), waiting out rate limits on the way.
 * Uses the browser cache when it is fresh.
 */
export function Loader({ handle, onReady }: { handle: string | null; onReady: (p: Profile, d: Dataset) => void }) {
  const target = handle ?? OWNER.github
  const isOwner = !handle
  const [stage, setStage] = useState<Stage>({ k: 'profile' })
  const [name, setName] = useState<string | null>(null)
  const [waitUntil, setWaitUntil] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [sheet, setSheet] = useState(false)
  const [run, setRun] = useState(0)
  const [hasToken, setHasToken] = useState(!!getToken())
  const done = useRef(onReady)
  done.current = onReady

  useEffect(() => onTokenChange(() => {
    setHasToken(!!getToken())
    setRun((r) => r + 1) // a new token: restart with the higher limits
  }), [])

  useEffect(() => {
    if (!waitUntil) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [waitUntil])

  useEffect(() => {
    const ctrl = new AbortController()
    const opts = {
      signal: ctrl.signal,
      onWait: (u: number | null) => setWaitUntil(u),
    }
    ;(async () => {
      if (!validHandle(target)) {
        setStage({ k: 'error', title: 'That is not a GitHub username', body: `“${target}” can't be a GitHub username. They use letters, numbers and single hyphens, up to 39 characters.` })
        return
      }
      setStage({ k: 'profile' })
      let profile: Profile
      if (isOwner) {
        profile = ownerProfile()
      } else {
        const u = await getUser(target, opts)
        if (u.type === 'Organization') {
          setStage({ k: 'error', title: `${u.login} is an organization`, body: 'This site shows the pull requests a person has had merged. Try the username of someone who contributes.' })
          return
        }
        profile = viewerProfile(u.login, u.name)
      }
      setName(profile.name)

      const cached = readData(profile.handle, profile.query)
      if (cached) {
        done.current(profile, { query: profile.query, prs: cached.prs, generatedAt: new Date(cached.fetchedAt).toISOString(), source: 'cache' })
        return
      }

      setStage({ k: 'search', loaded: 0, total: 0 })
      const prs = await searchAll(profile.query, { ...opts, onProgress: (loaded, total) => setStage({ k: 'search', loaded, total }) })
      if (!prs.length) {
        setStage({ k: 'empty', profile })
        return
      }
      writeData(profile.handle, profile.query, prs)
      done.current(profile, { query: profile.query, prs, generatedAt: new Date().toISOString(), source: 'live' })
    })().catch((e: unknown) => {
      if (ctrl.signal.aborted) return
      if (e instanceof NotFoundError) setStage({ k: 'error', title: `No GitHub user named ${target}`, body: 'Check the spelling, or try someone else.' })
      else if (e instanceof AuthError) setStage({ k: 'error', title: 'GitHub rejected your token', body: 'It may have expired or been revoked. Remove it or paste a new one.', retry: true })
      else setStage({ k: 'error', title: 'Could not reach GitHub', body: 'Check your connection and try again.', retry: true })
    })
    return () => ctrl.abort()
  }, [target, isOwner, run])

  const secs = waitUntil ? Math.max(0, Math.ceil((waitUntil - now) / 1000)) : 0
  const search = rates.search
  const pct = stage.k === 'search' && stage.total ? Math.min(100, (stage.loaded / stage.total) * 100) : 0

  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader-card">
        <div className="loader-cmd mono">
          <span className="loader-prompt">$</span> gh search prs --author {target} --merged
        </div>

        {(stage.k === 'profile' || stage.k === 'search') && (
          <>
            <ul className="loader-steps mono">
              <li className={stage.k === 'profile' ? 'run' : 'ok'}>
                <span>Profile</span>
                <b>{name ?? `@${target}`}</b>
              </li>
              <li className={stage.k === 'search' ? 'run' : ''}>
                <span>Merged PRs</span>
                <b>{stage.k === 'search' && stage.total ? `${stage.loaded} of ${stage.total}` : '…'}</b>
              </li>
            </ul>
            <div className="loader-bar" aria-hidden="true">
              <i style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
            {waitUntil ? (
              <p className="loader-note">
                GitHub's limit for visitors without a token is reached. Resuming in <b className="mono">{secs}s</b>.
                {!hasToken && (
                  <>
                    {' '}
                    <button type="button" className="inline-link" onClick={() => setSheet(true)}>
                      Add a token
                    </button>{' '}
                    to go faster.
                  </>
                )}
              </p>
            ) : (
              <p className="loader-note muted">
                Public data straight from GitHub{search ? ` · ${search.remaining} searches left this minute` : ''}. Nothing is stored outside this browser.
              </p>
            )}
          </>
        )}

        {stage.k === 'empty' && (
          <div className="loader-msg">
            <h1>No merged pull requests yet</h1>
            <p>{stage.profile.name} has no public pull requests merged into other people's repositories so far.</p>
            <ViewAnother />
          </div>
        )}

        {stage.k === 'error' && (
          <div className="loader-msg">
            <h1>{stage.title}</h1>
            <p>{stage.body}</p>
            <div className="loader-actions">
              {stage.retry && (
                <button type="button" className="btn btn-primary small" onClick={() => setRun((r) => r + 1)}>
                  Try again
                </button>
              )}
              {hasToken && (
                <button type="button" className="btn btn-ghost small" onClick={() => setSheet(true)}>
                  Manage token
                </button>
              )}
            </div>
            <ViewAnother />
          </div>
        )}

        {!isOwner && (
          <a className="loader-back mono" href={viewerHref(null)}>
            ← {OWNER.name}'s portfolio
          </a>
        )}
      </div>
      <TokenSheet open={sheet} onClose={() => setSheet(false)} />
    </div>
  )
}
