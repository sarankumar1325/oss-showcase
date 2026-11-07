import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { RouteName } from '../lib/filter'
import { OWNER, useProfile } from '../lib/profile'
import { EASE, Icon, Me } from './ui'
import { ViewAnother } from './ViewAnother'

export const SECTIONS = [
  { id: 'pulse', label: 'Pulse' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'rhythm', label: 'Rhythm' },
  { id: 'feed', label: 'Live' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'about', label: 'About' },
] as const

/** The logo already goes to the top, so the bar lists the sections below it. */
const LINKS = SECTIONS.filter((s) => s.id !== 'pulse')

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

interface Props {
  show: boolean
  route: RouteName
  total: number
  onGo: (target: string) => void
  onPalette: () => void
}

/** Small anchored panel: closes on Escape, outside click, or when asked. */
function Popover({ open, onClose, children, className = '' }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current && !ref.current.contains(t) && !(t as Element).closest?.('[data-pop-trigger]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className={`nav-pop ${className}`}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: EASE }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Nav({ show, route, total, onGo, onPalette }: Props) {
  const profile = useProfile()
  const [active, setActive] = useState<string>('pulse')
  const [scrolled, setScrolled] = useState(false)
  const [pop, setPop] = useState<null | 'yours' | 'menu'>(null)
  const close = () => setPop(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
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

  // the "see yours" field gets focus as soon as it opens
  useEffect(() => {
    if (pop !== 'yours') return
    const t = setTimeout(() => document.querySelector<HTMLInputElement>('.nav-pop [data-view-another]')?.focus(), 40)
    return () => clearTimeout(t)
  }, [pop])

  const cur = route === 'archive' ? 'archive' : active
  const go = (id: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail) e.currentTarget.blur()
    close()
    onGo(id)
  }
  const indicator = <motion.i layoutId="nav-active" className="nav-active" transition={{ duration: 0.22, ease: EASE }} />

  return (
    <motion.header
      className={`nav ${scrolled ? 'is-scrolled' : ''}`}
      initial={{ opacity: 0, y: -8 }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: EASE, delay: 0.1 }}
    >
      <div className="nav-in">
        <button className="nav-id" type="button" onClick={go('pulse')} aria-label={`${profile.name}, back to top`}>
          <Me size={28} className="nav-avatar" />
          <span className="nav-handle">
            <span className="nav-user">{profile.handle}</span>
            <span className="nav-slash" aria-hidden="true">
              /
            </span>
            <span>open source</span>
          </span>
        </button>

        <button className="nav-search" type="button" onClick={onPalette} aria-label="Search contributions" aria-keyshortcuts={isMac() ? 'Meta+K' : 'Control+K'}>
          <Icon name="search" size={14} />
          <span className="nav-search-label">Search</span>
          <kbd className="mono">{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
        </button>

        <nav className="nav-links" aria-label="Sections">
          {LINKS.map((s) => (
            <button key={s.id} type="button" className={cur === s.id ? 'on' : ''} aria-current={cur === s.id ? 'location' : undefined} onClick={go(s.id)}>
              {cur === s.id && indicator}
              <span>{s.label}</span>
            </button>
          ))}
          <button type="button" className={cur === 'archive' ? 'on' : ''} aria-current={cur === 'archive' ? 'page' : undefined} onClick={go('archive')}>
            {cur === 'archive' && indicator}
            <span>Archive</span>
            <span className="nav-count mono">{total}</span>
          </button>
        </nav>

        <div className="nav-actions">
          <div className="nav-anchor">
            <button type="button" className="nav-menu-btn" data-pop-trigger aria-expanded={pop === 'menu'} aria-haspopup="menu" onClick={() => setPop((p) => (p === 'menu' ? null : 'menu'))}>
              Menu
            </button>
            <Popover open={pop === 'menu'} onClose={close} className="nav-pop-menu">
              <ul role="menu">
                {SECTIONS.map((s) => (
                  <li key={s.id} role="none">
                    <button type="button" role="menuitem" className={cur === s.id ? 'on' : ''} onClick={go(s.id)}>
                      {s.label}
                    </button>
                  </li>
                ))}
                <li role="none">
                  <button type="button" role="menuitem" className={cur === 'archive' ? 'on' : ''} onClick={go('archive')}>
                    Archive <span className="nav-count mono">{total}</span>
                  </button>
                </li>
              </ul>
            </Popover>
          </div>

          {OWNER.allowViewer && (
          <div className="nav-anchor">
            <button type="button" className="nav-yours" data-pop-trigger aria-expanded={pop === 'yours'} aria-haspopup="dialog" onClick={() => setPop((p) => (p === 'yours' ? null : 'yours'))}>
              {profile.isOwner ? 'See yours' : 'See another'}
            </button>
            <Popover open={pop === 'yours'} onClose={close} className="nav-pop-yours">
              <ViewAnother label={profile.isOwner ? 'See anyone’s merged open-source work' : 'See someone else’s work'} />
            </Popover>
          </div>
          )}
        </div>
      </div>
    </motion.header>
  )
}
