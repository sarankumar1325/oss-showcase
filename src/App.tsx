import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Dataset, Filter } from './types'
import { derive } from './lib/derive'
import { archiveHash, EMPTY_FILTER, readHash, type RouteName } from './lib/filter'
import { useLiveData } from './lib/useLiveData'
import { writeData } from './lib/cache'
import { useProfile } from './lib/profile'
import { getToken, onTokenChange } from './lib/token'
import { TokenSheet } from './components/TokenSheet'
import { prefersReducedMotion, useNow, usePointerVars } from './lib/hooks'
import { initScroll, scrollToId, scrollTop, startScroll, stopScroll } from './lib/scroll'
import { ScrollTrigger } from './lib/gsap'
import { ShaderBackdrop } from './components/ShaderBackdrop'
import { Intro } from './components/Intro'
import { Nav } from './components/Nav'
import { Hero, Marquee } from './components/Hero'
import { Orbit } from './components/Orbit'
import { Rhythm } from './components/Rhythm'
import { Feed } from './components/Feed'
import { Ledger } from './components/Ledger'
import { ArchiveTeaser } from './components/ArchiveTeaser'
import { ArchivePage } from './components/ArchivePage'
import { About, Footer } from './components/About'
import { CommandPalette, Toasts } from './components/Overlays'
import { Cursor, Curtain, playCurtain, ScrollProgress, useRipple } from './components/Fx'

export default function App({ dataset }: { dataset: Dataset }) {
  const profile = useProfile()
  const initial = useMemo(() => readHash(), [])
  const skip = useMemo(() => prefersReducedMotion() || new URLSearchParams(location.search).has('skip') || initial.route === 'archive', [initial.route])
  const [route, setRoute] = useState<RouteName>(initial.route)
  const [revealed, setRevealed] = useState(skip)
  const [introDone, setIntroDone] = useState(skip)
  const [filter, setFilter] = useState<Filter>(initial.filter)
  const [palette, setPalette] = useState(false)
  const [tokenSheet, setTokenSheet] = useState(false)
  const [hasToken, setHasToken] = useState(!!getToken())

  const filterRef = useRef(filter)
  filterRef.current = filter
  const routeRef = useRef(route)
  routeRef.current = route

  const live = useLiveData(introDone, dataset)
  const d = useMemo(() => derive(live.prs), [live.prs])
  const syncNow = live.syncNow
  // a new or removed token takes effect right away
  useEffect(
    () =>
      onTokenChange(() => {
        setHasToken(!!getToken())
        syncNow()
      }),
    [syncNow],
  )
  const now = useNow(30_000)

  usePointerVars()
  useRipple()
  useEffect(() => initScroll(), [])

  useEffect(() => {
    if (introDone) {
      startScroll()
      document.documentElement.classList.remove('locked')
    } else {
      stopScroll()
      document.documentElement.classList.add('locked')
      window.scrollTo(0, 0)
    }
  }, [introDone])

  // every route change starts at the top with fresh scroll triggers
  useLayoutEffect(() => {
    scrollTop()
    const t = setTimeout(() => ScrollTrigger.refresh(), 120)
    return () => clearTimeout(t)
  }, [route])

  // browser back / forward
  useEffect(() => {
    const onHash = () => {
      const h = readHash()
      setRoute(h.route)
      if (h.route === 'archive') setFilter(h.filter)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // live-loaded portfolios (viewer mode, or a fork without a snapshot yet) stay cached in this browser
  useEffect(() => {
    if (dataset.source === 'snapshot' || live.replay) return
    const t = setTimeout(() => writeData(profile.handle, dataset.query, live.prs), 1500)
    return () => clearTimeout(t)
  }, [live.prs, live.replay, dataset, profile.handle])

  // a fresh merge makes the whole backdrop swell
  useEffect(
    () =>
      live.subscribe((e) => {
        if (!e.silent) window.dispatchEvent(new Event('oss:pulse'))
      }),
    [live.subscribe],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input,textarea,select')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setPalette((p) => !p)
      } else if (e.key === 'Escape') setPalette(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const reveal = useCallback(() => setRevealed(true), [])
  const done = useCallback(() => setIntroDone(true), [])

  /** Single navigation entry point: 'archive', 'pulse'|section id. Page swaps run behind a curtain. */
  const go = useCallback((target: string, next?: Filter) => {
    if (target === 'archive') {
      const f = next ?? filterRef.current
      if (routeRef.current === 'archive') {
        if (next) {
          setFilter(next)
          scrollToId('arch-results', -110)
        } else scrollTop()
        return
      }
      playCurtain(() => {
        setFilter(f)
        setRoute('archive')
        location.hash = archiveHash(f, 1, 20)
      })
      return
    }
    if (routeRef.current === 'archive') {
      playCurtain(
        () => {
          setRoute('home')
          location.hash = '#/'
        },
        () => {
          if (target !== 'pulse') setTimeout(() => scrollToId(target), 120)
        },
      )
      return
    }
    scrollToId(target)
  }, [])

  const pickRepo = useCallback((repo: string) => go('archive', { ...EMPTY_FILTER, owner: repo.split('/')[0], repo }), [go])
  const pickOwner = useCallback((owner: string) => go('archive', { ...EMPTY_FILTER, owner }), [go])
  const searchArchive = useCallback((q: string) => go('archive', { ...EMPTY_FILTER, q }), [go])
  const openArchive = useCallback(() => go('archive', EMPTY_FILTER), [go])

  const hs = route === 'archive' ? readHash() : null

  return (
    <>
      <ShaderBackdrop />
      <div className="veil" aria-hidden="true" />
      <ScrollProgress />
      <Cursor />

      <Nav show={revealed} route={route} total={d.total} onGo={go} onPalette={() => setPalette(true)} />

      {route === 'home' ? (
        <main>
          <Hero d={d} ready={revealed} now={now} />
          <Marquee d={d} />
          <Orbit d={d} onPick={pickRepo} subscribe={live.subscribe} />
          <Rhythm d={d} now={now} />
          <Feed d={d} fresh={live.fresh} status={live.status} syncing={live.syncing} lastSync={live.lastSync} nextSync={live.nextSync} syncNow={live.syncNow} replay={live.replay} limitedUntil={live.limitedUntil} tokenRejected={live.tokenRejected} hasToken={hasToken} onToken={() => setTokenSheet(true)} />
          <Ledger d={d} onRepo={pickRepo} onOwner={pickOwner} />
          <ArchiveTeaser prs={live.prs} d={d} now={now} onOpen={openArchive} />
          <About d={d} replay={live.replay} dataset={dataset} />
        </main>
      ) : (
        <main>
          <ArchivePage
            prs={live.prs}
            d={d}
            filter={filter}
            setFilter={setFilter}
            now={now}
            initialPage={hs?.page ?? 1}
            initialSize={hs?.size ?? 20}
            onHome={() => go('pulse')}
          />
          <div className="section" style={{ paddingTop: 0 }}>
            <Footer />
          </div>
        </main>
      )}

      <Toasts subscribe={live.subscribe} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} prs={live.prs} onGo={go} onSearchArchive={searchArchive} />
      <TokenSheet open={tokenSheet} onClose={() => setTokenSheet(false)} />
      <Curtain />
      {!introDone && <Intro prs={dataset.prs} onReveal={reveal} onDone={done} />}
    </>
  )
}
