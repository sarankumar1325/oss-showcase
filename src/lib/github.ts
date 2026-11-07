/**
 * Tiny GitHub client shared by the browser and the snapshot script.
 *
 * - Only ever talks to https://api.github.com.
 * - A token is optional. With none, public data still works, just with lower rate limits.
 * - In the browser the token lives only in this visitor's storage (see token.ts).
 */
import type { OwnerType, PR } from '../types'

const API = 'https://api.github.com'
const HANDLE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i

export const isHandle = (s: string) => HANDLE.test(s)

export class RateLimitError extends Error {
  until: number
  constructor(until: number) {
    super('GitHub rate limit reached')
    this.until = until
  }
}
export class NotFoundError extends Error {}
export class AuthError extends Error {}

export interface RateInfo {
  limit: number
  remaining: number
  reset: number
  resource: string
}

type TokenSource = () => string | null
let tokenSource: TokenSource = () => null
/** Where requests get their (optional) token from. */
export const setTokenSource = (fn: TokenSource) => {
  tokenSource = fn
}

const rateListeners = new Set<(r: RateInfo) => void>()
export const rates: Record<string, RateInfo> = {}
export const onRate = (fn: (r: RateInfo) => void) => {
  rateListeners.add(fn)
  return () => {
    rateListeners.delete(fn)
  }
}

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  const t = tokenSource()
  if (t) h.Authorization = `Bearer ${t}`
  if (json) h['Content-Type'] = 'application/json'
  return h
}

function track(res: Response) {
  const limit = Number(res.headers.get('x-ratelimit-limit'))
  if (!limit) return
  const r: RateInfo = {
    limit,
    remaining: Number(res.headers.get('x-ratelimit-remaining')),
    reset: Number(res.headers.get('x-ratelimit-reset')) * 1000,
    resource: res.headers.get('x-ratelimit-resource') ?? 'core',
  }
  rates[r.resource] = r
  rateListeners.forEach((fn) => fn(r))
}

async function request(path: string, init: RequestInit = {}) {
  const res = await fetch(API + path, { ...init, headers: { ...headers(!!init.body), ...(init.headers as Record<string, string>) } })
  track(res)
  if (res.status === 401) throw new AuthError('GitHub rejected the token')
  if (res.status === 404) throw new NotFoundError('Not found')
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    const retry = Number(res.headers.get('retry-after')) * 1000
    const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000
    if (remaining === '0' || retry || res.status === 429) {
      throw new RateLimitError(Date.now() + (retry || Math.max(1000, reset - Date.now()) || 60_000))
    }
  }
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`)
  return res.json()
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

/** Retries through rate limits, telling the caller how long it is waiting. */
async function patient<T>(run: () => Promise<T>, opts: LoadOpts): Promise<T> {
  for (;;) {
    try {
      return await run()
    } catch (e) {
      if (!(e instanceof RateLimitError)) throw e
      opts.onWait?.(e.until)
      await sleep(Math.max(1000, e.until - Date.now() + 1000), opts.signal)
      opts.onWait?.(null)
    }
  }
}

/* ----------------------------------------------------------------- query */

export interface QueryOpts {
  handle: string
  includeOwnRepos?: boolean
  excludeOwners?: string[]
}

export function buildQuery({ handle, includeOwnRepos = false, excludeOwners = [] }: QueryOpts) {
  const parts = [`author:${handle}`, 'is:pr', 'is:merged']
  if (!includeOwnRepos) parts.push(`-user:${handle}`)
  for (const o of excludeOwners) if (isHandle(o)) parts.push(`-user:${o}`)
  parts.push('is:public')
  return parts.join(' ')
}

/* ---------------------------------------------------------------- search */

export interface GhItem {
  number: number
  title: string
  html_url: string
  repository_url: string
  labels: { name: string }[]
  pull_request?: { merged_at: string | null }
}

export function toPR(it: GhItem, ownerType: OwnerType = 'Unknown'): PR | null {
  const merged = it.pull_request?.merged_at
  const m = it.repository_url.match(/repos\/([^/]+)\/([^/]+)$/)
  if (!merged || !m) return null
  return { number: it.number, title: it.title, url: it.html_url, owner: m[1], repo: m[2], ownerType, mergedAt: merged, labels: it.labels.map((l) => l.name) }
}

export interface SearchPage {
  total_count: number
  incomplete_results: boolean
  items: GhItem[]
}

export const searchPage = (q: string, page: number, perPage: number, signal?: AbortSignal, sort = 'updated') =>
  request(`/search/issues?q=${encodeURIComponent(q)}&sort=${sort}&order=desc&per_page=${perPage}&page=${page}`, { signal }) as Promise<SearchPage>

export interface LoadOpts {
  signal?: AbortSignal
  /** called with an epoch ms while waiting out a rate limit, then null */
  onWait?: (until: number | null) => void
  /** called as results arrive */
  onProgress?: (loaded: number, total: number) => void
}

const CAP = 1000
const PER = 100
const day = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * Every merged PR matching the query. GitHub search stops at 1,000 results per query,
 * so bigger histories are split into merge-date windows until each fits.
 */
export async function searchAll(q: string, opts: LoadOpts = {}): Promise<PR[]> {
  const out = new Map<string, PR>()
  const first = await patient(() => searchPage(q, 1, PER, opts.signal), opts)
  const total = first.total_count
  const add = (items: GhItem[]) => {
    for (const it of items) {
      const p = toPR(it)
      if (p) out.set(p.url, p)
    }
    opts.onProgress?.(out.size, total)
  }
  add(first.items)

  const pageThrough = async (query: string, count: number, startPage: number) => {
    for (let page = startPage; page <= Math.ceil(Math.min(count, CAP) / PER); page++) {
      const r = await patient(() => searchPage(query, page, PER, opts.signal), opts)
      add(r.items)
      if (r.items.length < PER) break
    }
  }

  if (total <= CAP) {
    await pageThrough(q, total, 2)
    return [...out.values()]
  }

  // split by merge date: [from, to] inclusive days
  const split = async (from: number, to: number): Promise<void> => {
    const wq = `${q} merged:${day(from)}..${day(to)}`
    const probe = await patient(() => searchPage(wq, 1, PER, opts.signal), opts)
    add(probe.items)
    if (probe.total_count <= CAP || to - from < 86_400_000) {
      await pageThrough(wq, probe.total_count, 2)
      return
    }
    const mid = from + Math.floor((to - from) / 2 / 86_400_000) * 86_400_000
    await split(from, mid)
    await split(mid + 86_400_000, to)
  }
  await split(Date.UTC(2008, 0, 1), Date.now())
  return [...out.values()]
}

/* ------------------------------------------------------------ owner types */

/** One GraphQL call per 100 owners. Needs a token (GraphQL has no anonymous access). */
async function ownerTypesGraphQL(owners: string[], opts: LoadOpts) {
  const found = new Map<string, OwnerType>()
  for (let i = 0; i < owners.length; i += 100) {
    const chunk = owners.slice(i, i + 100).filter(isHandle)
    if (!chunk.length) continue
    const body = `query { ${chunk.map((o, j) => `o${j}: repositoryOwner(login: ${JSON.stringify(o)}) { __typename }`).join(' ')} }`
    const r = (await patient(() => request('/graphql', { method: 'POST', body: JSON.stringify({ query: body }), signal: opts.signal }), opts)) as {
      data?: Record<string, { __typename: string } | null>
    }
    chunk.forEach((o, j) => {
      const t = r.data?.[`o${j}`]?.__typename
      if (t === 'User' || t === 'Organization') found.set(o, t)
    })
  }
  return found
}

/**
 * Organization vs individual for each owner. With a token: batched GraphQL.
 * Without: one REST call per owner, stopping while a few requests of the hourly budget remain.
 */
export async function resolveOwnerTypes(owners: string[], opts: LoadOpts & { keep?: number } = {}) {
  const keep = opts.keep ?? 6
  if (tokenSource()) {
    try {
      return await ownerTypesGraphQL(owners, opts)
    } catch (e) {
      if (e instanceof AuthError) throw e
      /* fall back to REST below */
    }
  }
  const found = new Map<string, OwnerType>()
  for (const o of owners) {
    if (!isHandle(o)) continue
    const core = rates.core
    if (core && core.remaining <= keep && core.reset > Date.now()) break
    try {
      const j = (await request(`/users/${encodeURIComponent(o)}`, { signal: opts.signal })) as { type?: string }
      found.set(o, j.type === 'User' ? 'User' : 'Organization')
    } catch (e) {
      if (e instanceof RateLimitError) break
      if (e instanceof AuthError) throw e
      if ((e as Error).name === 'AbortError') throw e
    }
  }
  return found
}

/* --------------------------------------------------------------- profile */

export interface GhUser {
  login: string
  name: string | null
  avatar_url: string
  type: 'User' | 'Organization' | string
  html_url: string
}

export const getUser = (handle: string, opts: LoadOpts = {}) => patient(() => request(`/users/${encodeURIComponent(handle)}`, { signal: opts.signal }) as Promise<GhUser>, opts)
