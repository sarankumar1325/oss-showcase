import { useCallback, useEffect, useRef, useState } from 'react'
import type { PR } from '../types'
import { fmtShort } from '../lib/format'
import { mulberry32 } from '../lib/hooks'
import { useProfile } from '../lib/profile'

type RGB = [number, number, number]
const ORG: RGB = [214, 220, 232]
const USER: RGB = [95, 212, 155]
const PINK: RGB = [150, 158, 178]

interface Branch {
  a: number
  curve: number
  delay: number
  dur: number
  col: RGB
  arrived: boolean
  at: number
  pr: PR
}
interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  col: RGB
}

/**
 * The opening shot. Every merged PR is a branch that travels in from the dark edges of the
 * screen and lands on a single point — a literal merge — while the counter climbs to the total.
 */
export function Intro({ prs, onReveal, onDone }: { prs: PR[]; onReveal: () => void; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const countEl = useRef<HTMLSpanElement>(null)
  const tickEl = useRef<HTMLDivElement>(null)
  const barEl = useRef<HTMLElement>(null)
  const flashEl = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'run' | 'title' | 'exit'>('run')
  const exiting = useRef(false)
  const profile = useProfile()

  const finish = useCallback(() => {
    if (exiting.current) return
    exiting.current = true
    setPhase('exit')
    onReveal()
    window.setTimeout(onDone, 1100)
  }, [onDone, onReveal])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  useEffect(() => {
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return

    const sorted = [...prs].sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))
    const N = sorted.length
    const rnd = mulberry32(280)
    const branches: Branch[] = sorted.map((pr, i) => {
      const f = i / N
      return {
        a: i * 2.399963 + (rnd() - 0.5) * 0.5,
        curve: (rnd() - 0.5) * 1.7,
        delay: 0.9 + 3.0 * Math.pow(f, 0.85),
        dur: 1.35 - 0.7 * f + rnd() * 0.35,
        col: pr.ownerType === 'User' ? USER : rnd() < 0.18 ? PINK : ORG,
        arrived: false,
        at: 0,
        pr,
      }
    })
    const sparks: Spark[] = []

    let w = 0
    let h = 0
    let dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      cv.width = Math.floor(w * dpr)
      cv.height = Math.floor(h * dpr)
      cv.style.width = w + 'px'
      cv.style.height = h + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const t0 = performance.now()
    let last = 0
    let raf = 0
    let arrived = 0
    let completeAt = -1
    let auto: ReturnType<typeof setTimeout> | undefined

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const t = (now - t0) / 1000
      const dt = Math.min(0.05, t - last)
      last = t
      const cx = w / 2
      const cy = h * 0.46
      const R = Math.hypot(w, h) * 0.55

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, w, h)

      // radar guides
      ctx.strokeStyle = 'rgba(238,240,245,0.05)'
      ctx.lineWidth = 1
      for (const k of [0.16, 0.34, 0.58]) {
        ctx.beginPath()
        ctx.arc(cx, cy, R * k, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.globalCompositeOperation = 'lighter'
      const prog = arrived / N

      for (const b of branches) {
        const p = (t - b.delay) / b.dur
        if (p <= 0) continue
        const sx = cx + Math.cos(b.a) * R
        const sy = cy + Math.sin(b.a) * R
        const dx = cx - sx
        const dy = cy - sy
        const len = Math.hypot(dx, dy)
        const ccx = (sx + cx) / 2 + (-dy / len) * len * 0.32 * b.curve
        const ccy = (sy + cy) / 2 + (dx / len) * len * 0.32 * b.curve
        const pt = (u: number): [number, number] => {
          const v = 1 - u
          return [v * v * sx + 2 * v * u * ccx + u * u * cx, v * v * sy + 2 * v * u * ccy + u * u * cy]
        }
        const [r, g, bl] = b.col

        if (p >= 1 && !b.arrived) {
          b.arrived = true
          b.at = t
          arrived++
          if (countEl.current) countEl.current.textContent = String(arrived)
          if (tickEl.current)
            tickEl.current.textContent = `${fmtShort(b.pr.mergedAt)}  ·  ${b.pr.owner}/${b.pr.repo}  #${b.pr.number}`
          if (barEl.current) barEl.current.style.transform = `scaleX(${arrived / N})`
          for (let k = 0; k < 4; k++) {
            const ang = Math.random() * Math.PI * 2
            const sp = 50 + Math.random() * 170
            sparks.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: 0.4 + Math.random() * 0.6, col: b.col })
          }
          if (sparks.length > 500) sparks.splice(0, sparks.length - 500)
        }

        if (p < 1) {
          const u = Math.pow(p, 1.7)
          // faint path travelled so far
          const [hx, hy] = pt(u)
          ctx.strokeStyle = `rgba(${r},${g},${bl},0.07)`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.quadraticCurveTo(sx + (ccx - sx) * u, sy + (ccy - sy) * u, hx, hy)
          ctx.stroke()
          // luminous tail
          const L = 0.17
          for (let k = 0; k < 8; k++) {
            const [ax, ay] = pt(Math.max(0, u - (L * (k + 1)) / 8))
            const [bx, by] = pt(Math.max(0, u - (L * k) / 8))
            ctx.strokeStyle = `rgba(${r},${g},${bl},${0.95 * Math.pow(1 - k / 8, 1.6)})`
            ctx.lineWidth = 1.6 - k * 0.1
            ctx.beginPath()
            ctx.moveTo(ax, ay)
            ctx.lineTo(bx, by)
            ctx.stroke()
          }
          ctx.fillStyle = `rgba(255,255,255,0.95)`
          ctx.beginPath()
          ctx.arc(hx, hy, 1.7, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = `rgba(${r},${g},${bl},0.25)`
          ctx.beginPath()
          ctx.arc(hx, hy, 6, 0, Math.PI * 2)
          ctx.fill()
        } else {
          const a = 0.07 * Math.exp(-(t - b.at) * 1.1)
          if (a > 0.004) {
            ctx.strokeStyle = `rgba(${r},${g},${bl},${a})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(sx, sy)
            ctx.quadraticCurveTo(ccx, ccy, cx, cy)
            ctx.stroke()
          }
        }
      }

      // sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.life += dt
        if (s.life >= s.max) {
          sparks.splice(i, 1)
          continue
        }
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.vx *= 0.96
        s.vy *= 0.96
        const a = 1 - s.life / s.max
        ctx.fillStyle = `rgba(${s.col[0]},${s.col[1]},${s.col[2]},${a * 0.9})`
        ctx.fillRect(s.x, s.y, 1.6, 1.6)
      }

      // the merge point
      const breathe = completeAt >= 0 ? Math.sin((t - completeAt) * 2.4) * 0.5 + 0.5 : 0
      const rad = 28 + 210 * prog * prog + 18 * breathe + 6 * Math.sin(t * 7) * prog
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
      g.addColorStop(0, `rgba(255,255,255,${0.2 + 0.3 * prog})`)
      g.addColorStop(0.22, `rgba(238,240,245,${0.1 + 0.3 * prog})`)
      g.addColorStop(1, 'rgba(238,240,245,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, rad, 0, Math.PI * 2)
      ctx.fill()

      // completion
      if (arrived >= N && completeAt < 0) {
        completeAt = t
        flashEl.current?.classList.add('go')
        setPhase((p) => (p === 'run' ? 'title' : p))
        auto = setTimeout(finish, 3000)
      }
      if (completeAt >= 0) {
        const since = t - completeAt
        for (const delay of [0, 0.16]) {
          const d = since - delay
          if (d <= 0 || d > 1.4) continue
          ctx.strokeStyle = `rgba(238,240,245,${Math.max(0, 1 - d / 1.4) * 0.65})`
          ctx.lineWidth = 2.4 - d
          ctx.beginPath()
          ctx.arc(cx, cy, d * 1250, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(auto)
      window.removeEventListener('resize', resize)
    }
  }, [prs, finish])

  return (
    <div className={`intro is-${phase}`} onClick={finish} role="dialog" aria-label="Introduction">
      <canvas ref={canvas} className="intro-canvas" aria-hidden="true" />

      <div className="intro-top mono" aria-hidden="true">
        <span className="intro-prompt">$</span>
        <span className="intro-typed">gh search prs --author {profile.handle} --merged --external</span>
        <i className="intro-caret" />
      </div>

      <div className="intro-center">
        <div className="intro-label mono">Merged · external · public</div>
        <div className="intro-count" aria-live="off">
          <span ref={countEl}>0</span>
        </div>
        <div className="intro-ticker mono" ref={tickEl} aria-hidden="true" />
        <div className="intro-title" aria-hidden={phase === 'run'}>
          <p>
            merged into projects <em>beyond</em> {profile.isOwner ? 'my' : 'their'} own
          </p>
          <button
            type="button"
            className="intro-enter"
            onClick={(e) => {
              e.stopPropagation()
              finish()
            }}
          >
            Enter <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        className="intro-skip mono"
        onClick={(e) => {
          e.stopPropagation()
          finish()
        }}
      >
        Skip intro <kbd>↵</kbd>
      </button>
      <div className="intro-bar" aria-hidden="true">
        <i ref={barEl} />
      </div>
      <div className="intro-flash" ref={flashEl} aria-hidden="true" />
    </div>
  )
}
