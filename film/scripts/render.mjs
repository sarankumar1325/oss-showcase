// Renders every frame on the GPU, streams them into ffmpeg, muxes the score.
//   node scripts/render.mjs            → out/oss-showcase-film.mp4
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { openFilm } from './browser.mjs'

mkdirSync('out', { recursive: true })
if (!existsSync('out/score.wav')) {
  console.error('out/score.wav missing: run `node scripts/score.mjs` first')
  process.exit(1)
}
const film = await openFilm()
const OUT = 'out/oss-showcase-film.mp4'
const ff = spawn(
  'ffmpeg',
  [
    '-y',
    '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(film.fps), '-c:v', 'mjpeg', '-i', '-',
    '-i', 'out/score.wav',
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-tune', 'film',
    '-c:a', 'aac', '-b:a', '256k',
    '-t', String(film.frames / film.fps),
    '-movflags', '+faststart',
    OUT,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
)
const t0 = Date.now()
for (let i = 0; i < film.frames; i++) {
  const jpg = await film.frame(i, 'image/jpeg', 0.97)
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r))
  if (i % 60 === 0) console.log(`frame ${i}/${film.frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}
ff.stdin.end()
await new Promise((r) => ff.on('close', r))
await film.close()
console.log('wrote', OUT, `in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
