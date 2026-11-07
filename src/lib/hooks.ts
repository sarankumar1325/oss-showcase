import { useEffect, useState } from 'react'

export function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}

/** Publishes the pointer position as CSS variables (--mx / --my, in px) for spotlight effects. */
export function usePointerVars() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    let raf = 0
    let x = 0
    let y = 0
    const flush = () => {
      raf = 0
      const s = document.documentElement.style
      s.setProperty('--mx', `${x}px`)
      s.setProperty('--my', `${y}px`)
    }
    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      if (!raf) raf = requestAnimationFrame(flush)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [])
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Deterministic PRNG so the intro choreography is identical on every visit. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
