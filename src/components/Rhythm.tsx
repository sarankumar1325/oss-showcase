import { lazy, Suspense, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView } from 'motion/react'
import type { Derived } from '../lib/derive'
import { dayKey, fmtKeyDate, fmtKeyShort, pad2, timeZone, tzLabel } from '../lib/format'
import { Chapter, CountUp, EASE, Tilt } from './ui'
import type { Bar3D, Label3D } from './Bars3D'

const Bars3D = lazy(() => import('./Bars3D'))
type View = '2d' | '3d'
const VIEW_KEY = 'oss:rhythm-view'
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === '3d' ? '3d' : '2d'
  } catch {
    return '2d'
  }
}
const PARTS = [
  { k: 'Night', from: 0, to: 6 },
  { k: 'Morning', from: 6, to: 12 },
  { k: 'Afternoon', from: 12, to: 18 },
  { k: 'Evening', from: 18, to: 24 },
]

const DAY = 86_400_000
const parse = (k: string) => new Date(k + 'T00:00:00Z').getTime()
const label = (k: string) => fmtKeyShort(k)
const plural = (n: number) => `${n} merged ${n === 1 ? 'PR' : 'PRs'}`

function longestStreak(keys: string[]) {
  let best = 0
  let run = 0
  let prev = 0
  for (const k of keys) {
    const t = parse(k)
    run = prev && t - prev === DAY ? run + 1 : 1
    best = Math.max(best, run)
    prev = t
  }
  return best
}

export function Rhythm({ d, now }: { d: Derived; now: number }) {
  const barsRef = useRef<HTMLDivElement>(null)
  const heatRef = useRef<HTMLDivElement>(null)
  const barsIn = useInView(barsRef, { once: true, margin: '0px 0px -15% 0px' })
  const heatIn = useInView(heatRef, { once: true, margin: '0px 0px -10% 0px' })
  const heatBox = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(640)
  const [active, setActive] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const [view, setView] = useState<View>(readView)
  const [hourOn, setHourOn] = useState<number | null>(null)
  const pickView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* private mode */
    }
  }

  useEffect(() => {
    const el = heatBox.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth))
    ro.observe(el)
    setBoxW(el.clientWidth)
    return () => ro.disconnect()
  }, [view])

  const today = dayKey(now)
  const series = useMemo(() => {
    if (!d.firstDay) return [] as [string, number][]
    const end = Math.max(parse(d.lastDay), parse(today))
    const out: [string, number][] = []
    for (let t = parse(d.firstDay); t <= end; t += DAY) {
      const k = new Date(t).toISOString().slice(0, 10)
      out.push([k, d.counts.get(k) ?? 0])
    }
    return out
  }, [d, today])
  const max = Math.max(1, ...series.map(([, n]) => n))
  const shown = active ?? d.peak.day
  const shownN = d.counts.get(shown) ?? 0

  const streak = useMemo(() => longestStreak(d.days.map(([k]) => k)), [d.days])

  // calendar heatmap ------------------------------------------------------
  const cal = useMemo(() => {
    const year = Number(today.slice(0, 4))
    const yearStart = Date.UTC(year, 0, 1)
    const start = full || !d.firstDay ? yearStart : Math.max(yearStart, parse(d.firstDay) - 28 * DAY)
    const end = parse(today)
    const first = new Date(start)
    first.setUTCDate(first.getUTCDate() - first.getUTCDay())
    const cells: { key: string; n: number; w: number; dow: number }[] = []
    const months: { w: number; name: string }[] = []
    let lastMonth = -1
    for (let t = first.getTime(); t <= end; t += DAY) {
      if (t < start) continue
      const dt = new Date(t)
      const i = Math.floor((t - first.getTime()) / DAY)
      const w = Math.floor(i / 7)
      const key = dt.toISOString().slice(0, 10)
      if (dt.getUTCMonth() !== lastMonth) {
        months.push({ w, name: dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) })
        lastMonth = dt.getUTCMonth()
      }
      cells.push({ key, n: d.counts.get(key) ?? 0, w, dow: dt.getUTCDay() })
    }
    return { cells, months, weeks: (cells.at(-1)?.w ?? 0) + 1 }
  }, [d.counts, d.firstDay, today, full])
  const LEFT = 34
  const TOP = 24
  const STEP = Math.max(16, Math.min(40, Math.floor((boxW - LEFT - 10) / cal.weeks)))
  const CELL = STEP - 4
  const level = (n: number) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 10 ? 3 : 4)

  const hourMax = Math.max(1, ...d.hours)
  const peakHour = d.hours.indexOf(hourMax)
  const avg = d.total / Math.max(1, series.length)
  const hourShown = hourOn ?? peakHour
  const hourTotal = d.hours.reduce((a, b) => a + b, 0) || 1
  const parts = PARTS.map((p) => ({ ...p, n: d.hours.slice(p.from, p.to).reduce((a, b) => a + b, 0) }))
  const topPart = parts.reduce((a, b) => (b.n > a.n ? b : a), parts[0])

  // 3D data — memoised so the scenes only rebuild when the data really changes
  const rowBars = useMemo<Bar3D[]>(() => series.map(([k, n], i) => ({ key: k, x: i, z: 0, v: n, tip: `${label(k)} · ${n}`, today: k === today })), [series, today])
  const rowLabels = useMemo<Label3D[]>(() => {
    const every = Math.ceil(series.length / 8)
    return series.flatMap(([k], i) => (i % every === 0 ? [{ text: label(k), x: i, z: 1.4 }] : []))
  }, [series])
  const gridBars = useMemo<Bar3D[]>(() => cal.cells.map((c) => ({ key: c.key, x: c.w, z: c.dow, v: c.n, tip: `${label(c.key)} · ${c.n}`, today: c.key === today })), [cal.cells, today])
  const gridLabels = useMemo<Label3D[]>(
    () => [
      ...cal.months.map((m) => ({ text: m.name, x: m.w, z: -1.6 })),
      ...[1, 3, 5].map((dow) => ({ text: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow], x: -1.8, z: dow })),
    ],
    [cal.months],
  )
  const ringBars = useMemo<Bar3D[]>(() => d.hours.map((n, h) => ({ key: String(h), x: h, z: 0, v: n, tip: `${pad2(h)}:00 · ${n}` })), [d.hours])
  const ringLabels = useMemo<Label3D[]>(() => [0, 3, 6, 9, 12, 15, 18, 21].map((h) => ({ text: pad2(h), x: h, z: 0 })), [])
  const is3d = view === '3d'

  return (
    <section id="rhythm" className="section rhythm">
      <Chapter
        n="03"
        kicker="Rhythm"
        title={
          <>
            The <em>cadence</em> of shipping
          </>
        }
        lead={`Real merge dates, bucketed in ${timeZone().replace(/_/g, ' ')} time (${tzLabel()}). ${d.activeDays} active days since the first merge on ${d.firstDay ? fmtKeyDate(d.firstDay) : '—'}; empty days are genuinely empty.`}
      />

      <div className="view-bar">
        <div className="seg mono" role="tablist" aria-label="Chart view">
          {(['2d', '3d'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => pickView(v)}>
              {view === v && <motion.i layoutId="seg-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <span>{v === '2d' ? '2D' : '3D'}</span>
            </button>
          ))}
        </div>
        <span className="view-hint mono">{is3d ? 'Drag to orbit · hover a bar for its count · Spin to auto-rotate' : 'Hover any bar or square for exact counts'}</span>
      </div>

      <div className="rhythm-grid">
        <div className="panel glass bars-panel" ref={barsRef}>
          <div className="panel-head">
            <span className="panel-title mono">Daily merges</span>
            <span className="readout mono" aria-live="polite">
              <b>{label(shown)}</b> · {plural(shownN)}
              {!active && shown === d.peak.day ? ' · peak' : ''}
            </span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {is3d ? (
              <Fade key="3d">
                <Suspense fallback={<div className="b3d-wait" style={{ height: 330 }} />}>
                  <Bars3D bars={rowBars} labels={rowLabels} layout="row" height={330} active={active} onHover={setActive} />
                </Suspense>
              </Fade>
            ) : (
              <Fade key="2d" className="bars-wrap">
                <div className="bars-guides" aria-hidden="true">
                  {[0.25, 0.5, 0.75, 1].map((g) => (
                    <i key={g} style={{ bottom: `${g * 100}%` }}>
                      <span className="mono">{Math.round(max * g)}</span>
                    </i>
                  ))}
                  <b className={`bars-avg ${barsIn ? 'in' : ''}`} style={{ bottom: `${(avg / max) * 100}%` }}>
                    <span className="mono">avg {avg.toFixed(1)}</span>
                  </b>
                </div>
            <div className="bars" style={{ ['--n' as string]: series.length }}>
              {series.map(([k, n], i) => (
                <div
                  key={k}
                  className={`bar ${barsIn ? 'in' : ''} ${k === shown ? 'is-active' : ''} ${n === max ? 'is-peak' : ''} ${k === today ? 'is-today' : ''}`}
                  style={{ ['--i' as string]: i }}
                  tabIndex={0}
                  aria-label={`${label(k)}: ${plural(n)}`}
                  onMouseEnter={() => setActive(k)}
                  onFocus={() => setActive(k)}
                  onMouseLeave={() => setActive(null)}
                  onBlur={() => setActive(null)}
                >
                  <span className="bar-plot">
                    <span className="bar-n mono" style={{ bottom: `calc(${Math.max(n ? 4 : 0, (n / max) * 100)}% + 6px)` }}>
                      {n || ''}
                    </span>
                    <i style={{ height: `${Math.max(n ? 4 : 0, (n / max) * 100)}%` }} />
                  </span>
                  <span className="bar-d mono">{i % Math.ceil(series.length / 12) === 0 ? k.slice(8) : ''}</span>
                </div>
              ))}
            </div>
              </Fade>
            )}
          </AnimatePresence>
        </div>

        <div className="tiles">
          <Tile k="Active days" v={d.activeDays} sub={`of ${series.length} since the first merge`} run={barsIn} />
          <Tile k="Busiest day" v={d.peak.n} sub={d.peak.day ? `PRs on ${label(d.peak.day)}` : ''} run={barsIn} />
          <Tile k="Per active day" v={Math.round((d.total / Math.max(1, d.activeDays)) * 10) / 10} sub="merged PRs on average" run={barsIn} decimals />
          <Tile k="Longest streak" v={streak} sub={streak === 1 ? 'day in a row' : 'days in a row'} run={barsIn} />
        </div>
      </div>

      <div className="heat-hours">
      <div className="panel glass heat-panel" ref={heatRef}>
        <div className="panel-head">
          <span className="panel-title mono">{full ? `${today.slice(0, 4)} · full year` : 'Contribution calendar'}</span>
          <button type="button" className="chip-btn mono" onClick={() => setFull((f) => !f)} aria-pressed={full}>
            {full ? 'Zoom to activity' : 'Show full year'}
          </button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {is3d ? (
            <Fade key="3d">
              <Suspense fallback={<div className="b3d-wait" style={{ height: 360 }} />}>
                <Bars3D bars={gridBars} labels={gridLabels} layout="grid" palette="mint" height={360} active={active} onHover={setActive} />
              </Suspense>
            </Fade>
          ) : (
            <Fade key="2d" className="heat-body">
            <div className="heat-scroll" data-lenis-prevent ref={heatBox}>
              <svg className="heat" width={LEFT + cal.weeks * STEP + 6} height={TOP + 7 * STEP} role="group" aria-label="Merged pull request calendar">
                {[1, 3, 5].map((dow) => (
                  <text key={dow} x={0} y={TOP + dow * STEP + CELL * 0.72} className="heat-t">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow]}
                  </text>
                ))}
                {cal.months.map((m) => (
                  <text key={m.name + m.w} x={LEFT + m.w * STEP} y={12} className="heat-t">
                    {m.name}
                  </text>
                ))}
                {cal.cells.map((c) => (
                  <rect
                    key={c.key}
                    x={LEFT + c.w * STEP}
                    y={TOP + c.dow * STEP}
                    width={CELL}
                    height={CELL}
                    rx={Math.round(CELL * 0.28)}
                    className={`cell l${level(c.n)} ${heatIn ? 'in' : ''} ${c.key === today ? 'is-today' : ''}`}
                    style={{ animationDelay: `${c.w * 28 + c.dow * 12}ms` }}
                    tabIndex={c.n ? 0 : undefined}
                    role="img"
                    aria-label={`${label(c.key)}: ${plural(c.n)}`}
                    onMouseEnter={() => setActive(c.key)}
                    onFocus={() => setActive(c.key)}
                    onMouseLeave={() => setActive(null)}
                  />
                ))}
              </svg>
            </div>
            </Fade>
          )}
        </AnimatePresence>
        <div className="heat-foot mono">
          <span className="heat-read">
            {active && cal.cells.some((c) => c.key === active) ? (
              <>
                <b>{label(active)}</b> · {plural(d.counts.get(active) ?? 0)}
              </>
            ) : (
              'Every square is a day · color is merged PR count'
            )}
          </span>
          <span className="legend">
            Less
            {[0, 1, 2, 3, 4].map((l) => (
              <i key={l} className={`cell-sw l${l}`} />
            ))}
            More
          </span>
        </div>
      </div>

      <div className="panel glass hours-panel">
        <div className="panel-head">
          <span className="panel-title mono">When merges land · {tzLabel()}</span>
          <span className="readout mono">
            {hourOn === null ? 'Peak hour' : 'Hour'} <b>{pad2(hourShown)}:00</b> · {d.hours[hourShown]} {d.hours[hourShown] === 1 ? 'merge' : 'merges'}
          </span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {is3d ? (
            <Fade key="3d">
              <Suspense fallback={<div className="b3d-wait" style={{ height: 300 }} />}>
                <Bars3D bars={ringBars} labels={ringLabels} layout="ring" palette="sky" height={300} onHover={(k) => setHourOn(k === null ? null : Number(k))} />
              </Suspense>
            </Fade>
          ) : (
            <Fade key="2d" className="hours-body">
            <div className="hours">
              {d.hours.map((n, h) => (
                <motion.div
                  key={h}
                  className={`hour ${h === peakHour ? 'is-peak' : ''} ${h === hourOn ? 'is-on' : ''}`}
                  initial={{ scaleY: 0 }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.1, ease: EASE, delay: h * 0.02 }}
                  aria-label={`${pad2(h)}:00 ${tzLabel()} · ${plural(n)}`}
                  onMouseEnter={() => setHourOn(h)}
                  onMouseLeave={() => setHourOn(null)}
                >
                  <i style={{ height: `${Math.max(n ? 6 : 2, (n / hourMax) * 100)}%`, opacity: n ? 1 : 0.35 }} />
                  <span className="mono">{h % 3 === 0 ? pad2(h) : ''}</span>
                </motion.div>
              ))}
            </div>
            </Fade>
          )}
        </AnimatePresence>
        <div className="parts">
          {parts.map((p) => (
            <div key={p.k} className={`part ${p === topPart ? 'is-top' : ''} ${hourOn !== null && hourOn >= p.from && hourOn < p.to ? 'is-on' : ''}`}>
              <span className="part-k mono">{p.k}</span>
              <b>{Math.round((p.n / hourTotal) * 100)}%</b>
              <span className="part-meter" aria-hidden="true">
                <motion.i initial={{ scaleX: 0 }} whileInView={{ scaleX: p.n / hourTotal }} viewport={{ once: true }} transition={{ duration: 1.2, ease: EASE }} />
              </span>
              <span className="part-sub mono">
                {pad2(p.from)}–{pad2(p.to)} · {p.n}
              </span>
            </div>
          ))}
        </div>
      </div>
      </div>
    </section>
  )
}

function Tile({ k, v, sub, run, decimals }: { k: string; v: number; sub: string; run: boolean; decimals?: boolean }) {
  return (
    <Tilt max={6}>
    <div className="tile glass">
      <span className="tile-k mono">{k}</span>
      <strong className="tile-v">{decimals ? v.toFixed(1) : <CountUp value={v} run={run} />}</strong>
      <span className="tile-sub">{sub}</span>
    </div>
    </Tilt>
  )
}

function Fade({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }} transition={{ duration: 0.45, ease: EASE }}>
      {children}
    </motion.div>
  )
}
