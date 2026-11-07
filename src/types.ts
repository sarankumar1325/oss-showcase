/** 'Unknown' while a live-loaded owner has not been looked up yet. */
export type OwnerType = 'Organization' | 'User' | 'Unknown'

export interface PR {
  number: number
  title: string
  url: string
  owner: string
  ownerType: OwnerType
  repo: string
  mergedAt: string
  labels: string[]
}

export interface Snapshot {
  /** GitHub username this snapshot belongs to. */
  handle: string
  query: string
  count: number
  /** ISO time the snapshot was generated. */
  generatedAt: string
  prs: PR[]
}

/** What the app renders: a profile plus its starting dataset. */
export interface Dataset {
  query: string
  prs: PR[]
  generatedAt: string | null
  /** where the starting data came from */
  source: 'snapshot' | 'cache' | 'live'
}

export type SyncStatus = 'boot' | 'syncing' | 'live' | 'limited' | 'offline' | 'replay'

export interface LiveEvent {
  pr: PR
  /** true when the PR was discovered during the first catch-up sync (no fanfare) */
  silent: boolean
}

export interface Filter {
  q: string
  owner: string
  repo: string
  sort: 'newest' | 'oldest' | 'repo' | 'title'
}
