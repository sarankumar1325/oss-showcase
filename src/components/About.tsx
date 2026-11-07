import { motion } from 'motion/react'
import type { Dataset } from '../types'
import type { Derived } from '../lib/derive'
import { fmtFull, timeZone, tzLabel } from '../lib/format'
import { OWNER, useProfile, viewerHref } from '../lib/profile'
import { Chapter, EASE, Me, Tilt } from './ui'
import { ViewAnother } from './ViewAnother'
import { ShareBar } from './ShareBar'

function liveCopy(dataset: Dataset, replay: boolean) {
  if (replay) return { t: 'Replay mode', p: 'You are watching the four most recent real merges replay one by one so the live experience can be previewed offline.' }
  const at = dataset.generatedAt ? fmtFull(dataset.generatedAt) : null
  if (dataset.source === 'snapshot')
    return { t: 'Snapshot + polling', p: `The page ships with a snapshot generated ${at} and asks GitHub for newer merges every minute. If GitHub is unreachable or rate-limited, the snapshot simply stays on screen.` }
  if (dataset.source === 'cache')
    return { t: 'Cached + polling', p: `Loaded from this browser's cache (fetched ${at}) and kept current by asking GitHub for newer merges every minute.` }
  return { t: 'Loaded live', p: 'Fetched from GitHub in this browser just now, then kept current every minute. A copy stays in this browser so the next visit opens instantly.' }
}

export function About({ d, replay, dataset }: { d: Derived; replay: boolean; dataset: Dataset }) {
  const profile = useProfile()
  const live = liveCopy(dataset, replay)
  const tz = timeZone().replace(/_/g, ' ')
  const cards = [
    { k: 'Source', t: 'GitHub search, verbatim', p: 'Every record comes from the public GitHub search index using the query below. Merge dates are the real mergedAt timestamps, never opened or updated dates.' },
    {
      k: 'Scope',
      t: 'Public · merged · external',
      p: `Only accepted pull requests authored by ${profile.handle} in repositories owned by someone else. ${d.orgCount} organizations and ${d.individualCount} individual owners${d.unknownCount ? `, with ${d.unknownCount} more still being looked up` : ''}.`,
    },
    { k: 'Time', t: `${tz} (${tzLabel()})`, p: `Dates and daily buckets use ${timeZone()}. Empty days have zero recorded merges; no activity is invented or smoothed.` },
    { k: 'Live', ...live },
  ]

  return (
    <section id="about" className="section about">
      <Chapter
        n="07"
        kicker="About the data"
        title={
          <>
            Backed by <em>public records</em>
          </>
        }
        lead="A showcase of accepted open-source contributions. Counts measure accepted work, not popularity or business impact."
      />
      <div className="about-grid">
        {cards.map((c, i) => (
          <Tilt key={c.k} max={5}>
            <motion.div
              className="about-card glass"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-8% 0px' }}
              transition={{ duration: 1, ease: EASE, delay: i * 0.08 }}
            >
              <span className="mono about-k">{c.k}</span>
              <h3>{c.t}</h3>
              <p>{c.p}</p>
            </motion.div>
          </Tilt>
        ))}
      </div>
      <div className="query glass">
        <span className="mono query-k">Query</span>
        <code className="mono">{dataset.query}</code>
      </div>

      <Footer />
    </section>
  )
}

export function Footer() {
  const profile = useProfile()
  return (
    <footer className="footer">
      <div className="footer-id">
        <Me size={36} className="footer-me" />
        <p>
          {profile.name} ·{' '}
          <a href={`https://github.com/${profile.handle}`} target="_blank" rel="noopener noreferrer">
            github.com/{profile.handle}
          </a>
          {!profile.isOwner && (
            <>
              <br />
              <a className="footer-back" href={viewerHref(null)}>
                ← Back to {OWNER.name}'s portfolio
              </a>
            </>
          )}
        </p>
        <ShareBar />
      </div>
      <ViewAnother label={profile.isOwner ? 'See anyone’s open-source work' : 'See someone else’s'} />
    </footer>
  )
}
