import type { PR } from '../types'
import type { Derived } from '../lib/derive'
import { Chapter, Icon, Magnetic } from './ui'
import { PRRow } from './PRRow'

export function ArchiveTeaser({ prs, d, now, onOpen }: { prs: PR[]; d: Derived; now: number; onOpen: () => void }) {
  const latest = d.newest.slice(0, 5)
  return (
    <section id="explorer" className="section explorer">
      <Chapter
        n="06"
        kicker="Archive"
        title={
          <>
            Every merge, <em>on record</em>
          </>
        }
        lead={`The complete public record — ${prs.length} merged pull requests. Search, filter, group by day and page through every one on its own page.`}
      />
      <div className="panel glass teaser">
        <div className="panel-head">
          <span className="panel-title mono">Latest five</span>
          <span className="readout mono">of {prs.length} merged PRs</span>
        </div>
        <ul className="pr-list">
          {latest.map((p) => (
            <PRRow key={p.url} p={p} now={now} />
          ))}
        </ul>
        <div className="teaser-cta">
          <Magnetic strength={0.2}>
            <button type="button" className="btn btn-primary" onClick={onOpen}>
              Browse all {prs.length} contributions <Icon name="arrow" size={15} />
            </button>
          </Magnetic>
          <span className="mono muted">search · filter · paginate</span>
        </div>
      </div>
    </section>
  )
}
