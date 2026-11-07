/**
 * Date helpers bucketed in one configurable IANA time zone.
 * Call setTimeZone() once at startup (and again if the viewed profile changes).
 */

let TZ = 'UTC'
let TZ_LABEL = 'UTC'

let keyFmt: Intl.DateTimeFormat
let hourFmt: Intl.DateTimeFormat
let dateFmt: Intl.DateTimeFormat
let shortFmt: Intl.DateTimeFormat
let fullFmt: Intl.DateTimeFormat

const make = () => {
  keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' })
  dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
  shortFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' })
  fullFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

/** The visitor's own zone, used when nothing else is configured. */
export const localTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const deriveLabel = (tz: string) => {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')
    return part?.value ?? tz
  } catch {
    return tz
  }
}

export function setTimeZone(tz: string, label?: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    TZ = tz
  } catch {
    TZ = 'UTC'
  }
  TZ_LABEL = label || deriveLabel(TZ)
  make()
}
setTimeZone('UTC')

export const timeZone = () => TZ
export const tzLabel = () => TZ_LABEL

const memo = new Map<string, string>()
/** YYYY-MM-DD in the configured zone. */
export const dayKey = (v: string | number | Date): string => {
  if (typeof v === 'string') {
    const hit = memo.get(TZ + v)
    if (hit) return hit
    const k = keyFmt.format(new Date(v))
    memo.set(TZ + v, k)
    return k
  }
  return keyFmt.format(new Date(v))
}

/** Hour of day 0–23 in the configured zone. */
export const hourOf = (v: string | number | Date): number => Number(hourFmt.format(new Date(v))) % 24

export const fmtDate = (v: string | number | Date) => dateFmt.format(new Date(v))
export const fmtShort = (v: string | number | Date) => shortFmt.format(new Date(v))
export const fmtFull = (v: string | number | Date) => `${fullFmt.format(new Date(v))} ${TZ_LABEL}`

/** Format a YYYY-MM-DD day key itself (no zone shift: the key already is a local day). */
const keyDate = (k: string) => new Date(k + 'T12:00:00Z')
const keyShortFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const keyLongFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })
const keyDayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
export const fmtKeyShort = (k: string) => keyShortFmt.format(keyDate(k))
export const fmtKeyDate = (k: string) => keyLongFmt.format(keyDate(k))
export const fmtKeyDay = (k: string) => keyDayFmt.format(keyDate(k))

export function ago(from: number | string | Date, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(s / 3600)
  if (h < 36) return `${h}h ago`
  const d = Math.round(s / 86400)
  return `${d}d ago`
}

export const pad2 = (n: number) => String(n).padStart(2, '0')

export const initials = (name: string) => name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '··'
