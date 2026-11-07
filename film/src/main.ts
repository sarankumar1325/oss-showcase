import * as THREE from 'three'
import { BlendFunction, BloomEffect, ChromaticAberrationEffect, Effect, EffectComposer, EffectPass, NoiseEffect, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing'
import { buildFilm, DUR, FPS, type Fx } from './film'
import { H, Hud, loadFonts, W } from './hud'

const params = new URLSearchParams(location.search)
const RENDER = params.has('render')

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: RENDER, stencil: false })
renderer.setPixelRatio(1)
renderer.setSize(W, H, false)
renderer.toneMapping = THREE.NoToneMapping
document.body.appendChild(renderer.domElement)

const world = new THREE.Scene()
world.background = new THREE.Color('#030407')
world.fog = new THREE.FogExp2('#030407', 0.0042)
const cam = new THREE.PerspectiveCamera(35, W / H, 0.05, 3000)
const hud = new Hud()

const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 4 })
const bloom = new BloomEffect({ mipmapBlur: true, intensity: 1.2, luminanceThreshold: 0.6, luminanceSmoothing: 0.25, radius: 0.78, levels: 8 })
const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })
const chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0006, 0.0006), radialModulation: true, modulationOffset: 0.25 })
const vignette = new VignetteEffect({ darkness: 0.62, offset: 0.26 })
const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false })
grain.blendMode.opacity.value = 0.11

// world → bloom + tone map → (fringing, typography, vignette, grain) in one final pass
/** Lays the typography canvas over the frame by its own alpha. */
class TypeEffect extends Effect {
  constructor(tex: THREE.Texture) {
    super(
      'TypeEffect',
      /* glsl */ `
      uniform sampler2D hud;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec4 h = texture2D(hud, uv);
        outputColor = vec4(mix(inputColor.rgb, h.rgb, h.a), inputColor.a);
      }`,
      { blendFunction: BlendFunction.NORMAL, uniforms: new Map([['hud', new THREE.Uniform(tex)]]) },
    )
  }
}
const type = new TypeEffect(hud.texture)
composer.addPass(new RenderPass(world, cam))
composer.addPass(new EffectPass(cam, bloom, tone))
composer.addPass(new EffectPass(cam, chroma, type, vignette, grain))

const fx: Fx = { bloom: 1.2, chroma: 0.0006, grain: 0 }
const ui = document.getElementById('ui')!

async function boot() {
  await loadFonts()
  await hud.image('me', 'saran.jpg')
  const loader = new THREE.TextureLoader()
  const film = await buildFilm(world, hud, loader, renderer.capabilities.getMaxAnisotropy())

  // cinematic 2.39:1 letterbox, drawn on top of everything
  const bar = Math.round((H - W / 2.39) / 2)
  const box = new THREE.Scene()
  const boxCam = new THREE.OrthographicCamera(0, W, H, 0, 0, 1)
  for (const y of [bar / 2, H - bar / 2]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, bar), new THREE.MeshBasicMaterial({ color: 0x000000 }))
    m.position.set(W / 2, y, 0)
    box.add(m)
  }

  ;(window as unknown as { __dbg: unknown }).__dbg = { world, cam, renderer, THREE }
  const draw = (t: number) => {
    film.update(t, cam, fx)
    if (params.has('dbg')) {
      const what = params.get('dbg')!
      world.traverse((o) => {
        if (what === 'noflash' && (o as THREE.Sprite).isSprite) o.visible = false
        if (what === 'nopoints' && (o as THREE.Points).isPoints) o.visible = false
        if (what === 'nolines' && (o as THREE.LineSegments).isLineSegments) o.visible = false
      })
      if (what === 'nobloom') fx.bloom = 0
    }
    bloom.intensity = fx.bloom
    chroma.offset.set(fx.chroma, fx.chroma * 0.6)
    if (params.has('raw')) {
      renderer.render(world, cam)
      return
    }
    composer.render(1 / FPS)
    renderer.autoClear = false
    renderer.render(box, boxCam)
    renderer.autoClear = true
  }

  // render mode: the capture script asks for exact frames
  ;(window as unknown as { __film: unknown }).__film = {
    fps: FPS,
    duration: DUR,
    frames: DUR * FPS,
    frame(i: number) {
      draw(i / FPS)
      renderer.getContext().finish()
      return true
    },
  }
  if (RENDER) {
    document.title = 'ready'
    return
  }

  // preview: play in real time, ?t=12.5 to hold a moment, space to pause, ←/→ to scrub
  let t = Number(params.get('t') ?? 0)
  let playing = !params.has('t')
  let last = performance.now()
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') playing = !playing
    if (e.key === 'ArrowRight') t = Math.min(DUR, t + (e.shiftKey ? 1 : 1 / FPS))
    if (e.key === 'ArrowLeft') t = Math.max(0, t - (e.shiftKey ? 1 : 1 / FPS))
    if (e.key === 'Home') t = 0
  })
  const loop = (now: number) => {
    if (playing) t = (t + (now - last) / 1000) % DUR
    last = now
    draw(t)
    ui.textContent = `${t.toFixed(2)}s  ·  space play/pause  ·  ←/→ scrub (shift = 1s)`
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

boot().catch((e) => {
  document.title = 'error'
  ui.textContent = String(e?.stack ?? e)
  console.error(e)
})
