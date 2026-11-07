import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { onRate, rates, type RateInfo } from '../lib/github'
import { CREATE_TOKEN_URL, getToken, isRemembered, onTokenChange, setToken } from '../lib/token'
import { EASE } from './ui'

const mask = (t: string) => (t.length > 12 ? `${t.slice(0, 8)}…${t.slice(-4)}` : '••••')

/**
 * Optional GitHub token, for higher rate limits only. Explains exactly what it is for,
 * links to a prefilled fine-grained token with no permissions, and keeps it in this browser.
 */
export function TokenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState('')
  const [remember, setRemember] = useState(isRemembered())
  const [current, setCurrent] = useState(getToken())
  const [, setTick] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => onTokenChange(() => setCurrent(getToken())), [])
  useEffect(() => onRate(() => setTick((t) => t + 1)), [])
  useEffect(() => {
    if (!open) return
    setValue('')
    setRemember(isRemembered())
    const t = setTimeout(() => input.current?.focus(), 60)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const looksValid = /^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(value.trim())
  const save = () => {
    if (!looksValid) return
    setToken(value.trim(), remember)
    onClose()
  }

  const row = (r: RateInfo | undefined, label: string) =>
    r ? (
      <li>
        <span>{label}</span>
        <b className="mono">
          {r.remaining} / {r.limit}
        </b>
      </li>
    ) : null

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={onClose}>
          <motion.div
            className="sheet glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: EASE }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="sheet-title">GitHub token</h2>
            <p>
              Optional. Everything here is public, so the site works without one. A token only raises GitHub's limits, from 10 to 30 searches a minute and from 60 to 5,000 other
              requests an hour.
            </p>
            <ol className="sheet-steps">
              <li>
                <a className="inline-link" href={CREATE_TOKEN_URL} target="_blank" rel="noopener noreferrer">
                  Create a fine-grained token
                </a>{' '}
                (opens prefilled).
              </li>
              <li>Keep repository access on public repositories and leave every permission unselected.</li>
              <li>Paste it below. It is kept in this browser and sent only to api.github.com.</li>
            </ol>

            {current ? (
              <div className="sheet-current">
                <span className="mono">{mask(current)}</span>
                <span className="muted">{isRemembered() ? 'remembered on this device' : 'for this session'}</span>
                <button type="button" className="btn btn-ghost small" onClick={() => setToken(null)}>
                  Remove
                </button>
              </div>
            ) : null}

            <form
              className="sheet-form"
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              <input
                ref={input}
                type="password"
                className="sheet-input mono"
                placeholder="github_pat_…"
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-label="GitHub token"
              />
              <label className="sheet-remember">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember on this device
              </label>
              <div className="sheet-actions">
                <button type="button" className="btn btn-ghost small" onClick={onClose}>
                  Close
                </button>
                <button type="submit" className="btn btn-primary small" disabled={!looksValid}>
                  Save token
                </button>
              </div>
            </form>

            {(rates.search || rates.core) && (
              <ul className="sheet-rates">
                {row(rates.search, 'Searches left this minute')}
                {row(rates.core, 'Requests left this hour')}
              </ul>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
