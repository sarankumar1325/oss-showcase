/**
 * The visitor's optional GitHub token. It never leaves this browser except as an
 * Authorization header to api.github.com. Session-only unless they tick "remember".
 */
import { setTokenSource } from './github'

const KEY = 'oss:gh-token'
const listeners = new Set<() => void>()

const read = (s: () => Storage) => {
  try {
    return s().getItem(KEY)
  } catch {
    return null
  }
}

export function getToken(): string | null {
  return read(() => sessionStorage) || read(() => localStorage)
}

export function isRemembered() {
  return !!read(() => localStorage)
}

export function setToken(token: string | null, remember = false) {
  for (const s of [() => sessionStorage, () => localStorage]) {
    try {
      s().removeItem(KEY)
    } catch {
      /* storage blocked */
    }
  }
  if (token) {
    try {
      ;(remember ? localStorage : sessionStorage).setItem(KEY, token.trim())
    } catch {
      /* storage blocked: the token simply won't persist */
    }
  }
  listeners.forEach((fn) => fn())
}

export const onTokenChange = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Fine-grained token page, prefilled. No permissions are passed, so none are selected. */
export const CREATE_TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?' +
  new URLSearchParams({
    name: 'OSS showcase (public read)',
    description: 'Read-only access to public data for an open-source showcase. No permissions needed.',
    expires_in: '90',
  }).toString()

setTokenSource(getToken)
