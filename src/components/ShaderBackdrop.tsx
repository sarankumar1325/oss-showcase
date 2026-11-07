import { useEffect, useRef } from 'react'

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uScroll;
uniform float uPulse;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  float a = hash(i), b = hash(i + vec2(1., 0.)), c = hash(i + vec2(0., 1.)), d = hash(i + vec2(1., 1.));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= .5; }
  return v;
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  vec2 p = (frag - .5 * uRes) / uRes.y;
  vec2 m = (uMouse - .5) * vec2(uRes.x / uRes.y, 1.);
  float t = uTime * .04;

  vec2 dm = p - m;
  p += .09 * dm * exp(-length(dm) * 3.0);

  vec2 q = vec2(fbm(p * 1.3 + vec2(0., t)), fbm(p * 1.3 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p * 1.8 + 3.5 * q + vec2(1.7, 9.2) + 1.2 * t), fbm(p * 1.8 + 3.5 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p * 1.4 + 3.8 * r);

  vec3 col = vec3(.043, .051, .078);
  col += vec3(.055, .062, .085) * smoothstep(.3, 1., f);
  col += vec3(.04, .045, .06) * pow(max(f - .55, 0.), 2.) * 3.;

  float d = length(p - m);
  col += vec3(.035, .038, .05) * exp(-d * 3.2);
  col += vec3(.37, .83, .61) * uPulse * .12 * exp(-length(p) * 1.6);

  float v = smoothstep(1.15, .15, length(uv - .5) * 1.25);
  col *= mix(.75, 1., v);
  col *= mix(1., .3, uScroll);
  col += (hash(frag + uTime) - .5) / 255. * 1.6;
  gl_FragColor = vec4(col, 1.);
}`

export function ShaderBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl) {
      cv.style.display = 'none'
      return
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      cv.style.display = 'none'
      return
    }
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = {
      res: gl.getUniformLocation(prog, 'uRes'),
      time: gl.getUniformLocation(prog, 'uTime'),
      mouse: gl.getUniformLocation(prog, 'uMouse'),
      scroll: gl.getUniformLocation(prog, 'uScroll'),
      pulse: gl.getUniformLocation(prog, 'uPulse'),
    }

    const SCALE = 0.55
    const resize = () => {
      cv.width = Math.max(2, Math.floor(window.innerWidth * SCALE))
      cv.height = Math.max(2, Math.floor(window.innerHeight * SCALE))
      gl.viewport(0, 0, cv.width, cv.height)
    }
    resize()
    window.addEventListener('resize', resize)

    const target = { x: 0.62, y: 0.55 }
    const cur = { x: 0.62, y: 0.55 }
    let pulse = 0
    let scroll = 0
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX / window.innerWidth
      target.y = 1 - e.clientY / window.innerHeight
    }
    const onScroll = () => {
      scroll = Math.min(1, window.scrollY / (window.innerHeight * 0.9))
    }
    const onPulse = () => {
      pulse = 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('oss:pulse', onPulse)

    let raf = 0
    const t0 = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) return
      cur.x += (target.x - cur.x) * 0.04
      cur.y += (target.y - cur.y) * 0.04
      pulse *= 0.965
      gl.uniform2f(u.res, cv.width, cv.height)
      gl.uniform1f(u.time, (now - t0) / 1000)
      gl.uniform2f(u.mouse, cur.x, cur.y)
      gl.uniform1f(u.scroll, scroll)
      gl.uniform1f(u.pulse, pulse)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('oss:pulse', onPulse)
      gl.deleteProgram(prog)
      gl.deleteBuffer(buf)
    }
  }, [])

  return <canvas ref={ref} className="shader" aria-hidden="true" />
}
