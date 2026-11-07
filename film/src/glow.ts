import * as THREE from 'three'

/** Soft radial sprite used for comet heads, stars and flashes. */
export function glowTexture(size = 256, falloff = 2.2) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    grd.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, falloff)})`)
  }
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export const GLOW = glowTexture()

/** Points with a soft sprite, additive, sizes per vertex. */
export function glowPoints(count: number, size = 1) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(count).fill(size), 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: GLOW }, opacity: { value: 1 }, scale: { value: 1080 / 2 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float scale;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float opacity;
      varying vec3 vColor;
      void main() {
        float a = texture2D(map, gl_PointCoord).a;
        gl_FragColor = vec4(vColor * a * opacity, a * opacity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return pts
}
