import { useEffect, useMemo, useRef } from 'react'
import type { Derived } from '../lib/derive'
import type { LiveEvent, OwnerType } from '../types'
import { mulberry32, prefersReducedMotion } from '../lib/hooks'
import { Chapter } from './ui'
import { ownerLabel } from '../lib/derive'
import { useProfile } from '../lib/profile'

interface Star {
  name: string
  count: number
  ux: number
  uy: number
  size: number
  org: boolean
  kind: OwnerType | undefined
  phase: number
  depth: number
  latest: number
  born: number
  sx: number
  sy: number
}
interface Pulse {
  name: string
  born: number
}

const DAY = 86_400_000

function sprite(rgb: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(48, 48, 0, 48, 48, 48)
  grd.addColorStop(0, `rgba(${rgb},0.95)`)
  grd.addColorStop(0.18, `rgba(${rgb},0.45)`)
  grd.addColorStop(0.5, `rgba(${rgb},0.1)`)
  grd.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = grd
  g.fillRect(0, 0, 96, 96)
  return c
}

export function Orbit({ d, onPick, subscribe }: { d: Derived; onPick: (repo: string) => void; subscribe: (fn: (e: LiveEvent) => void) => () => void }) {
  const profile = useProfile()
  const section = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const starsRef = useRef<Star[]>([])
  const linksRef = useRef<[number, number][]>([])
  const bornRef = useRef(new Map<string, number>())
  const clock = useRef(0)
  const pulses = useRef<Pulse[]>([])
  const hover = useRef(-1)
  const pickRef = useRef(onPick)
  pickRef.current = onPick

  const { stars, links } = useMemo(() => {
    const latest = new Map<string, number>()
    for (const p of d.newest) {
      const k = `${p.owner}/${p.repo}`
      if (!latest.has(k)) latest.set(k, new Date(p.mergedAt).getTime())
    }
    const rnd = mulberry32(179)
    const N = d.repoGroups.length
    const stars: Star[] = d.repoGroups.map(([name, count], i) => {
      const rad = Math.sqrt((i + 0.6) / N)
      const th = i * 2.399963
      return {
        name,
        count,
        ux: Math.cos(th) * rad,
        uy: Math.sin(th) * rad,
        size: 2 + Math.sqrt(count) * 2.1,
        org: d.repoOwnerType.get(name) !== 'User',
        kind: d.repoOwnerType.get(name),
        phase: rnd() * 6.28,
        depth: 0.3 + rnd() * 0.9,
        latest: latest.get(name) ?? 0,
        born: -10,
        sx: 0,
        sy: 0,
      }
    })
    const byOwner = new Map<string, number[]>()
    stars.forEach((s, i) => {
      const o = s.name.split('/')[0]
      byOwner.set(o, [...(byOwner.get(o) ?? []), i])
    })
    const links: [number, number][] = []
    byOwner.forEach((idx) => {
      for (let k = 1; k < idx.length; k++) links.push([idx[k - 1], idx[k]])
    })
    return { stars, links }
  }, [d.repoGroups, d.newest, d.repoOwnerType])

  // carry birth times across rebuilds so brand-new repositories blink into existence
  useEffect(() => {
    const first = starsRef.current.length === 0
    stars.forEach((s) => {
      if (!bornRef.current.has(s.name)) bornRef.current.set(s.name, first ? -10 : clock.current)
      s.born = bornRef.current.get(s.name)!
    })
    starsRef.current = stars
    linksRef.current = links
  }, [stars, links])

  useEffect(
    () =>
      subscribe((e) => {
        if (e.silent) return
        pulses.current.push({ name: `${e.pr.owner}/${e.pr.repo}`, born: clock.current })
      }),
    [subscribe],
  )

  useEffect(() => {
    const cv = canvas.current
    const sec = section.current
    const ctx = cv?.getContext('2d')
    if (!cv || !sec || !ctx) return
    const motionOK = !prefersReducedMotion()
    const violet = sprite('214,220,232')
    const cyan = sprite('95,212,155')
    const white = sprite('238,240,245')

    const rnd = mulberry32(7)
    const dust = Array.from({ length: 150 }, () => ({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, r: 0.4 + rnd() * 0.9, p: rnd() * 6 }))

    let w = 0
    let h = 0
    let dpr = 1
    const resize = () => {
      const r = sec.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      cv.width = Math.floor(w * dpr)
      cv.height = Math.floor(h * dpr)
      cv.style.width = w + 'px'
      cv.style.height = h + 'px'
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(sec)

    let visible = false
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: '120px' })
    io.observe(sec)

    const target = { x: 0, y: 0 }
    const m = { x: 0, y: 0 }
    const pointer = { x: -999, y: -999 }
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      pointer.x = e.clientX - r.left
      pointer.y = e.clientY - r.top
      target.x = pointer.x / r.width - 0.5
      target.y = pointer.y / r.height - 0.5
    }
    const onLeave = () => {
      pointer.x = pointer.y = -999
      target.x = target.y = 0
    }
    const hit = (x: number, y: number) => {
      let best = -1
      let bd = Infinity
      starsRef.current.forEach((s, i) => {
        const dd = Math.hypot(s.sx - x, s.sy - y)
        if (dd < Math.max(15, s.size + 9) && dd < bd) {
          bd = dd
          best = i
        }
      })
      return best
    }
    const onClick = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect()
      const i = hit(e.clientX - r.left, e.clientY - r.top)
      if (i >= 0) pickRef.current(starsRef.current[i].name)
    }
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerleave', onLeave)
    cv.addEventListener('click', onClick)

    const t0 = performance.now()
    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!visible || document.hidden) return
      const t = (now - t0) / 1000
      clock.current = t
      m.x += (target.x - m.x) * 0.05
      m.y += (target.y - m.y) * 0.05
      const stars = starsRef.current
      const wall = Date.now()

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'

      const cx = w * 0.5
      const cy = h * 0.55
      const S = Math.min(w * 0.47, h * 0.66)
      const ang = (motionOK ? t * 0.03 : 0) + m.x * 0.3
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)

      // distant dust
      const da = ang * 0.45
      const dca = Math.cos(da)
      const dsa = Math.sin(da)
      for (const p of dust) {
        const x = cx + (p.x * dca - p.y * dsa) * w * 0.62
        const y = cy + (p.x * dsa + p.y * dca) * h * 0.52
        ctx.fillStyle = `rgba(238,240,245,${0.1 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.9 + p.p))})`
        ctx.fillRect(x, y, p.r, p.r)
      }

      for (const s of stars) {
        const rx = s.ux * ca - s.uy * sa
        const ry = s.ux * sa + s.uy * ca
        s.sx = cx + rx * S + m.x * 26 * s.depth
        s.sy = cy + ry * S * 0.62 + m.y * 18 * s.depth
      }

      // hover
      const hi = pointer.x > -900 ? hit(pointer.x, pointer.y) : -1
      if (hi !== hover.current) {
        hover.current = hi
        cv.style.cursor = hi >= 0 ? 'pointer' : 'default'
        window.dispatchEvent(new CustomEvent('oss:cursor', { detail: hi >= 0 ? 'View' : '' }))
      }
      const hs = hi >= 0 ? stars[hi] : null
      const tipEl = tip.current
      if (tipEl) {
        if (hs) {
          tipEl.style.opacity = '1'
          const tx = Math.min(hs.sx + 18, w - 230)
          tipEl.style.transform = `translate(${Math.max(8, tx)}px, ${Math.max(8, hs.sy + 16)}px)`
          const [b, s] = [tipEl.children[0], tipEl.children[1]]
          const label = `${hs.count} merged ${hs.count === 1 ? 'PR' : 'PRs'} · ${ownerLabel(hs.kind)}`
          if (b.textContent !== hs.name) b.textContent = hs.name
          if (s.textContent !== label) s.textContent = label
        } else tipEl.style.opacity = '0'
      }
      const hoverOwner = hs?.name.split('/')[0]

      // constellation lines
      ctx.lineWidth = 1
      for (const [a, b] of linksRef.current) {
        const A = stars[a]
        const B = stars[b]
        if (!A || !B) continue
        const on = hoverOwner && A.name.startsWith(hoverOwner + '/')
        ctx.strokeStyle = on ? 'rgba(238,240,245,0.5)' : 'rgba(238,240,245,0.1)'
        ctx.beginPath()
        ctx.moveTo(A.sx, A.sy)
        ctx.lineTo(B.sx, B.sy)
        ctx.stroke()
      }

      // stars
      stars.forEach((s, i) => {
        const age = t - s.born
        const k = Math.min(1, Math.max(0, age / 1.4))
        const appear = 1 - Math.pow(1 - k, 3)
        const r = s.size * appear * (i === hi ? 1.25 : 1)
        if (r <= 0.01) return
        const tw = 0.7 + 0.3 * Math.sin(t * 1.5 + s.phase)
        const img = s.org ? violet : cyan
        const gs = r * (i === hi ? 10 : 8)
        ctx.globalAlpha = (0.55 + 0.45 * tw) * (i === hi ? 1 : 0.9)
        ctx.drawImage(img, s.sx - gs / 2, s.sy - gs / 2, gs, gs)
        ctx.globalAlpha = 1
        const cs = r * 2.4
        ctx.globalAlpha = 0.9
        ctx.drawImage(white, s.sx - cs / 2, s.sy - cs / 2, cs, cs)
        ctx.globalAlpha = 1

        if (s.latest && wall - s.latest < 3 * DAY && motionOK) {
          const ph = (t * 0.42 + s.phase) % 1
          ctx.strokeStyle = s.org ? `rgba(214,220,232,${(1 - ph) * 0.45})` : `rgba(95,212,155,${(1 - ph) * 0.45})`
          ctx.beginPath()
          ctx.arc(s.sx, s.sy, r + 3 + ph * 26, 0, Math.PI * 2)
          ctx.stroke()
        }
        if (i === hi) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'
          ctx.beginPath()
          ctx.arc(s.sx, s.sy, r + 6, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      // live pulses
      const list = pulses.current
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]
        const age = t - p.born
        if (age > 3.2) {
          list.splice(i, 1)
          continue
        }
        const s = stars.find((x) => x.name === p.name)
        if (!s) continue
        for (const off of [0, 0.35]) {
          const a = age - off
          if (a <= 0) continue
          ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, 1 - a / 2.6) * 0.85})`
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.arc(s.sx, s.sy, a * 120, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.lineWidth = 1
      }
      ctx.globalCompositeOperation = 'source-over'
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerleave', onLeave)
      cv.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <section id="orbit" className="orbit" ref={section}>
      <canvas ref={canvas} className="orbit-canvas" role="img" aria-label={`Constellation of ${d.repoGroups.length} repositories; larger stars have more merged pull requests`} />
      <div className="orbit-overlay">
        <Chapter
          n="02"
          kicker="Orbit"
          titleKey={d.repoGroups.length}
          title={
            <>
              {d.repoGroups.length} repositories.
              <br />
              <em>One</em> orbit
            </>
          }
          lead={`Every star is a project ${profile.isOwner ? 'I’ve' : 'they’ve'} shipped into. Larger means more merges; lines join repositories that share an owner; a ripple means something merged in the last three days.`}
        />
        <div className="orbit-foot mono">
          <span className="legend-item">
            <i className="dot-org" /> Organization
          </span>
          <span className="legend-item">
            <i className="dot-user" /> Individual owner
          </span>
          <span className="orbit-hint">Hover a star · click to open its merges</span>
        </div>
      </div>
      <div className="orbit-tip" ref={tip}>
        <b className="mono" />
        <span className="mono" />
      </div>
    </section>
  )
}
