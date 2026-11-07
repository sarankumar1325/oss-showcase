// Render chosen moments (in seconds) to out/snap/ as PNGs, plus a contact sheet.
//   node scripts/snap.mjs 1.2 3.4 ...
import { mkdirSync, writeFileSync } from 'node:fs'
import { openFilm } from './browser.mjs'
const times = process.argv.slice(2).map(Number)
mkdirSync('out/snap', { recursive: true })
const film = await openFilm()
const t0 = Date.now()
for (const s of times) {
  const f = Math.round(s * film.fps)
  writeFileSync(`out/snap/t${s.toFixed(2).padStart(5, '0')}.png`, await film.frame(f, 'image/png'))
  console.log('snap', s)
}
console.log('avg ms/frame', Math.round((Date.now() - t0) / times.length))
await film.close()
