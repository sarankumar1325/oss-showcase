import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { calendar, daily, ME } from './data'
import { P } from './act1'
import { ease, inv, lerp, rng, seg } from './util'

/** 1 world unit = 60 screenshot pixels; panels are 1920×1080 → 32×18. */
export const PX = 60
const PW = 32
const PH = 18

/** Hero panel placed so its "280" sits exactly where the 3D number was born. */
export const HERO_280 = { x: (967.5 - 960) / PX, y: (540 - 326.5) / PX, w: 641 / PX }
export const HERO = new THREE.Vector3(P.x - HERO_280.x, P.y - HERO_280.y, P.z)

const ROT = 0.36
const GALLERY = [
  { key: 'hero', src: 'shots/hero.png', pos: HERO.clone(), rot: 0 },
  { key: 'orbit', src: 'shots/orbit.png', pos: HERO.clone().add(new THREE.Vector3(37, 0, -15)), rot: ROT },
  { key: 'feed', src: 'shots/feed.png', pos: HERO.clone().add(new THREE.Vector3(72, 0, -29)), rot: ROT },
  { key: 'ledger', src: 'shots/ledger.png', pos: HERO.clone().add(new THREE.Vector3(106, 0, -43)), rot: ROT },
  { key: 'rhythm', src: 'shots/rhythm.png', pos: HERO.clone().add(new THREE.Vector3(140, 0, -57)), rot: ROT },
] as const
export type PanelKey = (typeof GALLERY)[number]['key']
export const FLOOR_Y = HERO.y - PH / 2 - 0.8

const panelVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const panelFrag = /* glsl */ `
  uniform sampler2D map;
  uniform float opacity;
  uniform float sheen;
  uniform float dim;
  uniform float reflection;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    vec4 c = texture2D(map, uv);
    // a bar of light sliding across the glass
    float band = exp(-pow((uv.x + uv.y * 0.42 - sheen) * 6.0, 2.0));
    vec3 col = c.rgb * (1.0 - dim) + vec3(0.85, 0.9, 1.0) * band * 0.16;
    // hairline edge that catches the light
    float e = min(min(uv.x, 1.0 - uv.x) * 1.7778, min(uv.y, 1.0 - uv.y));
    col += vec3(0.9, 0.95, 1.0) * smoothstep(0.004, 0.0, e) * (0.35 + band);
    float a = opacity;
    if (reflection > 0.5) a *= pow(1.0 - uv.y, 2.6) * 0.22;
    gl_FragColor = vec4(col, a);
  }`

export interface Panel {
  key: PanelKey
  mesh: THREE.Mesh
  refl: THREE.Mesh
  mat: THREE.ShaderMaterial
  rmat: THREE.ShaderMaterial
  normal: THREE.Vector3
}

function panelMaterial(tex: THREE.Texture, reflection: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, opacity: { value: 1 }, sheen: { value: -1 }, dim: { value: 0 }, reflection: { value: reflection ? 1 : 0 } },
    vertexShader: panelVert,
    fragmentShader: panelFrag,
    transparent: true,
    depthWrite: !reflection,
    side: THREE.DoubleSide,
  })
}

/** chart geometry on the Rhythm screenshot (panel-local units) */
const BAR = { x0: (410 - 960) / PX, step: 36.4 / PX, base: (540 - 486) / PX, w: 26 / PX, max: 255 / PX }

export async function buildAct2(world: THREE.Scene, loader: THREE.TextureLoader, maxAniso: number) {
  const group = new THREE.Group()
  world.add(group)
  const panels: Panel[] = []
  for (const g of GALLERY) {
    const tex = await loader.loadAsync(g.src)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = maxAniso
    const geo = new THREE.PlaneGeometry(PW, PH)
    const mat = panelMaterial(tex, false)
    const rmat = panelMaterial(tex, true)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(g.pos)
    mesh.rotation.y = -g.rot
    const refl = new THREE.Mesh(geo, rmat)
    refl.position.set(g.pos.x, 2 * FLOOR_Y - g.pos.y, g.pos.z)
    refl.rotation.y = -g.rot
    refl.scale.y = -1
    group.add(mesh, refl)
    panels.push({ key: g.key, mesh, refl, mat, rmat, normal: new THREE.Vector3(Math.sin(-g.rot), 0, Math.cos(-g.rot)) })
  }

  // a dark floor that fades into fog
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 1 } },
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float opacity; varying vec3 vW;
        void main(){
          vec2 g = abs(fract(vW.xz / 4.0 - 0.5) - 0.5) / fwidth(vW.xz / 4.0);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          vec3 col = vec3(0.027, 0.031, 0.047) + vec3(0.06, 0.065, 0.08) * line * 0.5;
          gl_FragColor = vec4(col, opacity);
        }`,
      transparent: true,
      depthWrite: false,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(HERO.x + 70, FLOOR_Y, HERO.z - 30)
  group.add(floor)

  // ------------------------------------------------------------- skyline
  const rhythm = panels.find((p) => p.key === 'rhythm')!
  const series = daily(ME)
  const max = Math.max(...series.map((s) => s.n))
  const cal = calendar(ME)

  // pivot at the chart's left baseline on the Rhythm panel; local x along days, y up the glass, z out of it
  const pivot = new THREE.Group()
  pivot.position.copy(rhythm.mesh.position)
  pivot.rotation.y = rhythm.mesh.rotation.y
  group.add(pivot)
  const chart = new THREE.Group()
  chart.position.set(0, BAR.base, 0.02)
  pivot.add(chart)

  const unit = new RoundedBoxGeometry(1, 1, 1, 2, 0.06)
  unit.translate(0, 0.5, 0.5) // occupies y∈[0,1], z∈[0,1]
  const heat = ['#1c3b2f', '#2a6b4d', '#3fa574', '#5fd49b'].map((c) => new THREE.Color(c))
  const H3 = 4.6
  const S = BAR.step

  // last calendar week → aligned with the right end of the bar row
  const lastWeek = cal.weeks - 1
  const cellX = (w: number) => BAR.x0 + (series.length - 1) * S - (lastWeek - w) * S
  const keyCell = new Map(cal.cells.map((c) => [c.key, c]))

  const bars = series.map((s, i) => {
    const lvl = s.n === 0 ? -1 : s.n <= 2 ? 0 : s.n <= 5 ? 1 : s.n <= 12 ? 2 : 3
    const peak = s.n === max
    const mat = new THREE.MeshStandardMaterial({
      color: peak ? '#5fd49b' : lvl < 0 ? '#1d222e' : heat[lvl],
      roughness: 0.32,
      metalness: 0.08,
      emissive: peak ? '#5fd49b' : lvl < 0 ? '#000000' : heat[lvl],
      emissiveIntensity: peak ? 0.9 : 0.12,
    })
    const m = new THREE.Mesh(unit, mat)
    chart.add(m)
    const cell = keyCell.get(s.key)!
    return { m, n: s.n, i, h2d: (s.n / max) * BAR.max, h3: 0.12 + (s.n / max) * H3, cx: cellX(cell.w), cy: (6 - cell.d) * S * -1 - 0.5 }
  })

  // the rest of the year: dim tiles that rise in a wave
  const empty = cal.cells.filter((c) => !series.some((s) => s.key === c.key))
  const tiles = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: '#171b25', roughness: 0.8, metalness: 0.05 }), empty.length)
  chart.add(tiles)
  const r = rng(11)
  const tileDelay = empty.map((c) => (lastWeek - c.w) * 0.045 + r() * 0.12)
  const dummy = new THREE.Object3D()

  // ground for the skyline (appears once the glass has fallen)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 30),
    new THREE.MeshStandardMaterial({ color: '#0b0d14', roughness: 0.92, metalness: 0, transparent: true }),
  )
  ground.position.set(-20, -4, -0.01)
  chart.add(ground)

  const greenLight = new THREE.PointLight('#5fd49b', 0, 26, 1.6)
  chart.add(greenLight)

  return {
    group,
    panels,
    pivot,
    chart,
    bars,
    floor,
    /** world-space point on the Rhythm chart (local chart coords) */
    chartPoint(x: number, y: number, z: number) {
      return chart.localToWorld(new THREE.Vector3(x, y, z))
    },
    update(t: number) {
      group.visible = t > 4.0 && t < 14.6

      // panels: fade in around the 280, light sheen sweeps as the camera passes
      for (const [k, p] of panels.entries()) {
        const appear = p.key === 'hero' ? seg(t, 4.25, 4.85, ease.outCubic) : seg(t, 4.5 + k * 0.12, 5.3 + k * 0.12, ease.outCubic)
        let o = appear
        if (p.key !== 'rhythm') o *= 1 - seg(t, 8.4, 9.2)
        p.mat.uniforms.opacity.value = o
        p.rmat.uniforms.opacity.value = o * (1 - seg(t, 8.6, 9.2))
        p.mat.uniforms.sheen.value = lerp(-1.2, 2.6, inv(4.4 + k * 0.62, 6.2 + k * 0.62, t))
        p.mesh.visible = o > 0.001
        p.refl.visible = o > 0.001
      }
      ;(floor.material as THREE.ShaderMaterial).uniforms.opacity.value = seg(t, 4.3, 5.2) * (1 - seg(t, 8.8, 9.6))

      // Rhythm: the glass dims, its 2D bars extrude toward us, then the glass falls back to become the ground
      const rh = rhythm.mat.uniforms
      const extrude = seg(t, 8.15, 9.0, ease.inOutCubic)
      const fall = seg(t, 9.0, 10.3, ease.inOutCubic)
      rh.dim.value = 0.55 * extrude
      rh.opacity.value *= 1 - seg(t, 9.25, 9.9)
      chart.rotation.x = -Math.PI / 2 * fall
      ;(ground.material as THREE.MeshStandardMaterial).opacity = seg(t, 9.6, 10.4)

      // re-flow: day row → calendar grid, footprints become square
      const flow = seg(t, 10.35, 11.6, ease.inOutQuint)
      for (const b of bars) {
        const depth = lerp(0.001, b.h3, extrude)
        const foot = lerp(Math.max(b.h2d, 0.04), S * 0.78, flow)
        const x = lerp(BAR.x0 + b.i * S, b.cx, flow)
        const y = lerp(0, b.cy, flow)
        b.m.position.set(x, y, 0)
        b.m.scale.set(BAR.w * (1 - flow) + S * 0.78 * flow, foot, depth)
        b.m.visible = t > 8.1
      }
      for (let i = 0; i < empty.length; i++) {
        const c = empty[i]
        const rise = seg(t, 10.6 + tileDelay[i], 11.3 + tileDelay[i], ease.outCubic)
        dummy.position.set(cellX(c.w), (6 - c.d) * S * -1 - 0.5, 0)
        dummy.scale.set(S * 0.78, S * 0.78, 0.001 + rise * 0.07)
        dummy.updateMatrix()
        tiles.setMatrixAt(i, dummy.matrix)
      }
      tiles.instanceMatrix.needsUpdate = true
      tiles.visible = t > 10.55

      // a green light lives in the peak tower
      const peak = bars.find((b) => b.n === max)!
      greenLight.position.set(peak.m.position.x + 0.3, peak.m.position.y - 0.3, peak.h3 * 0.6)
      greenLight.intensity = 30 * seg(t, 9.4, 10.6)
    },
  }
}

/** Camera viewpoints for the gallery track: in front of each panel, slightly off-axis. */
export function galleryView(p: Panel, dist: number, side = -3.5, up = 1.2) {
  const pos = p.mesh.position.clone().addScaledVector(p.normal, dist)
  const right = new THREE.Vector3(p.normal.z, 0, -p.normal.x)
  pos.addScaledVector(right, side)
  pos.y += up
  return { pos, look: p.mesh.position.clone() }
}
