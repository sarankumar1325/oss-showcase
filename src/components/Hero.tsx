import { useEffect, useRef } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import type { Derived } from '../lib/derive'
import { ago } from '../lib/format'
import { scrollToId } from '../lib/scroll'
import { gsap, isFinePointer, ScrollTrigger } from '../lib/gsap'
import { prefersReducedMotion } from '../lib/hooks'
import { CountUp, EASE, Icon, Magnetic, Odometer } from './ui'
import { useProfile } from '../lib/profile'

const container = { hidden: {}, show: { transition: { staggerChildren: 0.13, delayChildren: 0.05 } } }
const item = {
  hidden: { opacity: 0, y: 36, filter: 'blur(14px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 1.2, ease: EASE } },
}

export function Hero({ d, ready, now }: { d: Derived; ready: boolean; now: number }) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [0, -140])
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9])
  const latest = d.newest[0]
  const profile = useProfile()

  useEffect(() => {
    const el = ref.current
    if (!el || !isFinePointer() || prefersReducedMotion()) return
    const odo = el.querySelector<HTMLElement>('.hero-number .odo')
    const glow = el.querySelector<HTMLElement>('.hero-number-glow')
    if (!odo || !glow) return
    gsap.set(odo, { transformPerspective: 900 })
    const ox = gsap.quickTo(odo, 'x', { duration: 1, ease: 'power3' })
    const oy = gsap.quickTo(odo, 'y', { duration: 1, ease: 'power3' })
    const orx = gsap.quickTo(odo, 'rotationX', { duration: 1.1, ease: 'power3' })
    const ory = gsap.quickTo(odo, 'rotationY', { duration: 1.1, ease: 'power3' })
    const gx = gsap.quickTo(glow, 'x', { duration: 1.4, ease: 'power3' })
    const gy = gsap.quickTo(glow, 'y', { duration: 1.4, ease: 'power3' })
    const move = (e: PointerEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      ox(nx * -26)
      oy(ny * -16)
      ory(nx * 9)
      orx(ny * -7)
      gx(nx * 60)
      gy(ny * 36)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [])

  return (
    <section id="pulse" className="hero" ref={ref}>
      <motion.div className="hero-inner" style={{ y, opacity, scale }} variants={container} initial="hidden" animate={ready ? 'show' : 'hidden'}>
        <motion.div className="hero-number" variants={item}>
          <Odometer value={d.total} run={ready} delay={0.35} />
          <span className="hero-number-glow" aria-hidden="true" />
        </motion.div>

        <motion.h1 className="hero-title" variants={item}>
          Merged into projects <em>beyond</em> {profile.isOwner ? 'my' : 'their'}&nbsp;own
        </motion.h1>

        <motion.p className="hero-sub" variants={item}>
          Public pull requests by <strong>{profile.name}</strong>, accepted by external maintainers — streaming in as they land.
        </motion.p>

        <motion.div className="hero-stats" variants={item}>
          <div className="hero-stat">
            <Icon name="repo" size={18} />
            <strong>
              <CountUp value={d.repoGroups.length} run={ready} delay={0.8} />
            </strong>
            <span className="mono">repositories</span>
          </div>
          <div className="hero-stat">
            <Icon name="org" size={18} />
            <strong>{d.unknownCount ? '…' : <CountUp value={d.orgCount} run={ready} delay={0.95} />}</strong>
            <span className="mono" title={d.unknownCount ? `${d.unknownCount} owners are still being looked up on GitHub` : undefined}>
              {d.unknownCount ? 'organizations · resolving' : 'organizations'}
            </span>
          </div>
          <div className="hero-stat">
            <Icon name="users" size={18} />
            <strong>
              <CountUp value={d.ownerGroups.length} run={ready} delay={1.1} />
            </strong>
            <span className="mono">owners</span>
          </div>
        </motion.div>

        <motion.div className="hero-cta" variants={item}>
          <Magnetic>
            <button type="button" className="btn btn-primary" onClick={() => scrollToId('orbit')}>
              Enter the orbit <span aria-hidden="true">↓</span>
            </button>
          </Magnetic>
          <Magnetic>
            <a className="btn btn-ghost" href={`https://github.com/${profile.handle}`} target="_blank" rel="noopener noreferrer">
              GitHub profile <Icon name="arrow" size={14} />
            </a>
          </Magnetic>
        </motion.div>

        {latest && (
          <motion.a className="hero-latest" variants={item} href={latest.url} target="_blank" rel="noopener noreferrer">
            <span className="hero-latest-tag mono">
              <Icon name="merge" size={13} /> Latest merge · {ago(latest.mergedAt, now)}
            </span>
            <span className="hero-latest-text">
              <b className="mono">
                {latest.owner}/{latest.repo}
              </b>{' '}
              {latest.title}
            </span>
          </motion.a>
        )}
      </motion.div>

      <motion.div className="scroll-cue mono" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ delay: 2.2, duration: 1 }}>
        <span>Scroll</span>
        <i />
      </motion.div>
    </section>
  )
}

export function Marquee({ d }: { d: Derived }) {
  const track = useRef<HTMLDivElement>(null)
  const names = d.repoGroups.slice(0, 26)

  useEffect(() => {
    const el = track.current
    if (!el || prefersReducedMotion()) return
    const loop = gsap.to(el, { xPercent: -50, ease: 'none', duration: 90, repeat: -1 })
    const skew = gsap.quickTo(el, 'skewX', { duration: 0.5, ease: 'power3' })
    const idle = gsap.delayedCall(0.12, () => skew(0))
    const st = ScrollTrigger.create({
      onUpdate: (self) => {
        const v = self.getVelocity()
        const dir = v < 0 ? -1 : 1
        gsap.timeline().to(loop, { timeScale: dir * Math.min(14, 1 + Math.abs(v) / 180), duration: 0.2, overwrite: true }).to(loop, { timeScale: 1, duration: 1.4 })
        skew(Math.max(-12, Math.min(12, v / -220)))
        idle.restart(true)
      },
    })
    const pause = () => gsap.to(loop, { timeScale: 0, duration: 0.6 })
    const play = () => gsap.to(loop, { timeScale: 1, duration: 0.6 })
    el.addEventListener('pointerenter', pause)
    el.addEventListener('pointerleave', play)
    return () => {
      st.kill()
      loop.kill()
      idle.kill()
      el.removeEventListener('pointerenter', pause)
      el.removeEventListener('pointerleave', play)
    }
  }, [])

  const row = (k: string) => (
    <div className="marquee-row" aria-hidden={k === 'b'} key={k}>
      {names.map(([name, n]) => (
        <span key={k + name} className="marquee-item mono">
          <i /> {name} <sup>{n}</sup>
        </span>
      ))}
    </div>
  )
  return (
    <div className="marquee" aria-label="Most contributed repositories">
      <div className="marquee-track" ref={track}>
        {row('a')}
        {row('b')}
      </div>
    </div>
  )
}
