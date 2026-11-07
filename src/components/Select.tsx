import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, Icon } from './ui'

export interface Opt {
  value: string
  label: string
  hint?: string
}

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  options: Opt[]
  placeholder: string
  searchable?: boolean
  className?: string
}

/** A fully custom listbox — the native OS dropdown can't be themed and breaks the aesthetic. */
export function Select({ label, value, onChange, options, placeholder, searchable = false, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()

  const all = useMemo<Opt[]>(() => [{ value: '', label: placeholder }, ...options], [options, placeholder])
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? all.filter((o) => o.value && o.label.toLowerCase().includes(n)) : all
  }, [q, all])
  const sel = all.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    setQ('')
    setHi(Math.max(0, all.findIndex((o) => o.value === value)))
    const t = setTimeout(() => (searchable ? search.current : list.current)?.focus(), 30)
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', onDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => setHi(0), [q])

  useEffect(() => {
    const l = list.current
    const el = l?.querySelector<HTMLElement>(`[data-i="${hi}"]`)
    if (!l || !el) return
    if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop
    else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight
  }, [hi, open])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    btn.current?.focus()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi((h) => Math.min(shown.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => Math.max(0, h - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setHi(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setHi(shown.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (shown[hi]) pick(shown[hi].value)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
      btn.current?.focus()
    } else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div className={`select ${className}`} ref={root}>
      <span className="select-label mono" id={`${id}-l`}>
        {label}
      </span>
      <button
        ref={btn}
        type="button"
        className={`select-btn ${open ? 'open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-l`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className={`select-val ${value ? '' : 'is-ph'}`}>{value ? sel?.label : placeholder}</span>
        <svg className="select-chev" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m1 1 5 5 5-5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="select-pop"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.28, ease: EASE }}
            onKeyDown={onKey}
          >
            {searchable && (
              <div className="select-search">
                <Icon name="search" size={15} />
                <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find ${label.toLowerCase()}…`} spellCheck={false} autoComplete="off" aria-label={`Filter ${label}`} />
                <kbd className="mono">esc</kbd>
              </div>
            )}
            <ul ref={list} role="listbox" tabIndex={-1} aria-labelledby={`${id}-l`} data-lenis-prevent>
              {shown.map((o, i) => (
                <li
                  key={o.value || '__all'}
                  data-i={i}
                  role="option"
                  aria-selected={o.value === value}
                  className={`${i === hi ? 'hi' : ''} ${o.value === value ? 'sel' : ''}`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o.value)}
                >
                  <span className="opt-check" aria-hidden="true">
                    {o.value === value && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 4 4L20 5" />
                      </svg>
                    )}
                  </span>
                  <span className="opt-label">{o.label}</span>
                  {o.hint && <span className="opt-hint mono">{o.hint}</span>}
                </li>
              ))}
              {shown.length === 0 && <li className="select-empty mono">No matches</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
