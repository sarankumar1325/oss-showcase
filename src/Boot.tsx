import { useEffect, useState } from 'react'
import type { Dataset } from './types'
import App from './App'
import { Loader } from './components/Loader'
import { ownerProfile, ProfileContext, requestedHandle, type Profile } from './lib/profile'
import { setTimeZone } from './lib/format'
import { snapshot } from './lib/useLiveData'

interface Ready {
  profile: Profile
  dataset: Dataset
}

/** The build snapshot can only be used when it was generated for the same handle and query. */
function fromSnapshot(): Ready | null {
  if (requestedHandle()) return null
  const profile = ownerProfile()
  if (!snapshot.handle || snapshot.handle.toLowerCase() !== profile.handle.toLowerCase() || snapshot.query !== profile.query) return null
  return { profile, dataset: { query: snapshot.query, prs: snapshot.prs, generatedAt: snapshot.generatedAt, source: 'snapshot' } }
}

/**
 * Decides whose portfolio to show and with what data:
 * the build snapshot (fork owner), or a live load from GitHub (?u=someone, or a fresh fork
 * whose snapshot has not been generated yet).
 */
export function Boot() {
  const [ready, setReady] = useState<Ready | null>(() => {
    const r = fromSnapshot()
    if (r) setTimeZone(r.profile.timeZone, r.profile.timeZoneLabel)
    return r
  })

  useEffect(() => {
    if (!ready) return
    const { profile } = ready
    document.title = `${profile.name} · open-source work`
    const desc = document.querySelector('meta[name="description"]')
    desc?.setAttribute('content', `${ready.dataset.prs.length} public pull requests by ${profile.name} merged into projects beyond their own.`)
    // the tab icon follows whoever is on screen
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!icon) {
      icon = document.createElement('link')
      icon.rel = 'icon'
      document.head.appendChild(icon)
    }
    icon.type = ''
    icon.href = profile.photo
  }, [ready])

  if (!ready)
    return (
      <Loader
        handle={requestedHandle()}
        onReady={(profile, dataset) => {
          setTimeZone(profile.timeZone, profile.timeZoneLabel)
          setReady({ profile, dataset })
        }}
      />
    )

  return (
    <ProfileContext.Provider value={ready.profile}>
      <App dataset={ready.dataset} />
    </ProfileContext.Provider>
  )
}
