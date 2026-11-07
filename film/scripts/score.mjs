// The score: synthesized from scratch, timed to the film. Writes out/score.wav (48 kHz stereo).
//   node scripts/score.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

const SR = 48000
const DUR = 30.6
const N = Math.ceil(DUR * SR)
const L = new Float32Array(N)
const R = new Float32Array(N)
const sendL = new Float32Array(N) // reverb bus
const sendR = new Float32Array(N)

let seed = 99
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12)
const at = (s) => Math.floor(s * SR)
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

function put(i, l, r, send = 0) {
  if (i < 0 || i >= N) return
  L[i] += l
  R[i] += r
  sendL[i] += l * send
  sendR[i] += r * send
}

/** band-limited saw from harmonics (cheap enough for a 30 s piece) */
function saw(phase, f, maxH = 24) {
  let s = 0
  const H = Math.min(maxH, Math.floor(16000 / f))
  for (let h = 1; h <= H; h++) s += Math.sin(phase * h) / h
  return s * 0.6
}

/** Chamberlin state-variable low-pass, per voice */
function svf() {
  let lp = 0
  let bp = 0
  return (x, fc, q = 0.7) => {
    const f = 2 * Math.sin((Math.PI * Math.min(fc, SR / 6)) / SR)
    const hp = x - lp - q * bp
    bp += f * hp
    lp += f * bp
    return lp
  }
}

/* ------------------------------------------------------------------ voices */

/** A braam: stacked detuned saws, filter blooming open then closing, long tail. */
function braam(t0, notes, { dur = 2.4, gain = 0.5, bright = 2600, send = 0.45 } = {}) {
  for (const n of notes) {
    for (const det of [-0.11, 0, 0.09]) {
      const f = midi(n + det)
      const filt = svf()
      let ph = Math.random() * 6.28
      const pan = 0.5 + det * 3
      for (let i = 0; i < dur * SR; i++) {
        const t = i / SR
        ph += (2 * Math.PI * f) / SR
        const env = Math.min(1, t / 0.035) * Math.exp(-t / (dur * 0.42))
        const fc = 180 + bright * Math.exp(-t * 2.2) * Math.min(1, t / 0.06)
        const s = filt(saw(ph, f), fc, 0.55) * env * gain * 0.33
        put(at(t0) + i, s * (1 - pan * 0.5), s * (0.5 + pan * 0.5), send)
      }
    }
  }
  sub(t0, 30, 1.8, gain * 1.6)
  impact(t0, gain)
}

function sub(t0, startHz, dur, gain) {
  let ph = 0
  for (let i = 0; i < dur * SR; i++) {
    const t = i / SR
    const f = startHz + 70 * Math.exp(-t * 14)
    ph += (2 * Math.PI * f) / SR
    const s = Math.sin(ph) * Math.min(1, t / 0.004) * Math.exp(-t / (dur * 0.35)) * gain
    put(at(t0) + i, s, s, 0.05)
  }
}

function impact(t0, gain) {
  const filt = svf()
  for (let i = 0; i < 0.9 * SR; i++) {
    const t = i / SR
    const s = filt(rnd(), 3200 * Math.exp(-t * 5) + 200, 0.9) * Math.exp(-t * 7) * gain * 0.9
    put(at(t0) + i, s, s * 0.95, 0.7)
  }
}

function kick(t0, gain = 0.7) {
  let ph = 0
  for (let i = 0; i < 0.45 * SR; i++) {
    const t = i / SR
    ph += (2 * Math.PI * (44 + 120 * Math.exp(-t * 30))) / SR
    const s = Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t * 7.5) * gain
    put(at(t0) + i, s, s, 0.03)
  }
}

function clap(t0, gain = 0.25) {
  const filt = svf()
  for (let i = 0; i < 0.3 * SR; i++) {
    const t = i / SR
    const e = Math.exp(-t * 28) + 0.5 * Math.exp(-Math.max(0, t - 0.011) * 26) * (t > 0.011 ? 1 : 0) + 0.3 * Math.exp(-Math.max(0, t - 0.022) * 18) * (t > 0.022 ? 1 : 0)
    const s = filt(rnd(), 2400, 1.2) * e * gain
    put(at(t0) + i, s * 0.9, s, 0.35)
  }
}

function hat(t0, gain = 0.06, open = false) {
  let prev = 0
  for (let i = 0; i < (open ? 0.18 : 0.04) * SR; i++) {
    const t = i / SR
    const n = rnd()
    const s = (n - prev) * Math.exp(-t * (open ? 22 : 90)) * gain
    prev = n
    put(at(t0) + i, s * 0.8, s, 0.1)
  }
}

/** plucked arp note */
function pluck(t0, n, gain = 0.12, bright = 3200, send = 0.35) {
  const f = midi(n)
  const filt = svf()
  let ph = 0
  const pan = 0.5 + 0.35 * Math.sin(n * 1.7)
  for (let i = 0; i < 0.6 * SR; i++) {
    const t = i / SR
    ph += (2 * Math.PI * f) / SR
    const s = filt(saw(ph, f, 16), 300 + bright * Math.exp(-t * 14), 0.8) * Math.min(1, t / 0.002) * Math.exp(-t * 6) * gain
    put(at(t0) + i, s * (1 - pan), s * pan, send)
  }
}

/** glassy chime for the galaxy rebuild */
function chime(t0, n, gain = 0.07) {
  const f = midi(n)
  for (let i = 0; i < 1.6 * SR; i++) {
    const t = i / SR
    const e = Math.min(1, t / 0.003) * Math.exp(-t * 2.4)
    const s = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 6)) * e * gain
    put(at(t0) + i, s * (0.5 + 0.4 * Math.sin(n)), s * (0.5 - 0.4 * Math.sin(n)), 0.6)
  }
}

/** sustained pad chord with slow attack */
function pad(t0, dur, notes, gain = 0.05, fc = 1200, send = 0.5) {
  for (const n of notes) {
    for (const det of [-0.08, 0.07]) {
      const f = midi(n + det)
      const filt = svf()
      let ph = Math.random() * 6.28
      for (let i = 0; i < dur * SR; i++) {
        const t = i / SR
        ph += (2 * Math.PI * f) / SR
        const e = Math.min(1, t / Math.min(0.8, dur * 0.3)) * Math.min(1, (dur - t) / Math.min(0.9, dur * 0.3))
        const s = filt(saw(ph, f, 12), fc + 300 * Math.sin(t * 0.7), 0.6) * e * gain
        put(at(t0) + i, det < 0 ? s : s * 0.6, det < 0 ? s * 0.6 : s, send)
      }
    }
  }
}

function riser(t0, dur, gain = 0.3, fromHz = 200, toHz = 4200) {
  const filt = svf()
  let ph = 0
  for (let i = 0; i < dur * SR; i++) {
    const t = i / SR
    const k = t / dur
    const fc = fromHz + (toHz - fromHz) * k * k
    ph += (2 * Math.PI * (60 + 500 * k * k * k)) / SR
    const s = (filt(rnd(), fc, 1.1) * 0.8 + Math.sin(ph) * 0.15) * k * k * gain
    put(at(t0) + i, s, s, 0.4)
  }
}

function click(t0, gain = 0.12, f = 2600) {
  for (let i = 0; i < 0.03 * SR; i++) {
    const t = i / SR
    const s = (Math.sin(2 * Math.PI * f * t) * 0.6 + rnd() * 0.4) * Math.exp(-t * 260) * gain
    put(at(t0) + i, s, s, 0.12)
  }
}

function drone(t0, dur, gain = 0.09) {
  const filt = svf()
  let p1 = 0
  let p2 = 0
  for (let i = 0; i < dur * SR; i++) {
    const t = i / SR
    p1 += (2 * Math.PI * 55) / SR
    p2 += (2 * Math.PI * 55.4) / SR
    const wind = filt(rnd(), 380 + 220 * Math.sin(t * 0.9), 1.4) * 0.5
    const e = Math.min(1, t / 0.8) * Math.min(1, (dur - t) / 0.6)
    const s = (Math.sin(p1) * 0.6 + Math.sin(p2) * 0.5 + wind) * e * gain
    put(at(t0) + i, s, s * 0.97, 0.3)
  }
}

/* ------------------------------------------------------------------- score */
const BEAT = 0.5

// I. the void
drone(0, 4.2, 0.1)
pad(0.2, 3.4, [69, 76], 0.012, 2600, 0.8)
for (let i = 0; i < 24; i++) click(0.35 + i * 0.058, 0.05 + 0.02 * Math.sin(i * 7), 2200 + ((i * 397) % 900))
click(2.0, 0.16, 1800)
riser(2.0, 1.35, 0.42)
for (const tb of [2.15, 2.55, 2.85, 3.05, 3.18, 3.27]) sub(tb, 40, 0.3, 0.32)
// the 280
braam(3.35, [33, 45, 52, 57, 60], { dur: 3.2, gain: 0.55, bright: 3200 })

// II. the gallery and the skyline: arpeggio ostinato in A minor
const prog = [
  [57, 60, 64, 69],
  [53, 57, 60, 65],
  [48, 52, 55, 60],
  [55, 59, 62, 67],
]
for (let b = 0; b * BEAT < 13 - 4.5; b++) {
  const tb = 4.5 + b * BEAT
  const chord = prog[Math.floor(b / 4) % 4]
  const build = clamp((tb - 4.5) / 8, 0, 1)
  for (let s = 0; s < 4; s++) pluck(tb + (s * BEAT) / 4, chord[(s + b) % 4] + (s === 3 ? 12 : 0), 0.06 + build * 0.05, 1800 + build * 3200)
  if (tb >= 5.0) kick(tb, tb >= 9 ? 0.75 : 0.5)
  if (tb >= 7.0) {
    hat(tb + BEAT / 2, 0.07, true)
    for (let q = 0; q < 4; q++) hat(tb + (q * BEAT) / 4, 0.03)
  }
  if (tb >= 9.0 && b % 2 === 1) clap(tb, 0.24)
}
// snare roll into the drop as the bars lift
for (let i = 0; i < 16; i++) clap(8.0 + i * (1 / 16) * (1 - i / 40), 0.05 + i * 0.012)
braam(9.0, [33, 45, 52, 57], { dur: 2.4, gain: 0.42, bright: 2200 })
for (let b = 0; b < 8; b++) pad(4.5 + b * 2, 2.05, prog[b % 4].slice(0, 3).map((n) => n - 12), 0.016, 900, 0.5)

// III. into the galaxy
riser(12.3, 0.75, 0.3, 300, 6000)
sub(13.0, 34, 1.2, 0.5)
impact(13.0, 0.28)
pad(13.0, 4.4, [69, 72, 76, 81], 0.02, 3200, 0.75)
for (let b = 0; b < 8; b++) {
  const tb = 13.0 + b * BEAT
  for (let s = 0; s < 2; s++) pluck(tb + (s * BEAT) / 2, [81, 84, 88, 91][(b + s) % 4], 0.05, 4200, 0.6)
  if (b % 2 === 0) kick(tb, 0.45)
}

// IV. anyone: near silence, typing, the rebuild
drone(17.0, 3.2, 0.06)
click(17.9, 0.1, 1500)
for (let i = 0; i < 9; i++) click(18.35 + i * 0.15, 0.13, 2400 + i * 60)
click(19.75, 0.2, 1600)
riser(19.25, 0.55, 0.22, 400, 5000)
braam(20.05, [33, 45, 57, 64], { dur: 2.0, gain: 0.32, bright: 4200 })
;[76, 81, 84, 88, 91, 93, 96].forEach((n, i) => chime(20.1 + i * 0.12, n, 0.06))
pad(20.2, 3.9, [57, 64, 69, 72, 76], 0.022, 2400, 0.7)
for (let b = 0; b < 7; b++) {
  const tb = 20.5 + b * BEAT
  kick(tb, 0.35 + b * 0.05)
  for (let s = 0; s < 4; s++) pluck(tb + (s * BEAT) / 4, [69, 72, 76, 81][(s + b) % 4] + 12, 0.04 + b * 0.006, 2800, 0.5)
}
riser(23.2, 0.8, 0.3, 300, 5000)

// V. Fork. Edit one file. Ship.
braam(24.0, [33, 45, 52, 57, 60], { dur: 1.0, gain: 0.5, bright: 2600, send: 0.5 })
braam(25.0, [29, 41, 48, 53, 57], { dur: 1.0, gain: 0.5, bright: 2800, send: 0.5 })
for (let i = 0; i < 12; i++) click(25.15 + i * 0.038, 0.06, 2500)
braam(26.0, [36, 48, 55, 60, 64, 67, 74], { dur: 1.2, gain: 0.55, bright: 4200, send: 0.55 })
;[84, 88, 91, 96].forEach((n, i) => chime(26.02 + i * 0.06, n, 0.05))

// VI. everything into one point, then the title
riser(27.0, 0.58, 0.5, 200, 9000)
braam(27.6, [33, 45, 52, 57, 64, 69], { dur: 3.0, gain: 0.62, bright: 3400, send: 0.6 })
pad(27.7, 2.9, [57, 64, 69, 71, 76], 0.024, 2200, 0.85)
;[81, 88, 93].forEach((n, i) => chime(28.0 + i * 0.22, n, 0.04))

/* ----------------------------------------------------------------- reverb */
function freeverb(input, size = 0.86, damp = 0.35, spread = 0) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round(((d + spread) * SR) / 44100))
  const aps = [556, 441, 341, 225].map((d) => Math.round(((d + spread) * SR) / 44100))
  const out = new Float32Array(input.length)
  const cb = combs.map((d) => ({ buf: new Float32Array(d), i: 0, store: 0 }))
  const ab = aps.map((d) => ({ buf: new Float32Array(d), i: 0 }))
  for (let n = 0; n < input.length; n++) {
    const x = input[n] * 0.015
    let s = 0
    for (const c of cb) {
      const y = c.buf[c.i]
      c.store = y * (1 - damp) + c.store * damp
      c.buf[c.i] = x + c.store * size
      c.i = (c.i + 1) % c.buf.length
      s += y
    }
    for (const a of ab) {
      const y = a.buf[a.i]
      a.buf[a.i] = s + y * 0.5
      a.i = (a.i + 1) % a.buf.length
      s = y - s
    }
    out[n] = s
  }
  return out
}
const wetL = freeverb(sendL, 0.88, 0.32, 0)
const wetR = freeverb(sendR, 0.88, 0.32, 23)

/* ----------------------------------------------------------------- master */
const outL = new Float32Array(N)
const outR = new Float32Array(N)
let peak = 0
for (let i = 0; i < N; i++) {
  const t = i / SR
  const fade = t > 29.4 ? Math.max(0, 1 - (t - 29.4) / 1.2) : 1
  const l = Math.tanh((L[i] + wetL[i] * 2.6) * 1.15) * fade
  const r = Math.tanh((R[i] + wetR[i] * 2.6) * 1.15) * fade
  outL[i] = l
  outR[i] = r
  peak = Math.max(peak, Math.abs(l), Math.abs(r))
}
const norm = 0.89 / peak
const buf = Buffer.alloc(44 + N * 4)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + N * 4, 4)
buf.write('WAVEfmt ', 8)
buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20)
buf.writeUInt16LE(2, 22)
buf.writeUInt32LE(SR, 24)
buf.writeUInt32LE(SR * 4, 28)
buf.writeUInt16LE(4, 32)
buf.writeUInt16LE(16, 34)
buf.write('data', 36)
buf.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(clamp(outL[i] * norm, -1, 1) * 32767), 44 + i * 4)
  buf.writeInt16LE(Math.round(clamp(outR[i] * norm, -1, 1) * 32767), 46 + i * 4)
}
mkdirSync('out', { recursive: true })
writeFileSync('out/score.wav', buf)
console.log('wrote out/score.wav', DUR + 's', 'peak before norm', peak.toFixed(2))
