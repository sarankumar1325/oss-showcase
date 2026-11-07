import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'
import { prefersReducedMotion } from '../lib/hooks'
import { gsap, isFinePointer, SplitText } from '../lib/gsap'
import { useProfile } from '../lib/profile'

export const EASE = [0.16, 1, 0.3, 1] as const

/** Mechanical rolling digits. */
export function Odometer({ value, run, delay = 0, className = '' }: { value: number; run: boolean; delay?: number; className?: string }) {
  const digits = String(value).split('')
  return (
    <span className={`odo ${className}`} role="img" aria-label={String(value)}>
      {digits.map((d, i) => (
        <span className="odo-digit" aria-hidden="true" key={digits.length - i}>
          <span
            className="odo-strip"
            style={{
              top: `${run ? -Number(d) * 100 : 0}%`,
              transitionDelay: `${delay + i * 0.14}s`,
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}

export function CountUp({ value, run, duration = 1800, delay = 0 }: { value: number; run: boolean; duration?: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  useEffect(() => {
    const el = ref.current
    if (!el || !run) return
    if (prefersReducedMotion()) {
      el.textContent = String(value)
      from.current = value
      return
    }
    const start = performance.now() + delay * 1000
    const f = from.current
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / duration))
      const e = 1 - Math.pow(1 - p, 4)
      el.textContent = String(Math.round(f + (value - f) * e))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, run, duration, delay])
  return <span ref={ref}>0</span>
}

export function Magnetic({ children, strength = 0.28 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 220, damping: 16, mass: 0.4 })
  const sy = useSpring(y, { stiffness: 220, damping: 16, mass: 0.4 })
  return (
    <motion.div
      ref={ref}
      className="magnetic"
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect()
        if (!r) return
        x.set((e.clientX - (r.left + r.width / 2)) * strength)
        y.set((e.clientY - (r.top + r.height / 2)) * strength)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}

export function Chapter({ n, kicker, title, lead, id, titleKey }: { n: string; kicker: string; title: ReactNode; lead?: ReactNode; id?: string; titleKey?: string | number }) {
  const root = useRef<HTMLElement>(null)
  // React must never re-diff the title DOM once SplitText has rewritten it, so freeze the first element
  // (re-mounting via titleKey when its content genuinely changes).
  const frozen = useRef<{ key: string | number | undefined; node: ReactNode }>({ key: titleKey, node: title })
  if (frozen.current.key !== titleKey) frozen.current = { key: titleKey, node: title }

  useEffect(() => {
    const el = root.current
    if (!el) return
    const h2 = el.querySelector<HTMLElement>('.chapter-title')!
    const kick = el.querySelector<HTMLElement>('.chapter-kicker-text')!
    const rule = el.querySelector<HTMLElement>('.chapter-rule')!
    const num = el.querySelector<HTMLElement>('.chapter-n')!
    const leadEl = el.querySelector<HTMLElement>('.chapter-lead')
    if (prefersReducedMotion()) {
      gsap.set(h2, { opacity: 1 })
      return
    }
    let split: SplitText | undefined
    let ctx: gsap.Context | undefined
    let dead = false
    document.fonts.ready.then(() => {
      if (dead) return
      ctx = gsap.context(() => {
        split = SplitText.create(h2, { type: 'words', mask: 'words', wordsClass: 'chapter-word', maskClass: 'chapter-mask' })
        gsap.set(h2, { opacity: 1 })
        const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 82%', once: true } })
        tl.from(num, { opacity: 0, y: 10, duration: 0.6, ease: 'power3.out' })
          .from(rule, { scaleX: 0, transformOrigin: 'left', duration: 0.9, ease: 'expo.out' }, '<0.05')
          .to(kick, { duration: 1, scrambleText: { text: kick.textContent ?? '', chars: 'lowerCase', speed: 0.7, revealDelay: 0.1 } }, '<0.1')
          .from(split.words, { yPercent: 115, rotate: 4, duration: 1.2, stagger: 0.07, ease: 'expo.out' }, '<0.1')
        if (leadEl) tl.from(leadEl, { opacity: 0, y: 24, duration: 1, ease: 'power3.out' }, '-=0.7')
      }, el)
    })
    return () => {
      dead = true
      ctx?.revert()
      split?.revert()
    }
  }, [titleKey])

  return (
    <header id={id} className="chapter" ref={root}>
      <div className="chapter-kicker mono">
        <span className="chapter-n">{n}</span>
        <span className="chapter-rule" />
        <span className="chapter-kicker-text">{kicker}</span>
      </div>
      <h2 className="chapter-title" key={titleKey}>
        {frozen.current.node}
      </h2>
      {lead && <p className="chapter-lead">{lead}</p>}
    </header>
  )
}

/** Wrapper that gives its child a GSAP-driven 3D tilt following the pointer. */
export function Tilt({ children, max = 7, className = '' }: { children: ReactNode; max?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !isFinePointer() || prefersReducedMotion()) return
    gsap.set(el, { transformPerspective: 900 })
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3' })
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3' })
    const lift = gsap.quickTo(el, 'z', { duration: 0.6, ease: 'power3' })
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ry(((e.clientX - r.left) / r.width - 0.5) * max * 2)
      rx(-((e.clientY - r.top) / r.height - 0.5) * max * 2)
      lift(18)
    }
    const leave = () => {
      rx(0)
      ry(0)
      lift(0)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      gsap.killTweensOf(el)
    }
  }, [max])
  return (
    <div ref={ref} className={`tilt ${className}`}>
      {children}
    </div>
  )
}

export function Icon({ name, size = 16 }: { name: 'merge' | 'repo' | 'org' | 'users' | 'search' | 'arrow' | 'bolt'; size?: number }) {
  const paths: Record<string, ReactNode> = {
    merge: (
      <>
        <circle cx="7" cy="5" r="2.5" />
        <circle cx="7" cy="19" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M7 7.5v9M7 8c0 6 11 1 11 7.5" />
      </>
    ),
    repo: <path d="M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 14h14M7 3v10M7 20h5" />,
    org: <path d="M8 21V3h13v18H3V9h5m4-2h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" />,
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M2 21v-3a7 7 0 0 1 14 0v3m0-16a3 3 0 0 1 0 6m3 3a6 6 0 0 1 3 5v2" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="7" />
        <path d="m15 15 6 6" />
      </>
    ),
    arrow: <path d="M7 17 17 7M8 7h9v9" />,
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export function OwnerAvatar({ owner, size = 34 }: { owner: string; size?: number }) {
  const ref = useRef<HTMLImageElement>(null)
  return (
    <span className="avatar" style={{ width: size, height: size }} aria-hidden="true">
      <span className="avatar-fallback mono">{owner.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase()}</span>
      <img
        ref={ref}
        src={`https://github.com/${encodeURIComponent(owner)}.png?size=${size * 2}`}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={(e) => e.currentTarget.classList.add('ok')}
        onError={(e) => e.currentTarget.remove()}
      />
    </span>
  )
}

/** The portfolio owner's photo (configured file or GitHub avatar). */
export function Me({ size = 34, className = '' }: { size?: number; className?: string }) {
  const p = useProfile()
  return <img className={`me ${className}`} src={p.photo} alt={p.name} width={size} height={size} decoding="async" draggable={false} />
}
