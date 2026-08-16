import type { APIRoute } from 'astro'
import { SLUG_ENTRIES } from '../data/slugs'
import { ITEMS_META } from '../data/items'

export const GET: APIRoute = () => {
  const origin = (import.meta.env.SITE || 'https://bloxfruit.fun').replace(/\/$/, '')
  const lastmod = ITEMS_META.updatedAt || new Date().toISOString()

  const staticUrls = [
    { loc: `${origin}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${origin}/values/`, priority: '0.9', changefreq: 'daily' },
    { loc: `${origin}/calculator/`, priority: '0.8', changefreq: 'weekly' },
  ]

  const itemUrls = SLUG_ENTRIES.map(({ slug }) => ({
    loc: `${origin}/values/${slug}/`,
    priority: '0.7',
    changefreq: 'daily' as const,
  }))

  const urls = [...staticUrls, ...itemUrls]
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join('\n')

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
