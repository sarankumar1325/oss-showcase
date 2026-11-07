import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { RouteName } from '../lib/filter'
import { gsap } from '../lib/gsap'
import { prefersReducedMotion } from '../lib/hooks'
import { Icon, Me } from './ui'
import { useProfile } from '../lib/profile'

export const SECTIONS = [
  { id: 'pulse', label: 'Pulse' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'rhythm', label: 'Rhythm' },
  { id: 'feed', label: 'Live' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'about', label: 'About' },
] as const

interface Props {
  show: boolean
  route: RouteName
  total: number
  onGo: (target: string) => void
  onPalette: () => void
}

const scramble = (e: React.MouseEvent<HTMLElement>, text: string) => {
  if (prefersReducedMotion()) return
  const el = e.currentTarget.querySelector('.nl')
  if (el) gsap.to(el, { duration: 0.55, scrambleText: { text, chars: 'abcdefghijklmnopqrstuvwxyz', speed: 0.7 }, overwrite: true })
}

export function Nav({ show, route, total, onGo, onPalette }: Props) {
  const profile = useProfile()
  const [active, setActive] = useState<string>('pulse')
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (route !== 'home') return
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-45% 0px -50% 0px' })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [route])

  const cur = route === 'archive' ? 'archive' : active

  return (
    <motion.header
      className={`nav ${scrolled ? 'is-scrolled' : ''}`}
      initial={{ y: -80, opacity: 0 }}
      animate={show ? { y: 0, opacity: 1 } : { y: -80, opacity: 0 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
    >
      <button className="nav-id" type="button" onClick={(e) => {
          if (e.detail) e.currentTarget.blur()
          onGo('pulse')
        }} aria-label="Back to top">
        <Me className="nav-mark" />
        <span className="nav-handle">
          {profile.handle}<span className="nav-slash">/</span>
          <b>open source</b>
        </span>
      </button>

      <div className="nav-center">
        <button className="kbd-btn mono" type="button" onClick={onPalette} aria-label="Open search">
          <Icon name="search" size={14} />
          <span>Search contributions…</span>
          <kbd>⌘K</kbd>
        </button>
      </div>

      <nav className="nav-links" aria-label="Sections">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={cur === s.id ? 'on' : ''} onClick={(e) => {
              if (e.detail) e.currentTarget.blur()
              onGo(s.id)
            }} onMouseEnter={(e) => scramble(e, s.label)}>
            {cur === s.id && <motion.i layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
            <span className="nl">{s.label}</span>
          </button>
        ))}
        <button type="button" className={`nav-archive ${cur === 'archive' ? 'on' : ''}`} onClick={(e) => {
            if (e.detail) e.currentTarget.blur()
            onGo('archive')
          }} onMouseEnter={(e) => scramble(e, 'Archive')}>
          {cur === 'archive' && <motion.i layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
          <span className="nl">Archive</span>
          <sup className="mono">{total}</sup>
        </button>
      </nav>
    </motion.header>
  )
}
