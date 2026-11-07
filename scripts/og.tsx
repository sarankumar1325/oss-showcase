/**
 * Renders public/og-<handle>.png, the link-preview card (1200×630) for this deployment's owner.
 *
 *   bun run og
 *
 * Reads src/data/snapshot.json (run `bun run snapshot` first) and portfolio.config.ts.
 * Text is converted to vector paths by satori, so no system fonts are needed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import config from '../portfolio.config'
import { dayKey, setTimeZone } from '../src/lib/format'
import type { Snapshot } from '../src/types'

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const font = (pkg: string, file: string) => readFileSync(root(`node_modules/@fontsource/${pkg}/files/${file}`))

const C = { bg: '#0b0d14', card: '#11141c', raised: '#1a1e28', ink: '#eef0f5', ink2: '#a3a9b8', mute: '#7a8296', line: 'rgba(238,240,245,0.08)', bar: '#3a4254', accent: '#5fd49b' }

async function photoData(): Promise<string> {
  const p = config.photo
  if (p && !/^https:\/\//.test(p)) {
    const file = root(`public/${p.replace(/^\//, '')}`)
    if (existsSync(file)) {
      const ext = file.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
      return `data:image/${ext};base64,${readFileSync(file).toString('base64')}`
    }
  }
  const url = p && /^https:\/\//.test(p) ? p : `https://github.com/${config.github}.png?size=200`
  const res = await fetch(url)
  const type = res.headers.get('content-type') ?? 'image/png'
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
}

/** Merge activity in up to 40 buckets from the first merge until today. */
function buckets(s: Snapshot) {
  if (!s.prs.length) return []
  const keys = s.prs.map((p) => dayKey(p.mergedAt)).sort()
  const start = Date.parse(keys[0] + 'T00:00:00Z')
  const end = Date.parse(dayKey(Date.now()) + 'T00:00:00Z')
  const days = Math.round((end - start) / 86_400_000) + 1
  const n = Math.min(40, days)
  const out = new Array<number>(n).fill(0)
  for (const k of keys) {
    const i = Math.min(n - 1, Math.floor(((Date.parse(k + 'T00:00:00Z') - start) / 86_400_000 / days) * n))
    out[i]++
  }
  return out
}

async function main() {
  const snap = JSON.parse(readFileSync(root('src/data/snapshot.json'), 'utf8')) as Snapshot
  if (snap.handle?.toLowerCase() !== config.github.toLowerCase()) {
    console.warn(`[og] snapshot is for ${snap.handle}, not ${config.github}; run \`bun run snapshot\` first. Skipping.`)
    return
  }
  setTimeZone(config.timeZone, config.timeZoneLabel)
  const repos = new Set(snap.prs.map((p) => `${p.owner}/${p.repo}`)).size
  const bars = buckets(snap)
  const max = Math.max(1, ...bars)
  const peak = bars.indexOf(max)
  const photo = await photoData()
  const total = snap.prs.length.toLocaleString('en-US')

  const card = (
    <div style={{ position: 'relative', width: 1200 - 128, height: 630 - 128, display: 'flex', flexDirection: 'column', padding: 64, background: C.bg, color: C.ink, fontFamily: 'Geist' }}>
      <div style={{ display: 'flex', height: 32, flexShrink: 0, fontFamily: 'Geist Mono', fontSize: 22, color: C.mute }}>
        <span style={{ color: C.accent, marginRight: 12 }}>$</span>
        gh search prs --author {snap.handle} --merged
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginTop: 72 }}>
        <div style={{ display: 'flex', fontSize: 180, lineHeight: 1, letterSpacing: -7 }}>{total}</div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 40, lineHeight: 1.2, paddingTop: 24, letterSpacing: -1 }}>
          <span>merged pull requests</span>
          <span style={{ color: C.ink2 }}>
            into {repos} {repos === 1 ? 'repository' : 'repositories'}
            <span style={{ color: C.accent, marginLeft: 10 }}>beyond</span>
            <span style={{ marginLeft: 10 }}>their own</span>
          </span>
        </div>
      </div>

      <div style={{ position: 'absolute', left: 64, right: 64, bottom: 64, display: 'flex', height: 96, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img src={photo} width={72} height={72} style={{ borderRadius: 36, border: `1px solid ${C.line}` }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 500 }}>{config.name || snap.handle}</span>
            <span style={{ fontFamily: 'Geist Mono', fontSize: 20, color: C.mute }}>github.com/{snap.handle}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 96 }}>
          {bars.map((n, i) => (
            <div key={i} style={{ width: Math.max(6, Math.floor(440 / Math.max(bars.length, 1)) - 4), height: Math.max(n ? 6 : 2, Math.round((n / max) * 96)), borderRadius: 3, background: i === peak ? C.accent : n ? C.bar : C.raised }} />
          ))}
        </div>
      </div>
    </div>
  )

  const svg = await satori(card, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Geist', data: font('geist', 'geist-latin-400-normal.woff'), weight: 400, style: 'normal' },
      { name: 'Geist', data: font('geist', 'geist-latin-500-normal.woff'), weight: 500, style: 'normal' },
      { name: 'Geist Mono', data: font('geist-mono', 'geist-mono-latin-400-normal.woff'), weight: 400, style: 'normal' },
    ],
  })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
  // named per handle so a fork never ships someone else's card
  const out = root(`public/og-${snap.handle.toLowerCase()}.png`)
  writeFileSync(out, png)
  console.log(`[og] wrote ${out} (${Math.round(png.length / 1024)} KB)`)
}

main().catch((e) => {
  console.error('[og] failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
