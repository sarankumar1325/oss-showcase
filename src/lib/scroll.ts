import Lenis from 'lenis'
import { gsap, ScrollTrigger } from './gsap'

let lenis: Lenis | null = null

/** Lenis smooth scroll, driven by GSAP's ticker so ScrollTrigger stays perfectly in sync. */
export function initScroll(): () => void {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.2 })
  lenis.on('scroll', ScrollTrigger.update)
  const tick = (t: number) => lenis?.raf(t * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)
  return () => {
    gsap.ticker.remove(tick)
    lenis?.destroy()
    lenis = null
  }
}

export const stopScroll = () => lenis?.stop()
export const startScroll = () => lenis?.start()
export const scrollTop = () => (lenis ? lenis.scrollTo(0, { immediate: true, force: true }) : window.scrollTo(0, 0))

export function scrollToId(id: string, offset?: number) {
  const el = document.getElementById(id)
  if (!el) return
  if (lenis) {
    lenis.scrollTo(el, { offset: offset ?? (id === 'pulse' ? 0 : -4), duration: 1.7, easing: (t) => 1 - Math.pow(1 - t, 4) })
  } else {
    el.scrollIntoView({ behavior: 'smooth' })
  }
}
