import * as THREE from 'three'
import { ME, mergeOrder } from './data'
import { glowPoints, GLOW } from './glow'
import { C, WorldText } from './hud'
import { ease, inv, rng, seg } from './util'

/** Where every merged PR converges, and where the 280 is born. */
export const P = new THREE.Vector3(0, 0, -120)
export const CMD = `gh search prs --author ${ME.handle} --merged`

/** Drifting dust through the whole film: gives every camera move parallax. */
export function dust(count = 4000) {
  const r = rng(7)
  const pts = glowPoints(count, 0.14)
  const pos = pts.geometry.getAttribute('position') as THREE.BufferAttribute
  const col = pts.geometry.getAttribute('color') as THREE.BufferAttribute
  const size = pts.geometry.getAttribute('size') as THREE.BufferAttribute
  for (let i = 0; i < count; i++) {
    pos.setXYZ(i, (r() - 0.5) * 420, (r() - 0.5) * 240, 30 - r() * 480)
    const b = 0.25 + r() * 0.55
    col.setXYZ(i, b, b * 1.02, b * 1.1)
    size.setX(i, 0.35 + Math.pow(r(), 3) * 1.6)
  }
  return pts
}

export function buildAct1(world: THREE.Scene) {
  const group = new THREE.Group()
  world.add(group)

  // ---- the command, typed into the void
  const term = new WorldText(3000, 220, 10.2, (c, text, w, h) => {
    c.font = '400 76px "Geist Mono"'
    c.textBaseline = 'middle'
    // centred on the full command so the line doesn't drift while it types
    const x0 = (w - (c.measureText(CMD).width + 90)) / 2
    c.fillStyle = C.green
    c.fillText('$', x0, h / 2)
    c.fillStyle = '#d8dce6'
    c.fillText(text.replace('▍', ''), x0 + 90, h / 2)
    if (text.endsWith('▍')) {
      const x = x0 + 90 + c.measureText(text.replace('▍', '')).width + 10
      c.fillStyle = '#eef0f5'
      c.fillRect(x, h / 2 - 52, 46, 104)
    }
  })
  term.mesh.position.set(0, 0, 0)
  group.add(term.mesh)

  // ---- 280 comets, in real merge order
  const order = mergeOrder(ME)
  const N = order.length
  const r = rng(280)
  const streaks = order.map((pr, i) => {
    // start all around the edges of the frame, just ahead of the camera, and get pulled into one point
    const a = r() * Math.PI * 2
    const z = -4 - r() * 46
    const spread = (Math.abs(z) + 9) * (0.2 + r() * 0.55)
    const start = new THREE.Vector3(Math.cos(a) * spread * 1.6, Math.sin(a) * spread, z)
    const mid = start.clone().lerp(P, 0.35).add(new THREE.Vector3(Math.cos(a + 1.4) * 14, Math.sin(a + 1.4) * 9, 0))
    const launch = 2.0 + 0.95 * Math.pow(i / N, 0.85) + r() * 0.1
    return { start, mid, launch, dur: 0.85 + r() * 0.3, user: pr.k === 'U', bright: 0.6 + r() * 0.8 }
  })
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3))
  lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3))
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  lines.frustumCulled = false
  group.add(lines)
  const heads = glowPoints(N, 1.4)
  group.add(heads)

  const bez = (s: THREE.Vector3, m: THREE.Vector3, e: THREE.Vector3, u: number, out: THREE.Vector3) => {
    const a = (1 - u) * (1 - u)
    const b = 2 * (1 - u) * u
    const c = u * u
    return out.set(a * s.x + b * m.x + c * e.x, a * s.y + b * m.y + c * e.y, a * s.z + b * m.z + c * e.z)
  }

  // ---- the convergence flash + shockwave + the number
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  flash.position.copy(P)
  group.add(flash)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.98, 1, 160),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  )
  ring.position.copy(P)
  group.add(ring)

  // the number is sized so "280" matches the hero screenshot's glyphs exactly (641 px wide at 60 px/unit)
  const NUM_W = 15.5
  let glyphScale = 1
  const num = new WorldText(1600, 560, NUM_W, (c, text, w, h) => {
    c.font = '500 470px Geist'
    c.letterSpacing = '-16px'
    c.textAlign = 'center'
    c.textBaseline = 'alphabetic'
    const m = c.measureText('280')
    glyphScale = 641 / 60 / ((m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / w * NUM_W)
    c.fillStyle = '#eef0f5'
    c.fillText(text, w / 2, h / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2)
  })
  num.set('280')
  num.mesh.position.copy(P)
  group.add(num.mesh)

  const v = new THREE.Vector3()
  const v2 = new THREE.Vector3()
  const lp = lineGeo.getAttribute('position') as THREE.BufferAttribute
  const lc = lineGeo.getAttribute('color') as THREE.BufferAttribute
  const hp = heads.geometry.getAttribute('position') as THREE.BufferAttribute
  const hc = heads.geometry.getAttribute('color') as THREE.BufferAttribute
  const hs = heads.geometry.getAttribute('size') as THREE.BufferAttribute

  return {
    group,
    num,
    update(t: number) {
      group.visible = t < 5.4

      // command: types from 0.35 s, caret, dissolves on Enter
      const typed = Math.floor(inv(0.35, 1.75, t) * CMD.length)
      const caret = t < 2.0 && Math.floor(t * 3.2) % 2 === 0 ? '▍' : ''
      term.set(CMD.slice(0, typed) + caret)
      const gone = seg(t, 2.0, 2.35, ease.inCubic)
      term.material.opacity = (0.15 + 0.85 * inv(0, 0.4, t)) * (1 - gone)
      term.mesh.scale.setScalar(1 + gone * 0.25)
      term.mesh.visible = term.material.opacity > 0.01

      // comets
      for (let i = 0; i < N; i++) {
        const s = streaks[i]
        const u = inv(s.launch, s.launch + s.dur, t)
        const live = t > s.launch && u < 1
        const uh = ease.inQuad(u)
        const ut = ease.inQuad(Math.max(0, u - 0.22))
        bez(s.start, s.mid, P, uh, v)
        bez(s.start, s.mid, P, ut, v2)
        lp.setXYZ(i * 2, v.x, v.y, v.z)
        lp.setXYZ(i * 2 + 1, v2.x, v2.y, v2.z)
        // heads dim as they arrive so 280 of them don't pile into one blinding pixel
        const k = live ? s.bright * (0.8 + 2.6 * uh) * Math.min(1, (t - s.launch) * 8) * (1 - 0.92 * ease.inCubic(inv(0.72, 1, u))) : 0
        const [cr, cg, cb] = s.user ? [0.37, 0.83, 0.61] : [0.93, 0.94, 0.98]
        lc.setXYZ(i * 2, cr * k, cg * k, cb * k)
        lc.setXYZ(i * 2 + 1, 0, 0, 0)
        hp.setXYZ(i, v.x, v.y, v.z)
        hc.setXYZ(i, cr * k * 1.2, cg * k * 1.2, cb * k * 1.2)
        hs.setX(i, live ? 1.2 + 2.4 * uh : 0)
      }
      lp.needsUpdate = lc.needsUpdate = hp.needsUpdate = hc.needsUpdate = hs.needsUpdate = true

      // flash at convergence
      const f = t < 3.35 ? ease.inQuart(inv(2.6, 3.35, t)) * 0.5 : Math.exp(-(t - 3.35) * 5.5)
      flash.scale.setScalar(2 + f * 11)
      ;(flash.material as THREE.SpriteMaterial).opacity = Math.min(1, f) * 0.55 * (t < 5 ? 1 : 0)

      const w = inv(3.35, 4.6, t)
      ring.scale.setScalar(1 + ease.outExpo(w) * 70)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = t > 3.35 ? (1 - w) * 1.4 : 0

      // the number: counts as it forms, then hands over to the hero panel
      const nIn = seg(t, 3.35, 3.95, ease.outExpo)
      const count = Math.round(ease.outCubic(inv(3.3, 4.05, t)) * ME.prs.length)
      num.set(String(count))
      const nOut = seg(t, 4.3, 4.6, ease.inOutCubic)
      ;(num.material as THREE.MeshBasicMaterial).opacity = nIn * (1 - nOut)
      num.mesh.scale.setScalar(glyphScale * (1.9 - 0.9 * nIn))
      num.mesh.visible = nIn > 0.001 && nOut < 0.999
    },
  }
}
