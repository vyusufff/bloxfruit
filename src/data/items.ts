export type { BfItem } from './catalog'
export { SIDEBAR_FILTERS } from './catalog'

import payload from './items.json'
import type { BfItem } from './catalog'

export const ITEMS_META = {
  updatedAt: payload.updatedAt as string,
  source: payload.source as string,
  count: payload.count as number,
  rarityColors: (payload.rarityColors || {}) as Record<string, string>,
}

export const ITEMS = payload.items as BfItem[]
