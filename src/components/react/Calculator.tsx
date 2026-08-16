import { useEffect, useMemo, useRef, useState } from 'react'
import type { BfItem } from '../../data/catalog'
import { ITEMS, ITEMS_META } from '../../data/items'

type Side = 'you' | 'them'

const SLOT_COUNT = 4
const MAX_DIFF_PCT = 40

const RARITY_FILTERS = [
  'All',
  'Mythical',
  'Legendary',
  'Rare',
  'Uncommon',
  'Common',
  'Premium',
  'Limited',
  'Gamepass',
  'Misc',
] as const

function formatValue(value: number) {
  if (!Number.isFinite(value)) return '$0'
  const n = Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return `$${n}`
}

function sideTotal(slots: Array<BfItem | null>) {
  return slots.reduce((sum, item) => sum + (item ? item.value : 0), 0)
}

function verdict(you: number, them: number) {
  if (you === 0 && them === 0) {
    return { label: 'Add fruits to compare', tone: 'fair' as const, diffPct: 0 }
  }
  const high = Math.max(you, them)
  const low = Math.min(you, them)
  const diffPct = high === 0 ? 0 : ((high - low) / high) * 100
  if (diffPct <= 8) return { label: 'Fair trade', tone: 'fair' as const, diffPct }
  if (them > you) return { label: 'You win', tone: 'win' as const, diffPct }
  return { label: 'You lose', tone: 'lose' as const, diffPct }
}

function emptySlots(): Array<BfItem | null> {
  return Array.from({ length: SLOT_COUNT }, () => null)
}

export function Calculator() {
  const [you, setYou] = useState<Array<BfItem | null>>(emptySlots)
  const [them, setThem] = useState<Array<BfItem | null>>(emptySlots)
  const [pickerSide, setPickerSide] = useState<Side | null>(null)
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState<(typeof RARITY_FILTERS)[number]>('All')
  const searchRef = useRef<HTMLInputElement>(null)

  const youValue = sideTotal(you)
  const themValue = sideTotal(them)
  const result = verdict(youValue, themValue)
  const high = Math.max(youValue, themValue)
  const low = Math.min(youValue, themValue)
  const diffPct = high === 0 ? 0 : ((high - low) / high) * 100
  const overLimit = youValue > 0 && themValue > 0 && diffPct > MAX_DIFF_PCT

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ITEMS.filter((item) => {
      if (rarity !== 'All' && item.rarity !== rarity && item.type !== rarity) return false
      if (q && !item.name.toLowerCase().includes(q)) return false
      return true
    }).slice(0, 120)
  }, [query, rarity])

  useEffect(() => {
    if (!pickerSide) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerSide(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickerSide])

  useEffect(() => {
    if (!pickerSide) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (finePointer) {
      searchRef.current?.focus({ preventScroll: true })
    }

    const root = document.documentElement
    const syncViewport = () => {
      const vv = window.visualViewport
      const h = vv?.height ?? window.innerHeight
      const top = vv?.offsetTop ?? 0
      root.style.setProperty('--picker-vvh', `${Math.round(h)}px`)
      root.style.setProperty('--picker-vvt', `${Math.round(top)}px`)
    }
    syncViewport()
    window.visualViewport?.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('scroll', syncViewport)
    window.addEventListener('resize', syncViewport)

    return () => {
      document.body.style.overflow = prevOverflow
      root.style.removeProperty('--picker-vvh')
      root.style.removeProperty('--picker-vvt')
      window.visualViewport?.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('scroll', syncViewport)
      window.removeEventListener('resize', syncViewport)
    }
  }, [pickerSide])

  function openPicker(side: Side) {
    const slots = side === 'you' ? you : them
    if (slots.every(Boolean)) return
    setPickerSide(side)
    setQuery('')
    setRarity('All')
  }

  function removeSlot(side: Side, index: number) {
    const setter = side === 'you' ? setYou : setThem
    setter((prev) => {
      const next = prev.filter((_, i) => i !== index)
      while (next.length < SLOT_COUNT) next.push(null)
      return next
    })
  }

  function addItem(item: BfItem) {
    if (!pickerSide) return
    const setter = pickerSide === 'you' ? setYou : setThem

    setter((prev) => {
      const next = [...prev]
      // One item per slot — if already present, fill another empty slot
      const empty = next.findIndex((s) => s === null)
      if (empty < 0) return prev
      next[empty] = item
      return next
    })

    setPickerSide(null)
  }

  function clearAll() {
    setYou(emptySlots())
    setThem(emptySlots())
  }

  const canAddYou = you.some((s) => s === null)
  const canAddThem = them.some((s) => s === null)

  return (
    <section className="calc-shell">
      <header className="values-head calc-head">
        <div>
          <p className="legal-kicker">Calculator</p>
          <h1>Trade Calculator</h1>
        </div>
        <button type="button" className="calc-clear" onClick={clearAll}>
          Clear
        </button>
      </header>

      <div className="trade-popup">
        <div className="trade-board">
          <SidePanel
            title="You"
            slots={you}
            canAdd={canAddYou}
            onAdd={() => openPicker('you')}
            onRemove={(i) => removeSlot('you', i)}
          />
          <SidePanel
            title="Them"
            slots={them}
            canAdd={canAddThem}
            onAdd={() => openPicker('them')}
            onRemove={(i) => removeSlot('them', i)}
          />
        </div>

        <div className="trade-status">
          <span>{you.every((s) => !s) ? 'Not ready.' : 'Ready.'}</span>
          <span style={{ textAlign: 'right' }}>
            {them.every((s) => !s) ? 'Not ready.' : 'Ready.'}
          </span>
        </div>

        <div className="trade-values">
          <span>Value: {formatValue(youValue)}</span>
          <span style={{ textAlign: 'right' }}>Value: {formatValue(themValue)}</span>
        </div>

        <p className={`trade-verdict is-${result.tone}`}>{result.label}</p>

        <p className="trade-warn">
          {youValue === 0 && themValue === 0
            ? `Value difference: 0% (Max. ${MAX_DIFF_PCT}%) — Value must be around the same.`
            : `Value difference: ${diffPct.toFixed(0)}% (Max. ${MAX_DIFF_PCT}%)${
                overLimit ? ' — Value must be around the same.' : '.'
              }`}
        </p>
      </div>

      {pickerSide && (
        <div className="picker-backdrop" onClick={() => setPickerSide(null)} role="presentation">
          <div
            className="picker"
            role="dialog"
            aria-modal="true"
            aria-label="Add item"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="picker-head">
              <div>
                <p className="picker-kicker">Add item · 1 each</p>
                <h2>{pickerSide === 'you' ? 'You' : 'Them'}</h2>
              </div>
              <button
                type="button"
                className="picker-close"
                aria-label="Close"
                onClick={() => setPickerSide(null)}
              >
                ✕
              </button>
            </div>

            <div className="picker-toolbar">
              <label className="picker-search">
                <span>Search</span>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Dragon, Dough, Kitsune…"
                  autoComplete="off"
                  enterKeyHint="search"
                  inputMode="search"
                />
              </label>
            </div>

            <div className="picker-rarities" role="tablist" aria-label="Rarity filter">
              {RARITY_FILTERS.filter((r) => r === 'All' || ITEMS.some((i) => i.rarity === r || i.type === r)).map(
                (r) => {
                  const color =
                    r === 'All' ? undefined : ITEMS_META.rarityColors[r] || '#9a9aa3'
                  return (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={rarity === r}
                      className={`picker-rarity${rarity === r ? ' is-active' : ''}`}
                      style={
                        rarity === r && color
                          ? { borderColor: color, color, background: `${color}22` }
                          : color
                            ? { color }
                            : undefined
                      }
                      onClick={() => setRarity(r)}
                    >
                      {r}
                    </button>
                  )
                },
              )}
            </div>

            <div className="picker-list">
              {results.map((item) => {
                const color = item.rarityColor || ITEMS_META.rarityColors[item.rarity] || '#9a9aa3'
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="picker-row"
                    onClick={() => addItem(item)}
                  >
                    {item.image ? (
                      <img src={item.image} alt="" width={44} height={44} loading="lazy" />
                    ) : (
                      <span className="picker-fallback">?</span>
                    )}
                    <span className="picker-meta">
                      <strong>{item.name}</strong>
                      <em style={{ color }}>{item.rarity}</em>
                    </span>
                    <span className="picker-value">{formatValue(item.value)}</span>
                  </button>
                )
              })}
              {results.length === 0 && <p className="values-empty">No items found.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function SidePanel({
  title,
  slots,
  canAdd,
  onAdd,
  onRemove,
}: {
  title: string
  slots: Array<BfItem | null>
  canAdd: boolean
  onAdd: () => void
  onRemove: (index: number) => void
}) {
  const addIndex = slots.findIndex((s) => s === null)

  return (
    <div className="trade-side">
      <h2>{title}</h2>
      <div className="trade-grid">
        {slots.map((item, index) => {
          if (item) {
            return (
              <button
                key={`${item.id}-${index}`}
                type="button"
                className="trade-slot is-filled"
                onClick={() => onRemove(index)}
                aria-label={`Remove ${item.name} from ${title}`}
              >
                <span className="trade-slot-name">{item.name}</span>
                <span className="trade-slot-art">
                  {item.image ? (
                    <img src={item.image} alt="" width={64} height={64} />
                  ) : (
                    <span className="item-card-fallback">?</span>
                  )}
                </span>
                <span className="trade-slot-price">{formatValue(item.value)}</span>
              </button>
            )
          }

          const isAdd = canAdd && index === addIndex
          return (
            <button
              key={`empty-${index}`}
              type="button"
              className={`trade-slot is-empty${isAdd ? ' is-add' : ''}`}
              onClick={isAdd ? onAdd : undefined}
              disabled={!isAdd}
              aria-label={isAdd ? `Add item to ${title}` : `${title} empty slot ${index + 1}`}
            >
              {isAdd ? <span className="trade-slot-plus" aria-hidden="true">+</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
