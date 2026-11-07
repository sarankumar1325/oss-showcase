import { createContext, useContext } from 'react'
import config from '../../portfolio.config'
import { buildQuery, isHandle } from './github'
import { localTimeZone } from './format'

/** Who the site is showing right now. */
export interface Profile {
  handle: string
  name: string
  /** photo URL: configured file, or the GitHub avatar */
  photo: string
  timeZone: string
  timeZoneLabel?: string
  query: string
  /** true when showing the site owner's own portfolio (not ?u=) */
  isOwner: boolean
}

export const OWNER = config

const avatar = (handle: string) => `https://github.com/${encodeURIComponent(handle)}.png?size=256`

const photoUrl = (photo: string | null, handle: string) => {
  if (!photo) return avatar(handle)
  if (/^https:\/\//.test(photo)) return photo
  return `${import.meta.env.BASE_URL}${photo.replace(/^\//, '')}`
}

export function ownerProfile(): Profile {
  return {
    handle: config.github,
    name: config.name || config.github,
    photo: photoUrl(config.photo, config.github),
    timeZone: config.timeZone || localTimeZone(),
    timeZoneLabel: config.timeZoneLabel,
    query: buildQuery({ handle: config.github, includeOwnRepos: config.includeOwnRepos, excludeOwners: config.excludeOwners }),
    isOwner: true,
  }
}

/** ?u=<username> → someone else's portfolio, if the owner allows it. */
export function requestedHandle(): string | null {
  if (!config.allowViewer) return null
  const u = new URLSearchParams(location.search).get('u')?.trim().replace(/^@/, '')
  if (!u || u.toLowerCase() === config.github.toLowerCase()) return null
  return u
}

export function viewerProfile(handle: string, name?: string | null): Profile {
  return {
    handle,
    name: name || handle,
    photo: avatar(handle),
    timeZone: localTimeZone(),
    query: buildQuery({ handle }),
    isOwner: false,
  }
}

export const validHandle = isHandle

/** Link to another person's portfolio on this same site. */
export function viewerHref(handle: string | null) {
  const url = new URL(location.href)
  url.hash = ''
  if (handle) url.searchParams.set('u', handle)
  else url.searchParams.delete('u')
  url.searchParams.delete('demo')
  return url.pathname + url.search
}

export const ProfileContext = createContext<Profile>(ownerProfile())
export const useProfile = () => useContext(ProfileContext)
