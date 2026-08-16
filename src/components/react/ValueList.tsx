import { useEffect, useMemo, useRef, useState } from 'react'
import { SIDEBAR_FILTERS, type BfItem } from '../../data/catalog'
import { ITEMS } from '../../data/items'
import { itemHref } from '../../data/slugs'
import { DemandStars } from './DemandStars'

type SortKey = 'value-desc' | 'value-asc' | 'name' | 'demand'

function formatValue(value: number) {
  if (!Number.isFinite(value)) return '$0'
  const n = Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return `$${n}`
}

function readParams() {
  if (typeof window === 'undefined') {
    return { filter: 'all', sort: 'value-desc' as SortKey, q: '' }
  }
  const sp = new URLSearchParams(window.location.search)
  const filter = sp.get('filter') || sp.get('rarity') || sp.get('type') || 'all'
  const sort = (sp.get('sort') as SortKey) || 'value-desc'
  return { filter, sort, q: sp.get('q') || '' }
}

function writeParams(filter: string, sort: SortKey, q: string) {
  const sp = new URLSearchParams()
  if (filter !== 'all') {
    const meta = SIDEBAR_FILTERS.find((f) => f.id === filter)
    if (meta?.kind === 'rarity') sp.set('rarity', filter)
    else if (meta?.kind === 'type') sp.set('type', filter)
    else sp.set('filter', filter)
  }
  if (sort !== 'value-desc') sp.set('sort', sort)
  if (q.trim()) sp.set('q', q.trim())
  const next = `/values/${sp.toString() ? `?${sp}` : ''}`
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.replaceState(null, '', next)
  }
}

export function ValueList() {
  const initial = readParams()
  const [query, setQuery] = useState(initial.q)
  const [filter, setFilter] = useState(initial.filter)
  const [sort, setSort] = useState<SortKey>(initial.sort)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const meta = SIDEBAR_FILTERS.find((f) => f.id === filter)
    let list = ITEMS.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false
      if (!meta || meta.kind === 'all') return true
      if (meta.kind === 'rarity') return item.rarity === meta.id
      return item.type === meta.id
    })

    list = [...list].sort((a, b) => {
      if (sort === 'value-desc') return b.value - a.value
      if (sort === 'value-asc') return a.value - b.value
      if (sort === 'demand') return b.demand - a.demand
      return a.name.localeCompare(b.name)
    })
    return list
  }, [query, filter, sort])

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: ITEMS.length }
    for (const f of SIDEBAR_FILTERS) {
      if (f.kind === 'all') continue
      if (f.kind === 'rarity') map[f.id] = ITEMS.filter((i) => i.rarity === f.id).length
      else map[f.id] = ITEMS.filter((i) => i.type === f.id).length
    }
    return map
  }, [])

  useEffect(() => {
    writeParams(filter, sort, query)
  }, [filter, sort, query])

  useEffect(() => {
    if (!menuId) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuId(null)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuId])

  const activeLabel = SIDEBAR_FILTERS.find((f) => f.id === filter)?.label || 'All Items'

  async function copyLink(item: BfItem) {
    const url = `${window.location.origin}${itemHref(item)}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // ignore
    }
    setMenuId(null)
  }

  return (
    <section className="values-shell">
      <header className="values-head">
        <div>
          <p className="legal-kicker">Value List</p>
          <h1>Blox Fruits Values</h1>
        </div>
        <button
          type="button"
          className="values-mobile-toggle"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? 'Hide filters' : 'Categories'}
        </button>
      </header>

      <div className="values-layout">
        <aside className={`values-side${mobileOpen ? ' is-open' : ''}`}>
          <p className="values-side-title">Browse</p>
          <nav className="values-nav" aria-label="Item categories">
            {SIDEBAR_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={filter === f.id ? 'is-active' : undefined}
                onClick={() => {
                  setFilter(f.id)
                  setMobileOpen(false)
                }}
              >
                <span>{f.label}</span>
                <em>{counts[f.id] ?? 0}</em>
              </button>
            ))}
          </nav>
        </aside>

        <div className="values-main">
          <div className="values-toolbar">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${activeLabel.toLowerCase()}…`}
              autoComplete="off"
              aria-label="Search items"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort"
            >
              <option value="value-desc">Value ↓</option>
              <option value="value-asc">Value ↑</option>
              <option value="demand">Demand</option>
              <option value="name">Name</option>
            </select>
          </div>

          <div className="values-grid">
            {filtered.map((item: BfItem) => {
              const href = itemHref(item)
              const open = menuId === item.id
              return (
                <article key={item.id} className="item-card">
                  <div className="item-card-name">{item.name}</div>
                  <div className="item-card-body">
                    <div className="item-card-menu" ref={open ? menuRef : undefined}>
                      <button
                        type="button"
                        className="item-card-more"
                        aria-label={`More for ${item.name}`}
                        aria-expanded={open}
                        onClick={() => setMenuId(open ? null : item.id)}
                      >
                        ⋯
                      </button>
                      {open && (
                        <div className="item-card-dropdown" role="menu">
                          <a role="menuitem" href={href}>
                            Open page
                          </a>
                          <button type="button" role="menuitem" onClick={() => copyLink(item)}>
                            Copy link
                          </button>
                        </div>
                      )}
                    </div>
                    <a className="item-card-link" href={href}>
                      <div className="item-card-art">
                        {item.image ? (
                          <img src={item.image} alt="" width={72} height={72} loading="lazy" />
                        ) : (
                          <span className="item-card-fallback">?</span>
                        )}
                      </div>
                      <div className="item-card-price">{formatValue(item.value)}</div>
                      <div className="item-card-meta">
                        <span style={{ color: item.rarityColor }}>{item.rarity}</span>
                        <DemandStars demand={item.demand} />
                      </div>
                    </a>
                  </div>
                </article>
              )
            })}
          </div>
          {filtered.length === 0 && <p className="values-empty">No items found.</p>}
        </div>
      </div>
    </section>
  )
}
