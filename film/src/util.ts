// Math, easing, randomness: everything in the film is a pure function of time.

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const inv = (a: number, b: number, x: number) => clamp((x - a) / (b - a))
export const smooth = (t: number) => t * t * (3 - 2 * t)
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  inCubic: (t: number) => t * t * t,
  inQuart: (t: number) => t * t * t * t,
  inExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuint: (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  inOutExpo: (t: number) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
}

/** progress of t through [a, b], clamped and eased */
export const seg = (t: number, a: number, b: number, e: (x: number) => number = ease.inOutCubic) => e(inv(a, b, t))

/** attack/hold/release envelope: 0 → 1 over [a, b], 1 until c, 1 → 0 over [c, d] */
export const env = (t: number, a: number, b: number, c: number, d: number, e: (x: number) => number = ease.outCubic) =>
  t < b ? e(inv(a, b, t)) : t < c ? 1 : 1 - ease.inCubic(inv(c, d, t))

/** exponential decay pulse starting at t0 */
export const pulse = (t: number, t0: number, decay = 6) => (t < t0 ? 0 : Math.exp(-(t - t0) * decay))

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let r = Math.imul(a ^ (a >>> 15), 1 | a)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** smooth 1D value noise for camera shake */
export function noise1(x: number, seed = 0) {
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453
    return s - Math.floor(s)
  }
  const i = Math.floor(x)
  const f = x - i
  return lerp(h(i), h(i + 1), smoother(f)) * 2 - 1
}
