import * as THREE from 'three'
import { buildAct1, dust, P } from './act1'
import { buildAct2, galleryView, HERO } from './act2'
import { EVAN, ME, repos } from './data'
import { Galaxy, syntheticRepos } from './galaxy'
import { C, H, Hud, W } from './hud'
import { ease, env, inv, lerp, noise1, pulse, rng, seg } from './util'

export const DUR = 30
export const FPS = 30

export interface Fx {
  bloom: number
  chroma: number
  grain: number
}

type Pose = { pos: THREE.Vector3; look: THREE.Vector3; fov: number }
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export async function buildFilm(world: THREE.Scene, hud: Hud, loader: THREE.TextureLoader, maxAniso: number) {
  // light for the lit parts (skyline)
  world.add(new THREE.HemisphereLight('#dfe5f0', '#05060a', 0.9))
  const key = new THREE.DirectionalLight('#ffffff', 2.2)
  key.position.set(120, 80, -120)
  world.add(key, key.target)
  key.target.position.set(140, -10, -190)

  const dustField = dust()
  world.add(dustField)

  const a1 = buildAct1(world)
  const a2 = await buildAct2(world, loader, maxAniso)
  a2.update(0)

  // ---- where the skyline ends up after the glass falls (chart-local → world, fallen frame)
  const fallen = (x: number, y: number, z: number) => {
    // Rx(-90°): (x, y, z) → (x, z, -y), then chart offset, then pivot → world
    const local = V(x, z, -y).add(a2.chart.position)
    return a2.pivot.localToWorld(local)
  }
  a2.pivot.updateMatrixWorld(true)
  const peak = a2.bars.reduce((a, b) => (b.n > a.n ? b : a))
  const cx = peak.cx
  const cy = peak.cy

  // ---- galaxies
  const mine = new Galaxy(repos(ME), { seed: 3, arms: 3, spin: 0.035, scale: 1 })
  const G1 = fallen(cx + 2, cy - 6, 36)
  mine.group.position.copy(G1)
  mine.group.rotation.set(0.42, 0.3, -0.12)
  world.add(mine.group)
  // stars are born at the tops of the towers, in proportion to each day's merges
  mine.group.updateMatrixWorld(true)
  {
    const r = rng(9)
    const weighted = a2.bars.flatMap((b) => Array.from({ length: b.n }, () => b))
    mine.from = mine.repos.map(() => {
      const b = weighted[Math.floor(r() * weighted.length)]
      const top = fallen(b.cx + (r() - 0.5) * 0.4, b.cy + (r() - 0.5) * 0.4, b.h3)
      return mine.disc.worldToLocal(top)
    })
  }

  const evan = new Galaxy(repos(EVAN), { seed: 21, arms: 4, spin: 0.05, scale: 1.05, tint: [0.95, 1, 1.08] })
  evan.group.position.copy(G1)
  evan.group.rotation.set(0.5, -0.2, 0.1)
  world.add(evan.group)

  // a universe of other people's work
  const ur = rng(77)
  const others = Array.from({ length: 26 }, (_, i) => {
    const g = new Galaxy(syntheticRepos(100 + i, 30 + Math.floor(ur() * 90)), { seed: 200 + i, arms: 2 + Math.floor(ur() * 3), dust: 1600, spin: 0.04 + ur() * 0.05, scale: 0.7 + ur() * 0.6 })
    const a = ur() * Math.PI * 2
    const d = 70 + ur() * 160
    g.group.position.copy(G1).add(V(Math.cos(a) * d, (ur() - 0.5) * 70, -40 - ur() * 200))
    g.group.rotation.set(ur() * 1.2, ur() * 6, ur() * 0.6)
    world.add(g.group)
    return { g, delay: ur() * 0.9 }
  })

  // shockwave for "Ship."
  const wave = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 200),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.37 * 3, 0.83 * 3, 0.61 * 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  )
  world.add(wave)

  // ---------------------------------------------------------------- camera
  const views = a2.panels.map((p) => galleryView(p, 27, -2.5, 1))
  const rhythm = a2.panels.find((p) => p.key === 'rhythm')!
  const chartC = a2.chartPoint(-3.6, 2.2, 0)
  const chartPush: Pose = { pos: chartC.clone().addScaledVector(rhythm.normal, 13.5).add(V(0, 0.4, 0)), look: chartC, fov: 32 }
  const sideN = rhythm.normal.clone().applyAxisAngle(V(0, 1, 0), 0.62)
  const chartSide: Pose = { pos: chartC.clone().addScaledVector(sideN, 17).add(V(0, 3.5, 0)), look: chartC.clone().add(V(0, 0, 0)), fov: 34 }

  const sky = (x: number, y: number, z: number) => fallen(cx + x, cy + y, z)
  const skyPath = [sky(-16, -15, 3.2), sky(-9, -9, 2.2), sky(-3.5, -5, 1.5), sky(-1, -8.5, 2.4), sky(0.5, -13, 5.5)]
  const skyLook = [sky(-1, -1, 1.8), sky(0, 0, 2.2), sky(1.5, 0.5, 2.4), sky(1.5, 0, 2.8), sky(1.5, 0, 5)]
  const groundPose: Pose = { pos: skyPath[0], look: skyLook[0], fov: 40 }

  const spline = (pts: THREE.Vector3[], u: number) => new THREE.CatmullRomCurve3(pts, false, 'centripetal').getPoint(Math.min(1, Math.max(0, u)))
  const galaxyPath = [G1.clone().add(V(-4, -18, 12)), G1.clone().add(V(-2, -5, 5)), G1.clone().add(V(3, 1.5, -1)), G1.clone().add(V(10, 7, -10)), G1.clone().add(V(4, 22, 42))]
  const wide = G1.clone().add(V(0, 26, 78))
  const far = G1.clone().add(V(0, 40, 170))

  function poseAt(t: number): Pose {
    // I. the void: slow push, then warp after the comets
    if (t < 2.0) return { pos: V(0.3 * seg(t, 0, 2), 0.1 * seg(t, 0, 2), lerp(10.5, 8.2, seg(t, 0, 2, ease.inOutCubic))), look: V(0, 0, -20), fov: 35 }
    if (t < 3.35) {
      const u = inv(2.0, 3.35, t)
      return { pos: V(lerp(0.3, 0, u), lerp(0.1, 0, u), lerp(8.2, P.z + 24, ease.inCubic(u))), look: P, fov: lerp(35, 76, ease.inQuad(u)) }
    }
    if (t < 4.25) return { pos: V(0, 0, P.z + 24 + seg(t, 3.35, 4.25) * 1.2), look: P, fov: lerp(76, 35, seg(t, 3.35, 3.95, ease.outExpo)) }
    // II. pull back to reveal the hero panel, then dolly along the gallery
    if (t < 5.3) {
      const u = seg(t, 4.25, 5.3, ease.inOutCubic)
      return { pos: V(0, 0, P.z + 25.2).lerp(views[0].pos, u), look: P.clone().lerp(views[0].look.clone().add(V(0, 1, 0)), u), fov: lerp(35, 34, u) }
    }
    if (t < 7.7) {
      const u = seg(t, 5.3, 7.7, ease.inOutCubic)
      // look at the panel we're passing (same parameter as the camera), never into the gaps
      const pos = spline(views.map((v) => v.pos), u)
      const look = spline(views.map((v) => v.look.clone().add(V(4, 1, 0))), u)
      return { pos, look, fov: 32 }
    }
    if (t < 8.35) {
      const u = seg(t, 7.7, 8.35, ease.inOutCubic)
      const last = views[views.length - 1]
      return { pos: last.pos.clone().lerp(chartPush.pos, u), look: last.look.clone().add(V(4, 1, 0)).lerp(chartPush.look, u), fov: lerp(34, chartPush.fov, u) }
    }
    if (t < 9.05) {
      const u = seg(t, 8.35, 9.05, ease.inOutCubic)
      return { pos: chartPush.pos.clone().lerp(chartSide.pos, u), look: chartPush.look.clone().lerp(chartSide.look, u), fov: lerp(32, 34, u) }
    }
    if (t < 10.35) {
      const u = seg(t, 9.05, 10.35, ease.inOutCubic)
      return { pos: chartSide.pos.clone().lerp(groundPose.pos, u), look: chartSide.look.clone().lerp(groundPose.look, u), fov: lerp(34, 40, u) }
    }
    // the low flight between the towers
    if (t < 12.9) {
      const u = seg(t, 10.35, 12.9, ease.inOutCubic)
      return { pos: spline(skyPath, u), look: spline(skyLook, u), fov: 40 }
    }
    // III. rise with the stars, through the galaxy, out the other side
    if (t < 14.3) {
      const u = seg(t, 12.9, 14.3, ease.inOutCubic)
      return { pos: skyPath[skyPath.length - 1].clone().lerp(galaxyPath[0], u), look: skyLook[skyLook.length - 1].clone().lerp(G1, ease.inOutCubic(u)), fov: lerp(40, 46, u) }
    }
    if (t < 16.7) {
      const u = seg(t, 14.3, 16.7, ease.inOutCubic)
      return { pos: spline(galaxyPath, u), look: G1.clone().lerp(spline(galaxyPath, Math.min(1, u + 0.18)), 0.15 + 0.2 * Math.sin(u * Math.PI)), fov: lerp(46, 38, u) }
    }
    if (t < 17.8) {
      const u = seg(t, 16.7, 17.8, ease.inOutCubic)
      return { pos: galaxyPath[galaxyPath.length - 1].clone().lerp(wide, u), look: G1, fov: 38 }
    }
    // IV. anyone: hold on the galaxy, then pull back to the universe
    if (t < 21.6) return { pos: wide.clone().add(V(Math.sin(t * 0.3) * 2, 0, -seg(t, 17.8, 21.6) * 10)), look: G1, fov: 38 }
    if (t < 24) {
      const u = seg(t, 21.6, 24, ease.inOutCubic)
      return { pos: wide.clone().add(V(Math.sin(21.6 * 0.3) * 2, 0, -10)).lerp(far, u), look: G1.clone().add(V(0, -6 * u, -30 * u)), fov: lerp(38, 42, u) }
    }
    // V. three hits, a slow push into the universe
    if (t < 27) {
      const u = seg(t, 24, 27, ease.inOutCubic)
      return { pos: far.clone().lerp(G1.clone().add(V(0, 28, 120)), u), look: G1.clone().add(V(0, -6, -30)), fov: 42 }
    }
    // VI. everything falls into one point
    const u = seg(t, 27, 27.6, ease.inExpo)
    const end = G1.clone().add(V(0, 28, 120))
    return { pos: end.clone().lerp(G1.clone().add(V(0, 4, 18)), u), look: G1.clone().add(V(0, -6 * (1 - u), -30 * (1 - u))), fov: lerp(42, 60, u) }
  }

  // shake: a little handheld breathing, kicks on the hits
  const kicks = [3.35, 20.05, 24.0, 25.0, 26.0, 27.6]
  const shakeAmp = (t: number) => 0.03 + 0.6 * seg(t, 2.6, 3.35, ease.inQuad) * (t < 3.4 ? 1 : 0) + kicks.reduce((s, k) => s + pulse(t, k, 5) * (k === 27.6 ? 1.4 : 0.9), 0)

  // ---------------------------------------------------------------- titles
  const title = (s: string, t: number, a: number, b: number, y = 900, size = 64, color = C.ink) => {
    const k = env(t, a, a + 0.45, b - 0.3, b, ease.outCubic)
    if (k <= 0) return
    hud.text(s, W / 2, y, { size, weight: 500, alpha: k, blur: (1 - k) * 14, tracking: lerp(18, -1.5, ease.outCubic(inv(a, a + 0.9, t))), color })
  }

  function drawHud(t: number) {
    hud.clear()

    // I: under the 280
    {
      const k = env(t, 3.75, 4.1, 4.2, 4.4)
      hud.runs([{ s: 'merged pull requests ' }, { s: 'beyond', color: C.green }, { s: ' my own' }], W / 2, 742, { size: 44, weight: 500, alpha: k, blur: (1 - k) * 10, tracking: -0.5 })
    }
    // II: the gallery
    title('Every merge.', t, 4.9, 5.65)
    title('Every repository.', t, 5.7, 6.45)
    title('Live, every minute.', t, 6.5, 7.25)
    title('Every day.', t, 7.35, 8.35)
    // 2D → 3D
    {
      const k = env(t, 8.5, 8.9, 12.2, 12.6)
      if (k > 0) {
        const flip = seg(t, 9.0, 9.4, ease.inOutCubic)
        const x = W / 2 - 92
        hud.rect(x, 168, 184, 60, 14, 'rgba(17,20,28,0.78)', 'rgba(238,240,245,0.12)', k)
        hud.rect(x + 6 + flip * 86, 174, 86, 48, 10, 'rgba(38,43,56,0.95)', 'rgba(238,240,245,0.16)', k)
        hud.text('2D', x + 49, 208, { size: 24, mono: true, alpha: k, color: flip < 0.5 ? C.ink : C.mute })
        hud.text('3D', x + 135, 208, { size: 24, mono: true, alpha: k, color: flip >= 0.5 ? C.ink : C.mute })
      }
      title('Flip any chart into 3D.', t, 9.3, 10.6, 900, 60)
      title('A skyline of every day you shipped.', t, 10.8, 12.6, 900, 52, C.ink2)
    }
    // III
    title('179 repositories.', t, 14.5, 15.8, 520, 92)
    title('One orbit.', t, 15.5, 16.9, 640, 92, C.ink2)

    // IV: type any username
    {
      const k = env(t, 17.9, 18.25, 20.1, 20.4)
      if (k > 0) {
        const bw = 760
        const x = W / 2 - bw / 2
        const y = H / 2 - 50
        hud.text('See anyone’s open-source work', W / 2, y - 34, { size: 30, alpha: k, color: C.ink2 })
        hud.rect(x, y, bw, 100, 18, 'rgba(14,16,23,0.82)', t > 18.3 ? 'rgba(238,240,245,0.32)' : 'rgba(238,240,245,0.14)', k)
        const typed = 'your-name'.slice(0, Math.max(0, Math.floor((t - 18.35) / 0.15)))
        hud.text('github.com/', x + 36, y + 64, { size: 36, mono: true, align: 'left', alpha: k, color: C.dim })
        const tx = x + 36 + hud.measure('github.com/', { size: 36, mono: true })
        hud.text(typed, tx, y + 64, { size: 36, mono: true, align: 'left', alpha: k, color: C.ink })
        if (Math.floor(t * 3) % 2 === 0 && t < 19.8) hud.rect(tx + hud.measure(typed, { size: 36, mono: true }) + 4, y + 30, 3, 44, 1, C.ink, undefined, k)
        const press = pulse(t, 19.75, 10)
        hud.rect(x + bw - 132, y + 18, 112, 64, 12, `rgba(238,240,245,${0.9 + press * 0.1})`, undefined, k)
        hud.text('View', x + bw - 76, y + 60, { size: 28, weight: 500, alpha: k, color: '#0b0d14' })
      }
      // the result
      const r = env(t, 20.45, 20.9, 23.6, 24.0)
      if (r > 0) {
        // a neutral placeholder: this is "you", whoever types their name
        const y = 868
        const ax = W / 2 - 300
        hud.rect(ax, y - 58, 80, 80, 40, 'rgba(38,43,56,0.95)', 'rgba(238,240,245,0.18)', r)
        hud.text('@', ax + 40, y - 6, { size: 38, mono: true, alpha: r, color: C.ink2 })
        hud.text('your-name', W / 2 - 196, y - 14, { size: 40, weight: 500, align: 'left', alpha: r })
        hud.text('every merged PR · loaded live from GitHub', W / 2 - 196, y + 26, { size: 26, align: 'left', alpha: r, color: C.ink2, mono: true })
      }
      title('Anyone’s open source.', t, 22.1, 23.95, 210, 84)
    }
    // V: three hits
    {
      const hit = (s: string, a: number, b: number, color = C.ink) => {
        const k = t < a ? 0 : t > b ? 0 : 1 - ease.inCubic(inv(b - 0.18, b, t))
        if (k <= 0) return
        const slam = ease.outExpo(inv(a, a + 0.25, t))
        hud.text(s, W / 2, H / 2 + 40, { size: 190 * (1.25 - 0.25 * slam), weight: 500, tracking: -6, alpha: k * slam, blur: (1 - slam) * 18, color })
      }
      hit('Fork.', 24.0, 24.97)
      hit('Edit one file.', 25.0, 25.97)
      hit('Ship.', 26.0, 26.97, C.green)
      const code = env(t, 25.15, 25.35, 25.8, 25.97)
      if (code > 0) {
        const s = "github: 'your-username'"
        const n = Math.floor(inv(25.15, 25.6, t) * s.length)
        hud.text(s.slice(0, n), W / 2, H / 2 + 170, { size: 38, mono: true, alpha: code, color: C.ink2 })
      }
    }
    // flashes
    // (overlays blend in linear light: small alphas already read strongly on screen)
    hud.fill('#ffffff', pulse(t, 3.35, 14) * 0.035 + pulse(t, 27.6, 7) * 0.7 + pulse(t, 20.05, 12) * 0.05)
    // VI: the title
    {
      const k = seg(t, 27.75, 28.5, ease.outCubic) * (1 - seg(t, 29.55, 30, ease.inCubic))
      if (k > 0) {
        hud.text('Open-source, live.', W / 2, 560, { size: 168, weight: 500, tracking: lerp(30, -6, ease.outExpo(inv(27.75, 28.9, t))), alpha: k, blur: (1 - k) * 16 })
        // a light sweep across the letters
        const sx = lerp(-400, W + 400, seg(t, 28.0, 29.0, ease.inOutCubic))
        const c = hud.ctx
        c.save()
        c.globalCompositeOperation = 'source-atop'
        const grd = c.createLinearGradient(sx - 220, 0, sx + 220, 0)
        grd.addColorStop(0, 'rgba(255,255,255,0)')
        grd.addColorStop(0.5, `rgba(255,255,255,${0.9 * k})`)
        grd.addColorStop(1, 'rgba(255,255,255,0)')
        c.fillStyle = grd
        c.fillRect(0, 380, W, 220)
        c.restore()
        const u = seg(t, 28.3, 28.9, ease.outCubic) * (1 - seg(t, 29.55, 30))
        const url = 'sarankumar1325.github.io/oss-showcase'
        const uw = hud.measure(url, { size: 36, mono: true }) + 72
        hud.rect(W / 2 - uw / 2, 640, uw, 76, 16, 'rgba(95,212,155,0.95)', undefined, u)
        hud.text(url, W / 2, 690, { size: 36, mono: true, weight: 500, alpha: u, color: '#0b0d14' })
        hud.text('Fork it. Or type any username.', W / 2, 790, { size: 30, alpha: seg(t, 28.6, 29.1) * (1 - seg(t, 29.55, 30)), color: C.ink2 })
      }
    }

    // fade from / to black
    hud.fill('#000000', (1 - seg(t, 0, 0.5)) + seg(t, 29.6, 30, ease.inCubic))
    hud.commit()
  }

  // ---------------------------------------------------------------- tick
  const look = new THREE.Vector3()
  return {
    update(t: number, cam: THREE.PerspectiveCamera, fx: Fx) {
      a1.update(t)
      a2.update(t)

      // galaxy: forms from the towers, explodes on Enter, re-forms on the right with the universe
      const form1 = seg(t, 12.7, 14.7, ease.linear)
      const out1 = seg(t, 19.8, 20.7, ease.outCubic)
      const back1 = seg(t, 21.9, 23.2, ease.inOutCubic)
      if (t < 21.9) {
        mine.group.position.copy(G1)
        mine.update(t, { form: form1, explode: out1, glow: seg(t, 12.7, 13.2) * (1 - 0.6 * seg(t, 17.7, 18.3)), dustIn: seg(t, 13.6, 14.8), threads: seg(t, 14.2, 15.2) })
      } else {
        mine.from = null
        mine.group.position.copy(G1).add(V(42 * back1, -4 * back1, -20 * back1))
        mine.update(t, { form: back1, glow: back1 * (1 - seg(t, 27.1, 27.6, ease.inCubic)) })
      }
      const formE = seg(t, 20.05, 21.5, ease.linear)
      const leftE = seg(t, 21.9, 23.2, ease.inOutCubic)
      evan.group.position.copy(G1).add(V(-40 * leftE, 2 * leftE, -18 * leftE))
      evan.update(t, { form: formE, glow: seg(t, 20.05, 20.4) * (1 - seg(t, 27.1, 27.6, ease.inCubic)), dustIn: seg(t, 20.4, 21.4), threads: seg(t, 20.8, 21.6) })
      for (const o of others) {
        const k = seg(t, 22.0 + o.delay, 23.0 + o.delay) * (1 - seg(t, 27.0, 27.5, ease.inCubic))
        o.g.update(t, { form: k, glow: k * 0.85 })
      }
      // collapse: all galaxies fall into the centre
      const fallIn = seg(t, 27.0, 27.6, ease.inExpo)
      for (const g of [mine, evan, ...others.map((o) => o.g)]) g.group.scale.setScalar(1 - fallIn * 0.98)

      // "Ship." shockwave
      const wv = inv(26.0, 27.0, t)
      wave.position.copy(G1).add(V(0, -4, -20))
      wave.lookAt(cam.position)
      wave.scale.setScalar(1 + ease.outExpo(wv) * 260)
      ;(wave.material as THREE.MeshBasicMaterial).opacity = t >= 26 && t < 27 ? (1 - wv) * 1.2 : 0
      wave.visible = t >= 26 && t < 27.05

      ;(dustField.material as THREE.ShaderMaterial).uniforms.opacity.value = 0.55 + 0.45 * seg(t, 2.2, 3.3) * (1 - seg(t, 3.6, 5))

      // camera
      const p = poseAt(t)
      const a = shakeAmp(t)
      cam.position.copy(p.pos).add(V(noise1(t * 9, 1) * a * 0.35, noise1(t * 9, 2) * a * 0.35, noise1(t * 9, 3) * a * 0.2))
      look.copy(p.look).add(V(noise1(t * 6, 4) * a * 0.6, noise1(t * 6, 5) * a * 0.6, 0))
      cam.fov = p.fov
      cam.updateProjectionMatrix()
      cam.lookAt(look)
      cam.rotateZ(noise1(t * 3, 6) * 0.01 + noise1(t * 7, 7) * a * 0.02)

      // post: bloom and fringing swell with the action
      fx.bloom = 1.15 + 0.9 * seg(t, 2.4, 3.35, ease.inQuad) * (t < 3.4 ? 1 : 0) + kicks.reduce((s, k) => s + pulse(t, k, 4.5) * (k === 3.35 ? 0.6 : 1.4), 0) + 0.5 * seg(t, 14, 15) * (1 - seg(t, 17, 18))
      fx.chroma = 0.0006 + 0.004 * seg(t, 2.4, 3.35, ease.inQuad) * (t < 3.5 ? 1 : 0) + kicks.reduce((s, k) => s + pulse(t, k, 6) * 0.004, 0)
      fx.grain = t

      drawHud(t)
    },
    HERO,
  }
}
