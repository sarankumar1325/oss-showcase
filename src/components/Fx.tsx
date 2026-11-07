import { useEffect, useRef } from 'react'
import { gsap, isFinePointer, ScrollTrigger } from '../lib/gsap'
import { prefersReducedMotion } from '../lib/hooks'
import { Me } from './ui'

/** Controls the ring snaps around (pill buttons, links, chips). */
const STICK = 'button,a,[role="button"],[role="option"],summary,label.toggle'
/** Hoverable but too big / too dense to wrap: the ring just swells. */
const HOVER = '.bar,.cell,.hour,[data-cursor-hover]'

type Mode = 'free' | 'stick' | 'hover' | 'label' | 'ghost' | 'text'

/**
 * Precision dot + a liquid ring that:
 *  - stretches along the direction of travel (velocity squash),
 *  - morphs into the exact outline of the control under it and leans toward the pointer,
 *  - turns into a caret over text fields and a labelled disc over things like orbit stars.
 * Everything runs in one gsap.ticker loop with frame-rate independent smoothing.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!isFinePointer() || prefersReducedMotion()) return
    const d = dot.current!
    const r = ring.current!
    const ri = inner.current!
    const root = document.documentElement
    root.classList.add('has-cursor')

    const p = { x: -100, y: -100 } // pointer
    const dp = { x: -100, y: -100 } // dot
    const rp = { x: -100, y: -100, w: 30, h: 30, rad: 15 } // ring
    let vx = 0
    let vy = 0
    let stretch = 0
    let angle = 0
    let press = 1
    let down = false
    let shown = false
    let mode: Mode = 'free'
    let target: HTMLElement | null = null
    let targetRad = 0
    let extra = ''
    let extraGhost = false

    const radiusOf = (el: HTMLElement, h: number) => {
      const v = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
      return Math.min(v, h / 2)
    }

    const resolve = (el: Element | null) => {
      const text = el?.closest('input,textarea,[contenteditable="true"]') as HTMLElement | null
      const own = el?.closest<HTMLElement>('[data-cursor]')
      const stick = el?.closest<HTMLElement>(STICK)
      const hover = el?.closest<HTMLElement>(HOVER)
      let next: Mode = 'free'
      let name = ''
      target = null
      if (extra) {
        next = extraGhost ? 'ghost' : 'label'
        name = extra
      } else if (own) {
        next = own.dataset.cursorStyle === 'ghost' ? 'ghost' : 'label'
        name = own.dataset.cursor ?? ''
      } else if (text) next = 'text'
      else if (hover) next = 'hover'
      else if (stick) {
        const b = stick.getBoundingClientRect()
        if (b.width <= 420 && b.height <= 120) {
          next = 'stick'
          target = stick
          targetRad = radiusOf(stick, b.height)
        } else next = 'hover'
      }
      if (next !== mode) {
        r.dataset.mode = next
        d.dataset.mode = next
        mode = next
      }
      if (label.current && label.current.textContent !== name) label.current.textContent = name
    }

    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if (!shown) {
        shown = true
        dp.x = rp.x = p.x = e.clientX
        dp.y = rp.y = p.y = e.clientY
        root.classList.add('cursor-on')
      }
      p.x = e.clientX
      p.y = e.clientY
    }
    const over = (e: PointerEvent) => resolve(e.target as Element)
    const onDown = () => (down = true)
    const onUp = () => (down = false)
    const leave = () => {
      shown = false
      root.classList.remove('cursor-on')
    }
    const custom = (e: Event) => {
      const v = (e as CustomEvent<string | { text: string; ghost?: boolean }>).detail
      extra = typeof v === 'string' ? v : (v?.text ?? '')
      extraGhost = typeof v === 'object' && !!v?.ghost
      resolve(document.elementFromPoint(p.x, p.y))
    }
    // scrolling moves content under a still pointer
    const onScroll = () => mode !== 'free' && resolve(document.elementFromPoint(p.x, p.y))

    const tick = (_t: number, dtMs: number) => {
      if (!shown) return
      const f = Math.min(3, dtMs / 16.67)
      const k = (s: number) => 1 - Math.pow(1 - s, f)

      // dot: near-instant
      dp.x += (p.x - dp.x) * k(0.55)
      dp.y += (p.y - dp.y) * k(0.55)

      // ring target
      let tx = p.x
      let ty = p.y
      let tw = 30
      let th = 30
      let trad = 15
      if (mode === 'stick' && target?.isConnected) {
        const b = target.getBoundingClientRect()
        const pad = 6
        const cx = b.left + b.width / 2
        const cy = b.top + b.height / 2
        tx = cx + (p.x - cx) * 0.12
        ty = cy + (p.y - cy) * 0.18
        tw = b.width + pad * 2
        th = b.height + pad * 2
        trad = targetRad + pad
      } else if (mode === 'stick') {
        mode = 'free'
        r.dataset.mode = d.dataset.mode = 'free'
      } else if (mode === 'hover') {
        tw = th = 46
        trad = 23
      } else if (mode === 'label') {
        tw = th = 74
        trad = 37
      } else if (mode === 'ghost') {
        tw = th = 62
        trad = 31
      } else if (mode === 'text') {
        tw = 3
        th = 24
        trad = 2
      }
      const follow = mode === 'stick' ? 0.24 : 0.2
      const ox = rp.x
      const oy = rp.y
      rp.x += (tx - rp.x) * k(follow)
      rp.y += (ty - rp.y) * k(follow)
      rp.w += (tw - rp.w) * k(0.2)
      rp.h += (th - rp.h) * k(0.2)
      rp.rad += (trad - rp.rad) * k(0.2)

      // velocity squash (only when free-floating)
      vx = (rp.x - ox) / f
      vy = (rp.y - oy) / f
      const speed = Math.hypot(vx, vy)
      const want = mode === 'free' ? Math.min(0.45, speed / 60) : 0
      stretch += (want - stretch) * k(0.25)
      if (speed > 0.6 && mode === 'free') angle = Math.atan2(vy, vx)
      press += ((down ? 0.86 : 1) - press) * k(0.3)

      const sx = (1 + stretch) * press
      const sy = (1 - stretch * 0.55) * press
      r.style.transform = `translate3d(${rp.x - rp.w / 2}px, ${rp.y - rp.h / 2}px, 0)`
      r.style.width = `${rp.w}px`
      r.style.height = `${rp.h}px`
      ri.style.borderRadius = `${rp.rad}px`
      ri.style.transform = `rotate(${angle}rad) scale(${sx}, ${sy}) rotate(${-angle}rad)`
      d.style.transform = `translate3d(${dp.x}px, ${dp.y}px, 0) scale(${down ? 0.6 : 1})`
    }

    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerover', over)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('scroll', onScroll, { passive: true })
    document.documentElement.addEventListener('mouseleave', leave)
    window.addEventListener('oss:cursor', custom)
    gsap.ticker.add(tick)
    r.dataset.mode = d.dataset.mode = 'free'
    return () => {
      gsap.ticker.remove(tick)
      window.removeEventListener('pointermove', move)
      document.removeEventListener('pointerover', over)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('scroll', onScroll)
      document.documentElement.removeEventListener('mouseleave', leave)
      window.removeEventListener('oss:cursor', custom)
      root.classList.remove('has-cursor', 'cursor-on')
    }
  }, [])

  return (
    <>
      <div ref={ring} className="cur-ring" aria-hidden="true">
        <div ref={inner} className="cur-ring-in" />
        <span ref={label} className="cur-label mono" />
      </div>
      <div ref={dot} className="cur-dot" aria-hidden="true" />
    </>
  )
}

/** Thin gradient progress line at the very top of the viewport. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => gsap.set(bar.current, { scaleX: self.progress }),
    })
    return () => st.kill()
  }, [])
  return (
    <div className="progress" aria-hidden="true">
      <div ref={bar} className="progress-bar" />
    </div>
  )
}

/** Water-ripple on every .btn press. */
export function useRipple() {
  useEffect(() => {
    if (prefersReducedMotion()) return
    const down = (e: PointerEvent) => {
      const b = (e.target as Element).closest<HTMLElement>('.btn')
      if (!b) return
      const rect = b.getBoundingClientRect()
      const s = document.createElement('span')
      s.className = 'ripple'
      const size = Math.max(rect.width, rect.height) * 2
      Object.assign(s.style, { width: size + 'px', height: size + 'px', left: e.clientX - rect.left - size / 2 + 'px', top: e.clientY - rect.top - size / 2 + 'px' })
      b.appendChild(s)
      gsap.fromTo(s, { scale: 0, opacity: 0.45 }, { scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => s.remove() })
    }
    window.addEventListener('pointerdown', down)
    return () => window.removeEventListener('pointerdown', down)
  }, [])
}

export function Curtain() {
  return (
    <div id="curtain" className="curtain" aria-hidden="true">
      <Me size={72} className="curtain-mark" />
    </div>
  )
}

/** Cover the screen, swap the page while hidden, then lift. */
export function playCurtain(mid: () => void, end?: () => void) {
  const el = document.getElementById('curtain')
  if (!el || prefersReducedMotion()) {
    mid()
    end?.()
    return
  }
  const mark = el.querySelector('.curtain-mark')
  gsap
    .timeline()
    .set(el, { display: 'grid', yPercent: 100 })
    .to(el, { yPercent: 0, duration: 0.6, ease: 'expo.inOut' })
    .fromTo(mark, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }, '-=0.25')
    .add(mid)
    .to(el, { yPercent: -100, duration: 0.75, ease: 'expo.inOut' }, '+=0.2')
    .set(el, { display: 'none' })
    .add(() => end?.())
}
