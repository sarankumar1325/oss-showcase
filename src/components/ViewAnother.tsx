import { useState } from 'react'
import { OWNER, viewerHref, validHandle } from '../lib/profile'

/** "See anyone's work": a username box that opens ?u=<name> on this same site. */
export function ViewAnother({ label = 'See anyone’s open-source work' }: { label?: string }) {
  const [v, setV] = useState('')
  const [bad, setBad] = useState(false)
  if (!OWNER.allowViewer) return null
  const go = () => {
    const h = v.trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').replace(/\/.*$/, '')
    if (!validHandle(h)) {
      setBad(true)
      return
    }
    location.href = viewerHref(h)
  }
  return (
    <form
      className="view-another"
      onSubmit={(e) => {
        e.preventDefault()
        go()
      }}
    >
      <label className="mono" htmlFor="view-another">
        {label}
      </label>
      <div className={`view-another-row ${bad ? 'bad' : ''}`}>
        <span className="mono" aria-hidden="true">
          github.com/
        </span>
        <input
          id="view-another"
          className="mono"
          value={v}
          onChange={(e) => {
            setV(e.target.value)
            setBad(false)
          }}
          placeholder="username"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
        />
        <button type="submit" className="btn btn-primary small" disabled={!v.trim()}>
          View
        </button>
      </div>
    </form>
  )
}
