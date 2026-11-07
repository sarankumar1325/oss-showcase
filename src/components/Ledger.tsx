import { useState, type PointerEvent } from 'react'
import { motion } from 'motion/react'
import { ownerLabel, type Derived } from '../lib/derive'
import { Chapter, EASE, Icon, OwnerAvatar, Tilt } from './ui'

const spot = (e: PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`)
}

export function Ledger({ d, onRepo, onOwner }: { d: Derived; onRepo: (repo: string) => void; onOwner: (owner: string) => void }) {
  const [all, setAll] = useState(false)
  const topRepos = d.repoGroups.slice(0, 6)
  const topOwners = d.ownerGroups.slice(0, 10)
  const maxRepo = d.repoGroups[0]?.[1] ?? 1
  const maxOwner = d.ownerGroups[0]?.[1] ?? 1

  return (
    <section id="ledger" className="section ledger">
      <Chapter
        n="05"
        kicker="Ledger"
        title={
          <>
            Where the work <em>lands</em>
          </>
        }
        lead={`${d.repoGroups.length} repositories across ${d.ownerGroups.length} owners — ${d.orgCount} organizations and ${d.individualCount} individual maintainers. Counts measure accepted contributions, not popularity.`}
      />

      <div className="repo-grid">
        {topRepos.map(([name, n], i) => {
          const kind = d.repoOwnerType.get(name)
          const [owner, repo] = name.split('/')
          return (
            <Tilt key={name} max={6}>
            <motion.article
              className="repo-card spotlight"
              onPointerMove={spot}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-8% 0px' }}
              transition={{ duration: 1, ease: EASE, delay: (i % 3) * 0.08 }}
            >
              <div className="repo-top">
                <OwnerAvatar owner={owner} size={38} />
                <span className="repo-rank mono">#{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="repo-name">
                <span className="mono">{owner}/</span>
                <a href={`https://github.com/${name}`} target="_blank" rel="noopener noreferrer">
                  {repo}
                </a>
              </h3>
              <div className="repo-count">
                <strong>{n}</strong>
                <span className="mono">merged PRs</span>
              </div>
              <div className="meter" aria-hidden="true">
                <motion.i initial={{ scaleX: 0 }} whileInView={{ scaleX: n / maxRepo }} viewport={{ once: true }} transition={{ duration: 1.6, ease: EASE, delay: 0.2 }} />
              </div>
              <div className="repo-foot">
                <span className="mono muted">{ownerLabel(kind, true)}</span>
                <button type="button" className="link-btn mono" onClick={() => onRepo(name)}>
                  View merges <Icon name="arrow" size={12} />
                </button>
              </div>
            </motion.article>
            </Tilt>
          )
        })}
      </div>

      <div className="ledger-split">
        <div className="panel glass owners">
          <div className="panel-head">
            <span className="panel-title mono">Top owners</span>
            <span className="readout mono">by merged PR count</span>
          </div>
          <ul>
            {topOwners.map(([name, n]) => (
              <li key={name}>
                <button type="button" className="owner-row" onClick={() => onOwner(name)}>
                  <OwnerAvatar owner={name} size={30} />
                  <span className="owner-name">
                    {name}
                    <small className="mono">{ownerLabel(d.ownerType.get(name))}</small>
                  </span>
                  <span className="owner-bar" aria-hidden="true">
                    <motion.i initial={{ scaleX: 0 }} whileInView={{ scaleX: n / maxOwner }} viewport={{ once: true }} transition={{ duration: 1.4, ease: EASE }} />
                  </span>
                  <b className="mono">{n}</b>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel glass all-repos">
          <div className="panel-head">
            <span className="panel-title mono">All {d.repoGroups.length} repositories</span>
            <button type="button" className="chip-btn mono" onClick={() => setAll((a) => !a)} aria-expanded={all}>
              {all ? 'Collapse' : 'Expand'}
            </button>
          </div>
          <div className={`chips ${all ? 'open' : ''}`} data-lenis-prevent={all ? '' : undefined}>
            {d.repoGroups.map(([name, n]) => (
              <button key={name} type="button" className="chip mono" onClick={() => onRepo(name)} title={`${n} merged ${n === 1 ? 'PR' : 'PRs'}`}>
                {name}
                <sup>{n}</sup>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
