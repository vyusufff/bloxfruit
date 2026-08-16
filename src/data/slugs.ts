import type { BfItem } from './catalog'
import { ITEMS } from './items'

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type SlugEntry = {
  slug: string
  item: BfItem
}

function shortId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase() || 'item'
}

export function buildSlugEntries(items: BfItem[] = ITEMS): SlugEntry[] {
  const used = new Map<string, number>()
  const entries: SlugEntry[] = []

  for (const item of items) {
    let base = slugifyName(item.name) || slugifyName(item.id) || `item-${shortId(item.id)}`
    const seen = used.get(base) || 0
    used.set(base, seen + 1)
    const slug = seen === 0 ? base : `${base}-${shortId(item.id)}`
    entries.push({ slug, item })
  }

  return entries
}

const ENTRIES = buildSlugEntries()
const BY_SLUG = new Map(ENTRIES.map((e) => [e.slug, e.item]))
const BY_ID = new Map(ENTRIES.map((e) => [e.item.id, e.slug]))

export const SLUG_ENTRIES = ENTRIES

export function itemSlug(item: BfItem): string {
  return BY_ID.get(item.id) || slugifyName(item.name)
}

export function itemBySlug(slug: string): BfItem | undefined {
  return BY_SLUG.get(slug)
}

export function itemHref(item: BfItem): string {
  return `/values/${itemSlug(item)}/`
}

export function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '$0'
  const n = Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return `$${n}`
}
