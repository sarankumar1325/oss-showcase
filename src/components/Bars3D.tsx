import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { gsap, isFinePointer } from '../lib/gsap'
import { prefersReducedMotion } from '../lib/hooks'

export interface Bar3D {
  key: string
  /** column / ring index */
  x: number
  /** row (grid layout only) */
  z: number
  v: number
  tip: string
  today?: boolean
}
export interface Label3D {
  text: string
  x: number
  z: number
}
export type Layout3D = 'row' | 'grid' | 'ring'
export type Palette3D = 'sky' | 'mint'

interface Props {
  bars: Bar3D[]
  labels?: Label3D[]
  layout: Layout3D
  palette?: Palette3D
  height: number
  active?: string | null
  onHover?: (key: string | null) => void
  /** number of slots around the ring (ring layout) */
  slots?: number
}

const RAMPS: Record<Palette3D, [number, string][]> = {
  // neutral steel steps; the peak gets the accent separately
  sky: [
    [0, '#232a38'],
    [0.5, '#3d4558'],
    [1, '#8c94a8'],
  ],
  // calendar intensity, same ramp as the 2D heatmap
  mint: [
    [0, '#1c3b2f'],
    [0.35, '#2a6b4d'],
    [0.7, '#3fa574'],
    [1, '#5fd49b'],
  ],
}
const ACCENT = new THREE.Color('#5fd49b')
const EMPTY = new THREE.Color('#181c26')
const TODAY = new THREE.Color('#5fd49b')

function ramp(p: Palette3D, t: number, out: THREE.Color) {
  const stops = RAMPS[p]
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [a, ca] = stops[i - 1]
      const [b, cb] = stops[i]
      return out.set(ca).lerp(new THREE.Color(cb), (t - a) / (b - a))
    }
  }
  return out.set(stops.at(-1)![1])
}

/** World-space footprint of one bar slot. */
const SLOT = 1
const FOOT = 0.78

/**
 * Instanced, lit, orbitable bar chart. One component renders three layouts:
 * a row (daily merges), a week×weekday grid (calendar skyline) and a 24-slot ring (hour clock).
 */
export default function Bars3D({ bars, labels = [], layout, palette = 'sky', height, active = null, onHover, slots = 24 }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const labelHost = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const api = useRef<{ reset: () => void; zoom: (d: number) => void; setSpin: (on: boolean) => void; setActive: (k: string | null) => void } | null>(null)
  const hoverCb = useRef(onHover)
  hoverCb.current = onHover
  const [spin, setSpin] = useState(!prefersReducedMotion())

  useEffect(() => {
    const el = host.current!
    const reduced = prefersReducedMotion()
    const fine = isFinePointer()
    const max = Math.max(1, ...bars.map((b) => b.v))

    // ---------------------------------------------------------------- renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.92
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = 'b3d-canvas'
    el.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x07080d, 30, 90)
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400)

    // ------------------------------------------------------------------ layout
    const pos = (b: Bar3D) => {
      if (layout === 'ring') {
        const a = (b.x / slots) * Math.PI * 2 - Math.PI / 2
        const R = Math.max(4.2, (slots * SLOT * 1.15) / (Math.PI * 2))
        return { x: Math.cos(a) * R, z: Math.sin(a) * R, rot: -a }
      }
      return { x: b.x * SLOT, z: b.z * SLOT, rot: 0 }
    }
    const pts = bars.map(pos)
    const minX = Math.min(...pts.map((p) => p.x))
    const maxX = Math.max(...pts.map((p) => p.x))
    const minZ = Math.min(...pts.map((p) => p.z))
    const maxZ = Math.max(...pts.map((p) => p.z))
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const spanX = maxX - minX + SLOT
    const spanZ = maxZ - minZ + SLOT
    const H = layout === 'row' ? Math.min(7, Math.max(4, spanX * 0.32)) : layout === 'ring' ? 3.2 : Math.min(5.5, Math.max(3, Math.max(spanX, spanZ) * 0.42))
    const heightOf = (v: number) => (v === 0 ? 0.06 : 0.18 + (v / max) * H)

    // ------------------------------------------------------------------ lights
    scene.add(new THREE.HemisphereLight(0xe6e9f0, 0x07080d, 1.1))
    const key = new THREE.DirectionalLight(0xffffff, 1.7)
    const radius = Math.max(spanX, spanZ, H * 1.4) * 0.75
    key.position.set(radius * 0.6, radius * 1.6 + H, radius * 0.9)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    const sc = key.shadow.camera
    sc.left = sc.bottom = -radius * 1.3
    sc.right = sc.top = radius * 1.3
    sc.near = 0.5
    sc.far = radius * 6 + H * 4
    key.shadow.bias = -0.0004
    key.shadow.radius = 4
    scene.add(key)
    const rim = new THREE.PointLight(0xc8cedb, 10, radius * 4, 1.6)
    rim.position.set(-radius, H * 0.8, -radius * 0.6)
    scene.add(rim)
    const fill = new THREE.PointLight(0xc8cedb, 8, radius * 4, 1.6)
    fill.position.set(radius, H * 0.5, radius * 0.8)
    scene.add(fill)

    // ------------------------------------------------------------------ ground
    const groundR = Math.max(spanX, spanZ) * 0.9 + 4
    const glowTex = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const g = c.getContext('2d')!
      const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128)
      grd.addColorStop(0, 'rgba(238,240,245,0.07)')
      grd.addColorStop(0.45, 'rgba(238,240,245,0.02)')
      grd.addColorStop(1, 'rgba(238,240,245,0)')
      g.fillStyle = grd
      g.fillRect(0, 0, 256, 256)
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      return t
    })()
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(groundR * 2.4, groundR * 2.4), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }))
    glow.rotation.x = -Math.PI / 2
    glow.position.y = -0.005
    scene.add(glow)
    const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(groundR * 3, groundR * 3), new THREE.ShadowMaterial({ opacity: 0.45 }))
    shadowFloor.rotation.x = -Math.PI / 2
    shadowFloor.receiveShadow = true
    scene.add(shadowFloor)
    const grid = new THREE.GridHelper(Math.ceil(groundR * 2), Math.ceil(groundR * 2), 0x2a3040, 0x1a1e28)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.22
    grid.position.y = 0.001
    scene.add(grid)
    if (layout === 'ring') {
      const ringR = Math.max(4.2, (slots * SLOT * 1.15) / (Math.PI * 2))
      const track = new THREE.Mesh(new THREE.RingGeometry(ringR - 0.62, ringR + 0.62, 96), new THREE.MeshBasicMaterial({ color: 0xeef0f5, transparent: true, opacity: 0.04, side: THREE.DoubleSide }))
      track.rotation.x = -Math.PI / 2
      track.position.y = 0.002
      scene.add(track)
      track.position.x = -cx
      track.position.z = -cz
    }

    // -------------------------------------------------------------------- bars
    const geo = new RoundedBoxGeometry(1, 1, 1, 3, 0.09)
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.15 })
    const glowU = { value: 0.9 }
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = glowU
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vH;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y + 0.5;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vH;\nuniform float uGlow;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.32, 1.0, smoothstep(0.0, 1.0, vH));')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vColor.rgb * (0.03 + 0.12 * vH * vH) * uGlow;',
        )
    }
    const mesh = new THREE.InstancedMesh(geo, mat, bars.length)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)

    const base: THREE.Color[] = bars.map((b) => {
      if (b.today && b.v === 0) return TODAY.clone().multiplyScalar(0.55)
      if (b.v === 0) return EMPTY.clone()
      if (palette === 'sky' && b.v === max) return ACCENT.clone()
      const c = ramp(palette, Math.pow(b.v / max, 0.75), new THREE.Color())
      return b.today ? c.lerp(TODAY, 0.35) : c
    })
    const hot = new THREE.Color('#ffffff')
    const tmpC = new THREE.Color()
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const vPos = new THREE.Vector3()
    const vScale = new THREE.Vector3()

    const grow: number[] = bars.map(() => (reduced ? 1 : 0))
    const lift = bars.map(() => 0)
    let hovered = -1
    let external = -1

    const writeBar = (i: number) => {
      const p = pts[i]
      const h = Math.max(0.02, heightOf(bars[i].v) * grow[i]) * (1 + lift[i] * 0.06)
      const f = FOOT * (1 + lift[i] * 0.12)
      q.setFromAxisAngle(up, p.rot)
      vPos.set(p.x - cx, h / 2 + lift[i] * 0.12, p.z - cz)
      vScale.set(f, h, f)
      m4.compose(vPos, q, vScale)
      mesh.setMatrixAt(i, m4)
      tmpC.copy(base[i]).lerp(hot, lift[i] * 0.45)
      mesh.setColorAt(i, tmpC)
    }
    bars.forEach((_, i) => writeBar(i))
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()

    // grow-in, staggered left → right (or clockwise)
    const stagger = bars.map((b, i) => {
      if (layout === 'grid') return (pts[i].x - minX) / Math.max(1, maxX - minX) * 0.9 + b.z * 0.03
      return (b.x / Math.max(1, layout === 'ring' ? slots : bars.length)) * 0.9
    })
    let growing = !reduced
    const easeOut = gsap.parseEase('expo.out')
    const growState = { t: 0 }
    const growTween = reduced
      ? null
      : gsap.to(growState, {
          t: 1,
          duration: 2.2,
          ease: 'none',
          paused: true,
          onUpdate: () => {
            for (let i = 0; i < bars.length; i++) {
              const local = Math.min(1, Math.max(0, (growState.t * 2.2 - stagger[i]) / 1.3))
              grow[i] = easeOut(local)
            }
          },
          onComplete: () => (growing = false),
        })

    // ----------------------------------------------------------------- camera
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.enablePan = false
    controls.enableZoom = false
    controls.rotateSpeed = 0.7
    controls.minPolarAngle = 0.25
    controls.maxPolarAngle = 1.38
    controls.autoRotate = spin && !reduced
    controls.autoRotateSpeed = layout === 'ring' ? 0.9 : 0.5
    if (!fine) {
      controls.enableRotate = false
      renderer.domElement.style.touchAction = 'pan-y'
    }
    const target = new THREE.Vector3(0, layout === 'row' ? H * 0.32 : H * 0.18, 0)
    controls.target.copy(target)

    const preset = layout === 'row' ? { az: 0.42, pol: 1.08 } : layout === 'ring' ? { az: 0.3, pol: 0.82 } : { az: -0.55, pol: 0.92 }
    let dist = 10
    let placed = false
    const frame = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      const aspect = w / Math.max(1, h)
      camera.aspect = aspect
      const vfov = THREE.MathUtils.degToRad(camera.fov)
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
      // horizontal radius of the footprint and the vertical extent seen from the preset elevation
      const rh = layout === 'ring' ? Math.max(spanX, spanZ) / 2 + 0.6 : Math.hypot(spanX, spanZ) / 2
      const vert = (H + rh * 2 * Math.cos(preset.pol)) / 2 + 0.4
      dist = Math.max(rh / Math.tan(hfov / 2), vert / Math.tan(vfov / 2), 7) * (layout === 'row' ? 0.86 : 1.02)
      controls.minDistance = dist * 0.45
      controls.maxDistance = dist * 1.8
      camera.updateProjectionMatrix()
    }
    const place = (d = dist) => {
      const s = new THREE.Spherical(d, preset.pol, preset.az)
      camera.position.setFromSpherical(s).add(target)
      camera.lookAt(target)
      controls.update()
    }

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = w + 'px'
      renderer.domElement.style.height = h + 'px'
      const before = dist
      frame()
      if (!placed) {
        placed = true
        place(dist)
      } else {
        // keep the user's zoom ratio across resizes
        const cur = camera.position.distanceTo(controls.target)
        const off = camera.position.clone().sub(controls.target).setLength((cur / before) * dist)
        camera.position.copy(controls.target).add(off)
        controls.update()
      }
      dirty = true
    }

    // ----------------------------------------------------------------- labels
    const labelEls = labels.map((l) => {
      const s = document.createElement('span')
      s.className = 'b3d-label mono'
      s.textContent = l.text
      labelHost.current!.appendChild(s)
      const at =
        layout === 'ring'
          ? (() => {
              const a = (l.x / slots) * Math.PI * 2 - Math.PI / 2
              const R = Math.max(4.2, (slots * SLOT * 1.15) / (Math.PI * 2)) + 1.6
              return new THREE.Vector3(Math.cos(a) * R - cx, 0.05, Math.sin(a) * R - cz)
            })()
          : new THREE.Vector3(l.x * SLOT - cx, 0.05, l.z * SLOT - cz)
      return { s, at }
    })
    const proj = new THREE.Vector3()
    const placeLabels = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      for (const { s, at } of labelEls) {
        proj.copy(at).project(camera)
        const vis = proj.z < 1
        s.style.transform = `translate3d(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px, 0) translate(-50%, -50%)`
        s.style.opacity = vis ? '' : '0'
      }
    }

    // ------------------------------------------------------------------ hover
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let pointer: { x: number; y: number } | null = null
    const tipEl = tip.current!
    const showTip = (i: number) => {
      if (i < 0) {
        tipEl.classList.remove('on')
        return
      }
      const b = bars[i]
      const p = pts[i]
      proj.set(p.x - cx, heightOf(b.v) + 0.35, p.z - cz).project(camera)
      tipEl.textContent = b.tip
      tipEl.style.transform = `translate3d(${((proj.x + 1) / 2) * el.clientWidth}px, ${((1 - proj.y) / 2) * el.clientHeight}px, 0) translate(-50%, -100%)`
      tipEl.classList.add('on')
    }
    const pick = () => {
      if (!pointer) return -1
      ndc.set((pointer.x / el.clientWidth) * 2 - 1, -(pointer.y / el.clientHeight) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObject(mesh, false)[0]
      return hit?.instanceId ?? -1
    }
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top }
      dirty = true
    }
    const onLeave = () => {
      pointer = null
      dirty = true
    }
    const onStart = () => {
      if (controls.autoRotate) {
        controls.autoRotate = false
        setSpin(false)
      }
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)
    controls.addEventListener('start', onStart)
    controls.addEventListener('change', () => (dirty = true))

    // ------------------------------------------------------------------- loop
    let dirty = true
    let visible = false
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = 0
      if (!visible) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (controls.update(dt)) dirty = true

      const h = pointer ? pick() : -1
      if (h !== hovered) {
        hovered = h
        hoverCb.current?.(h >= 0 ? bars[h].key : null)
        window.dispatchEvent(new CustomEvent('oss:cursor', { detail: h >= 0 ? { text: String(bars[h].v), ghost: true } : '' }))
        dirty = true
      }
      const focus = hovered >= 0 ? hovered : external
      let moving = growing
      for (let i = 0; i < bars.length; i++) {
        const want = i === focus ? 1 : 0
        const d = want - lift[i]
        if (Math.abs(d) > 0.002) {
          lift[i] += d * (1 - Math.pow(0.0008, dt))
          moving = true
        } else lift[i] = want
      }
      if (moving || growing) {
        for (let i = 0; i < bars.length; i++) writeBar(i)
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        dirty = true
      }
      if (dirty) {
        renderer.render(scene, camera)
        placeLabels()
        showTip(focus)
        dirty = false
      }
      raf = requestAnimationFrame(loop)
    }
    const kick = () => {
      if (!raf && visible) {
        last = performance.now()
        raf = requestAnimationFrame(loop)
      }
    }

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) {
        growTween?.play()
        kick()
      }
    })
    io.observe(el)
    const ro = new ResizeObserver(() => {
      resize()
      kick()
    })
    ro.observe(el)
    resize()

    api.current = {
      reset: () => {
        const s = new THREE.Spherical(dist, preset.pol, preset.az)
        const to = new THREE.Vector3().setFromSpherical(s).add(target)
        gsap.to(camera.position, { x: to.x, y: to.y, z: to.z, duration: 1.1, ease: 'expo.inOut', onUpdate: () => (dirty = true) })
      },
      zoom: (k: number) => {
        const off = camera.position.clone().sub(controls.target)
        const len = THREE.MathUtils.clamp(off.length() * k, controls.minDistance, controls.maxDistance)
        const to = off.setLength(len).add(controls.target)
        gsap.to(camera.position, { x: to.x, y: to.y, z: to.z, duration: 0.7, ease: 'power3.out', onUpdate: () => (dirty = true) })
      },
      setSpin: (on: boolean) => {
        controls.autoRotate = on && !reduced
        kick()
      },
      setActive: (k: string | null) => {
        external = k ? bars.findIndex((b) => b.key === k) : -1
        kick()
      },
    }

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      growTween?.kill()
      gsap.killTweensOf(camera.position)
      controls.dispose()
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      if (hovered >= 0) window.dispatchEvent(new CustomEvent('oss:cursor', { detail: '' }))
      labelEls.forEach(({ s }) => s.remove())
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mm = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mm)) mm.forEach((x) => x.dispose())
        else mm?.dispose()
      })
      glowTex.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      api.current = null
    }
    // the scene is rebuilt whenever its data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, labels, layout, palette, slots])

  useEffect(() => {
    api.current?.setActive(active)
  }, [active])
  useEffect(() => {
    api.current?.setSpin(spin)
  }, [spin])

  return (
    <div className="b3d" ref={host} style={{ height }} data-cursor="Drag" data-cursor-style="ghost">
      <div className="b3d-labels" ref={labelHost} aria-hidden="true" />
      <div className="b3d-tip mono" ref={tip} aria-hidden="true" />
      <div className="b3d-tools">
        <button type="button" className="b3d-btn mono" onClick={() => api.current?.zoom(0.8)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="b3d-btn mono" onClick={() => api.current?.zoom(1.25)} aria-label="Zoom out">
          −
        </button>
        <button type="button" className={`b3d-btn mono ${spin ? 'on' : ''}`} onClick={() => setSpin((s) => !s)} aria-pressed={spin}>
          Spin
        </button>
        <button type="button" className="b3d-btn mono" onClick={() => api.current?.reset()}>
          Reset
        </button>
      </div>
    </div>
  )
}
