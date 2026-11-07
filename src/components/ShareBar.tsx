import { useState } from 'react'
import { useProfile, viewerHref } from '../lib/profile'
import { Icon } from './ui'

/** Clean, shareable link to the portfolio on screen (no ?skip, ?demo or archive filters). */
export function shareUrl(handle: string, isOwner: boolean) {
  return new URL(isOwner ? viewerHref(null) : viewerHref(handle), location.origin).toString()
}

/** Clipboard API first; the older selection-based copy when it is blocked (unfocused page, http). */
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (!ok) throw new Error('copy failed')
  }
}

/** Share this portfolio (native share sheet where available, else copy) and fork the site. */
export function ShareBar() {
  const profile = useProfile()
  const [copied, setCopied] = useState(false)
  const url = shareUrl(profile.handle, profile.isOwner)

  const share = async () => {
    const data = { title: `${profile.name} · open-source work`, text: `${profile.name}'s merged open-source pull requests`, url }
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share(data)
        return
      }
      await copy(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* share sheet dismissed */
    }
  }

  return (
    <div className="share-bar">
      <button type="button" className="btn btn-ghost small" onClick={share} aria-live="polite">
        <Icon name="arrow" size={13} /> {copied ? 'Link copied' : 'Share'}
      </button>
      {__SOURCE_REPO__ && (
        <a className="btn btn-ghost small" href={`https://github.com/${__SOURCE_REPO__}/fork`} target="_blank" rel="noopener noreferrer">
          <Icon name="merge" size={13} /> Fork this site
        </a>
      )}
    </div>
  )
}
