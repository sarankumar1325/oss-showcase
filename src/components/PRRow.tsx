import type { PR } from '../types'
import { ago, fmtDate } from '../lib/format'
import { Icon } from './ui'

export function PRRow({ p, now }: { p: PR; now: number }) {
  return (
    <li className="pr-row">
      <a href={p.url} target="_blank" rel="noopener noreferrer">
        <span className="pr-icon">
          <Icon name="merge" size={16} />
        </span>
        <span className="pr-main">
          <span className="pr-title">{p.title}</span>
          <span className="pr-meta mono">
            {p.owner}/{p.repo} · #{p.number}
            {p.labels.slice(0, 2).map((l) => (
              <span key={l} className="label">
                {l}
              </span>
            ))}
          </span>
        </span>
        <span className="pr-date mono">
          {fmtDate(p.mergedAt)}
          <small>{ago(p.mergedAt, now)}</small>
        </span>
        <span className="pr-go" aria-hidden="true">
          <Icon name="arrow" size={15} />
        </span>
      </a>
    </li>
  )
}
