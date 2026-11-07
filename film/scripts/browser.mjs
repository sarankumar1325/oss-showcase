// Shared: serve the film with Vite and open it in headless Chrome on the GPU.
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CANDIDATES = [
  fileURLToPath(new URL('../../video/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell', import.meta.url)),
  `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-152.0.7977.42/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
]

export async function openFilm() {
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false } })
  await server.listen()
  const url = server.resolvedUrls.local[0]
  const executablePath = process.env.CHROME || CANDIDATES.find((p) => existsSync(p))
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars', '--disable-background-timer-throttling', '--force-color-profile=srgb'],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    protocolTimeout: 600_000,
  })
  const page = await browser.newPage()
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()))
  page.on('pageerror', (e) => console.error('[page error]', e.message))
  await page.goto(url + '?render' + (process.env.FILM_QS || ''), { waitUntil: 'load' })
  await page.waitForFunction(() => document.title === 'ready' || document.title === 'error', { timeout: 180_000 })
  if ((await page.title()) === 'error') throw new Error(await page.$eval('#ui', (e) => e.textContent))
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2')
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  console.log('GPU:', renderer)

  /** render frame i and return it as a JPEG/PNG buffer */
  async function frame(i, type = 'image/jpeg', quality = 0.96) {
    const data = await page.evaluate(
      (i, type, quality) => {
        window.__film.frame(i)
        return document.querySelector('canvas').toDataURL(type, quality)
      },
      i,
      type,
      quality,
    )
    return Buffer.from(data.split(',')[1], 'base64')
  }
  async function close() {
    await browser.close()
    await server.close()
  }
  const info = await page.evaluate(() => ({ fps: window.__film.fps, frames: window.__film.frames }))
  return { frame, close, page, ...info }
}
