import * as THREE from 'three'
import type { Repo } from './data'
import { GLOW, glowPoints } from './glow'
import { ease, inv, rng } from './util'

export interface GalaxyOpts {
  seed: number
  arms?: number
  dust?: number
  spin?: number
  scale?: number
  tint?: [number, number, number]
}

/**
 * A galaxy of repositories: one star per repo (size by merged PRs), owners cluster along
 * spiral arms, faint threads tie each repo to its owner, a dust disc fills the arms.
 */
export class Galaxy {
  group = new THREE.Group()
  disc = new THREE.Group()
  stars: THREE.InstancedMesh
  core: THREE.Sprite
  halos: THREE.Points
  dust: THREE.Points
  threads: THREE.LineSegments
  home: THREE.Vector3[] = []
  sizes: number[] = []
  colors: THREE.Color[] = []
  /** optional per-star launch points in this galaxy's local space (for forming) */
  from: THREE.Vector3[] | null = null
  delays: number[] = []
  scatter: THREE.Vector3[] = []
  private dummy = new THREE.Object3D()
  private v = new THREE.Vector3()

  constructor(
    public repos: Repo[],
    private o: GalaxyOpts,
  ) {
    const r = rng(o.seed)
    const arms = o.arms ?? 3
    const S = o.scale ?? 1
    this.group.add(this.disc)

    // owners in order of total merged PRs, walked out along the arms
    const owners = new Map<string, number>()
    repos.forEach((x) => owners.set(x.owner, (owners.get(x.owner) ?? 0) + x.count))
    const order = [...owners.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    const centre = new Map<string, THREE.Vector3>()
    order.forEach((ow, j) => {
      const rad = (2.2 + Math.sqrt(j) * 2.7) * S
      const ang = (j % arms) * ((Math.PI * 2) / arms) + rad * 0.13 / S + (r() - 0.5) * 0.3
      centre.set(ow, new THREE.Vector3(Math.cos(ang) * rad, (r() - 0.5) * 0.9 * S, Math.sin(ang) * rad))
    })
    const seen = new Map<string, number>()
    for (const x of repos) {
      const k = seen.get(x.owner) ?? 0
      seen.set(x.owner, k + 1)
      const c = centre.get(x.owner)!
      const a = r() * Math.PI * 2
      const d = k === 0 ? 0 : (0.55 + Math.sqrt(k) * 0.45) * S
      this.home.push(new THREE.Vector3(c.x + Math.cos(a) * d, c.y + (r() - 0.5) * 0.6 * S, c.z + Math.sin(a) * d))
      this.sizes.push((0.07 + Math.sqrt(x.count) * 0.075) * S)
      const tint = o.tint ?? [1, 1, 1]
      this.colors.push(x.user ? new THREE.Color(0.37 * 3.2, 0.83 * 3.2, 0.61 * 3.2) : new THREE.Color(2.4 * tint[0], 2.45 * tint[1], 2.6 * tint[2]))
      this.delays.push(r())
      const dir = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5).normalize()
      this.scatter.push(dir.multiplyScalar((30 + r() * 60) * S))
    }

    const n = repos.length
    this.stars = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true }), n)
    this.stars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
    this.colors.forEach((c, i) => this.stars.setColorAt(i, c))
    this.stars.frustumCulled = false
    this.disc.add(this.stars)

    this.halos = glowPoints(n, 1)
    const hc = this.halos.geometry.getAttribute('color') as THREE.BufferAttribute
    this.colors.forEach((c, i) => hc.setXYZ(i, c.r * 0.28, c.g * 0.28, c.b * 0.28))
    this.disc.add(this.halos)

    // dust along log spirals
    const dn = o.dust ?? 14000
    this.dust = glowPoints(dn, 0.12)
    const dp = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute
    const dc = this.dust.geometry.getAttribute('color') as THREE.BufferAttribute
    const ds = this.dust.geometry.getAttribute('size') as THREE.BufferAttribute
    const maxR = Math.max(...this.home.map((h) => Math.hypot(h.x, h.z))) + 3 * S
    for (let i = 0; i < dn; i++) {
      const arm = i % arms
      const t = Math.pow(r(), 0.7)
      const rad = (0.6 + t * (maxR / S)) * S
      const ang = arm * ((Math.PI * 2) / arms) + rad * 0.13 / S + (r() - 0.5) * (1.1 - t * 0.7)
      const sp = (1 - t) * 1.6 + 0.4
      dp.setXYZ(i, Math.cos(ang) * rad + (r() - 0.5) * sp * S, (r() - 0.5) * (1.6 - t) * 0.7 * S, Math.sin(ang) * rad + (r() - 0.5) * sp * S)
      const b = (0.3 + r() * 0.7) * (1.4 - t * 0.7)
      const g = r() < 0.12
      dc.setXYZ(i, g ? b * 0.5 : b, g ? b * 1.1 : b, g ? b * 0.8 : b * 1.1)
      ds.setX(i, (0.16 + Math.pow(r(), 4) * 0.7) * S)
    }
    this.disc.add(this.dust)

    // threads: repo → owner centre
    const lp = new Float32Array(n * 6)
    repos.forEach((x, i) => {
      const c = centre.get(x.owner)!
      const h = this.home[i]
      lp.set([h.x, h.y, h.z, c.x, c.y, c.z], i * 6)
    })
    const lg = new THREE.BufferGeometry()
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3))
    this.threads = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.5, 0.55, 0.62), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.disc.add(this.threads)

    // a warm-white core
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(1.6, 1.62, 1.75), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    this.core.scale.setScalar(7 * S)
    this.disc.add(this.core)
  }

  /**
   * form: 0 → 1 stars travel from `from` (or a burst at the core) to home.
   * explode: 0 → 1 stars fly outward and fade. glow: overall brightness.
   */
  update(t: number, { form = 1, explode = 0, glow = 1, dustIn = 1, threads = 1 }: { form?: number; explode?: number; glow?: number; dustIn?: number; threads?: number }) {
    this.disc.rotation.y = t * (this.o.spin ?? 0.05)
    const hp = this.halos.geometry.getAttribute('position') as THREE.BufferAttribute
    const hs = this.halos.geometry.getAttribute('size') as THREE.BufferAttribute
    for (let i = 0; i < this.home.length; i++) {
      const u = ease.inOutCubic(inv(this.delays[i] * 0.45, this.delays[i] * 0.45 + 0.55, form))
      const h = this.home[i]
      if (this.from && u < 1) {
        const f = this.from[i]
        // arc up and over on the way home
        this.v.copy(f).lerp(h, u)
        this.v.y += Math.sin(u * Math.PI) * 9
      } else if (!this.from && u < 1) {
        this.v.copy(h).multiplyScalar(ease.outCubic(u))
      } else this.v.copy(h)
      if (explode > 0) this.v.addScaledVector(this.scatter[i], ease.outCubic(explode))
      const s = this.sizes[i] * (0.15 + 0.85 * u) * (1 - explode * 0.7)
      this.dummy.position.copy(this.v)
      this.dummy.scale.setScalar(Math.max(0.0001, s))
      this.dummy.updateMatrix()
      this.stars.setMatrixAt(i, this.dummy.matrix)
      hp.setXYZ(i, this.v.x, this.v.y, this.v.z)
      hs.setX(i, s * 7 * glow * (1 - explode))
    }
    this.stars.instanceMatrix.needsUpdate = true
    hp.needsUpdate = hs.needsUpdate = true
    ;(this.stars.material as THREE.MeshBasicMaterial).opacity = glow * (1 - explode)
    ;(this.halos.material as THREE.ShaderMaterial).uniforms.opacity.value = glow * (1 - explode)
    ;(this.dust.material as THREE.ShaderMaterial).uniforms.opacity.value = dustIn * glow * (1 - explode)
    ;(this.core.material as THREE.SpriteMaterial).opacity = 0.32 * dustIn * glow * (1 - explode)
    ;(this.threads.material as THREE.LineBasicMaterial).opacity = 0.32 * threads * glow * (1 - explode) * form
    this.group.visible = glow > 0.001
  }

  /** world position of the biggest stars, for labels */
  starWorld(i: number) {
    return this.disc.localToWorld(this.home[i].clone())
  }
}

/** Plausible-looking anonymous portfolios for the "anyone" universe (no names, just shapes). */
export function syntheticRepos(seed: number, n: number): Repo[] {
  const r = rng(seed)
  const owners = Math.max(3, Math.floor(n / 2.4))
  return Array.from({ length: n }, (_, i) => ({
    name: `r${i}`,
    owner: `o${Math.floor(Math.pow(r(), 1.6) * owners)}`,
    count: 1 + Math.floor(Math.pow(r(), 3) * 18),
    user: r() < 0.15,
  }))
}
