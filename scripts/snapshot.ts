/**
 * Builds src/data/snapshot.json for the handle in portfolio.config.ts.
 *
 *   bun run snapshot              (writes src/data/snapshot.json)
 *   bun run snapshot --out x.json (writes somewhere else, for trying it out)
 *
 * A token is optional. Locally it works without one (slower, about 10 searches a minute).
 * In GitHub Actions the workflow passes the built-in GITHUB_TOKEN, so nothing needs setting up.
 * The token is only used for these requests and is never written anywhere.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import config from '../portfolio.config'
import { buildQuery, getUser, isHandle, resolveOwnerTypes, searchAll, setTokenSource } from '../src/lib/github'
import type { Snapshot } from '../src/types'

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null
setTokenSource(() => token)

const log = (...a: unknown[]) => console.log('[snapshot]', ...a)

async function main() {
  const handle = config.github
  if (!isHandle(handle)) throw new Error(`portfolio.config.ts: "${handle}" is not a valid GitHub username`)

  const user = await getUser(handle)
  if (user.type === 'Organization') throw new Error(`${handle} is an organization; use a personal account`)

  const query = buildQuery({ handle: user.login, includeOwnRepos: config.includeOwnRepos, excludeOwners: config.excludeOwners })
  log(`query: ${query}${token ? ' (authenticated)' : ' (no token: slower)'}`)

  let lastPct = -1
  const prs = await searchAll(query, {
    onProgress: (n, total) => {
      const pct = total ? Math.floor((n / total) * 10) * 10 : 0
      if (pct !== lastPct) log(`${n} / ${total}`)
      lastPct = pct
    },
    onWait: (until) => until && log(`rate limited, waiting ${Math.ceil((until - Date.now()) / 1000)}s`),
  })

  const owners = [...new Set(prs.map((p) => p.owner))]
  log(`${prs.length} merged PRs across ${owners.length} owners; resolving owner types`)
  // without a token, leave some of the 60/hour budget for browsing the site afterwards
  const types = await resolveOwnerTypes(owners, { keep: token ? 2 : 20 })
  for (const p of prs) p.ownerType = types.get(p.owner) ?? 'Unknown'
  const unknown = owners.filter((o) => !types.has(o)).length
  if (unknown) log(`${unknown} owner types unresolved (rate limit); the site resolves them in the browser later`)

  prs.sort((a, b) => b.mergedAt.localeCompare(a.mergedAt) || b.number - a.number)
  const snapshot: Snapshot = { handle: user.login, query, count: prs.length, generatedAt: new Date().toISOString(), prs }
  const flag = process.argv.indexOf('--out')
  const out = flag > 0 && process.argv[flag + 1] ? process.argv[flag + 1] : fileURLToPath(new URL('../src/data/snapshot.json', import.meta.url))
  writeFileSync(out, JSON.stringify(snapshot))
  log(`wrote ${out}`)
}

main().catch((e) => {
  console.error('[snapshot] failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
