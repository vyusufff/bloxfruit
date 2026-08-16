/** Map Traderie 0–10 demand onto a 0–5 star scale (supports halves). */
export function demandToStars(demand: number): number {
  const n = Number.isFinite(demand) ? Math.max(0, Math.min(10, demand)) : 0
  return Math.round(n) / 2
}

type StarKind = 'full' | 'half' | 'empty'

function starKinds(stars: number): StarKind[] {
  const out: StarKind[] = []
  for (let i = 1; i <= 5; i++) {
    if (stars >= i) out.push('full')
    else if (stars >= i - 0.5) out.push('half')
    else out.push('empty')
  }
  return out
}

export function DemandStars({ demand }: { demand: number }) {
  const stars = demandToStars(demand)
  const label = `${stars} / 5 demand`
  const kinds = starKinds(stars)

  return (
    <div className="demand-stars" role="img" aria-label={label} title={label}>
      {kinds.map((kind, i) => (
        <span key={i} className={`demand-star is-${kind}`} aria-hidden="true">
          {kind === 'half' ? (
            <>
              <span className="demand-star-empty">★</span>
              <span className="demand-star-half">★</span>
            </>
          ) : (
            '★'
          )}
        </span>
      ))}
    </div>
  )
}
