import * as THREE from 'three'

export const W = 1920
export const H = 1080

export const C = {
  ink: '#eef0f5',
  ink2: '#a3a9b8',
  mute: '#7a8296',
  dim: '#5c6375',
  green: '#5fd49b',
  card: 'rgba(17,20,28,0.72)',
  line: 'rgba(238,240,245,0.14)',
}

export interface TextOpts {
  size: number
  weight?: number
  color?: string
  align?: CanvasTextAlign
  alpha?: number
  blur?: number
  tracking?: number // px
  mono?: boolean
  baseline?: CanvasTextBaseline
  glow?: number
}

/**
 * Screen-space typography, drawn to a 2D canvas each frame and shown on a full-screen quad
 * inside the post-processing chain (so grain, vignette and fringing hit the type too).
 */
export class Hud {
  canvas = document.createElement('canvas')
  ctx: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0, 10)
  images = new Map<string, HTMLImageElement>()

  constructor() {
    this.canvas.width = W
    this.canvas.height = H
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.minFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, depthTest: false }))
    this.scene.add(quad)
  }

  async image(key: string, url: string) {
    const img = new Image()
    img.src = url
    await img.decode()
    this.images.set(key, img)
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.globalAlpha = 1
    this.ctx.filter = 'none'
    this.ctx.clearRect(0, 0, W, H)
  }

  font(o: TextOpts) {
    return `${o.weight ?? 500} ${o.size}px ${o.mono ? '"Geist Mono"' : 'Geist'}`
  }

  measure(s: string, o: TextOpts) {
    const c = this.ctx
    c.font = this.font(o)
    c.letterSpacing = `${o.tracking ?? 0}px`
    return c.measureText(s).width
  }

  text(s: string, x: number, y: number, o: TextOpts) {
    const c = this.ctx
    if ((o.alpha ?? 1) <= 0.001) return
    c.save()
    c.font = this.font(o)
    c.letterSpacing = `${o.tracking ?? 0}px`
    c.textAlign = o.align ?? 'center'
    c.textBaseline = o.baseline ?? 'alphabetic'
    c.globalAlpha = o.alpha ?? 1
    c.filter = o.blur ? `blur(${o.blur}px)` : 'none'
    if (o.glow) {
      c.shadowColor = o.color ?? C.ink
      c.shadowBlur = o.glow
    }
    c.fillStyle = o.color ?? C.ink
    c.fillText(s, x, y)
    c.restore()
  }

  /** Several coloured runs on one line, centred as a whole. */
  runs(parts: { s: string; color?: string }[], x: number, y: number, o: TextOpts) {
    const widths = parts.map((p) => this.measure(p.s, o))
    const total = widths.reduce((a, b) => a + b, 0)
    let cx = (o.align ?? 'center') === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x
    parts.forEach((p, i) => {
      this.text(p.s, cx, y, { ...o, align: 'left', color: p.color ?? o.color })
      cx += widths[i]
    })
  }

  rect(x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string, alpha = 1) {
    const c = this.ctx
    c.save()
    c.globalAlpha = alpha
    c.beginPath()
    c.roundRect(x, y, w, h, r)
    c.fillStyle = fill
    c.fill()
    if (stroke) {
      c.strokeStyle = stroke
      c.lineWidth = 1.5
      c.stroke()
    }
    c.restore()
  }

  avatar(key: string, x: number, y: number, size: number, alpha = 1) {
    const img = this.images.get(key)
    if (!img) return
    const c = this.ctx
    c.save()
    c.globalAlpha = alpha
    c.beginPath()
    c.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
    c.clip()
    c.drawImage(img, x, y, size, size)
    c.restore()
    c.save()
    c.globalAlpha = alpha
    c.strokeStyle = C.line
    c.lineWidth = 2
    c.beginPath()
    c.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
    c.stroke()
    c.restore()
  }

  fill(color: string, alpha: number) {
    if (alpha <= 0.001) return
    const c = this.ctx
    c.save()
    c.globalAlpha = alpha
    c.fillStyle = color
    c.fillRect(0, 0, W, H)
    c.restore()
  }

  commit() {
    this.texture.needsUpdate = true
  }
}

/** A text plane that lives in the 3D world (re-drawn only when its text changes). */
export class WorldText {
  canvas = document.createElement('canvas')
  ctx: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  private last = ''

  constructor(
    public w: number,
    public h: number,
    worldWidth: number,
    private draw: (ctx: CanvasRenderingContext2D, text: string, w: number, h: number) => void,
  ) {
    this.canvas.width = w
    this.canvas.height = h
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = 8
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldWidth, (worldWidth * h) / w), this.material)
  }

  set(text: string) {
    if (text === this.last) return
    this.last = text
    this.ctx.clearRect(0, 0, this.w, this.h)
    this.draw(this.ctx, text, this.w, this.h)
    this.texture.needsUpdate = true
  }
}

export async function loadFonts() {
  const faces = [new FontFace('Geist', 'url(fonts/Geist.woff2)', { weight: '100 900' }), new FontFace('Geist Mono', 'url(fonts/GeistMono.woff2)', { weight: '100 900' })]
  for (const f of faces) {
    await f.load()
    document.fonts.add(f)
  }
}
