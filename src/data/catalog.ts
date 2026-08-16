export type BfItem = {
  id: string
  name: string
  value: number
  demand: number
  rarity: string
  rarityColor?: string
  type: string
  image: string
}

export const SIDEBAR_FILTERS = [
  { id: 'all', label: 'All Items', kind: 'all' as const },
  { id: 'Mythical', label: 'Mythicals', kind: 'rarity' as const },
  { id: 'Legendary', label: 'Legendaries', kind: 'rarity' as const },
  { id: 'Limited', label: 'Limited', kind: 'rarity' as const },
  { id: 'Rare', label: 'Rares', kind: 'rarity' as const },
  { id: 'Uncommon', label: 'Uncommons', kind: 'rarity' as const },
  { id: 'Common', label: 'Commons', kind: 'rarity' as const },
  { id: 'Fruit', label: 'Fruits', kind: 'type' as const },
  { id: 'Gamepass', label: 'Gamepasses', kind: 'type' as const },
  { id: 'Item', label: 'Items', kind: 'type' as const },
]
