/** www → apex host redirect for Cloudflare Pages */
export async function onRequest(context) {
  const url = new URL(context.request.url)
  if (url.hostname === 'www.bloxfruit.fun') {
    url.hostname = 'bloxfruit.fun'
    return Response.redirect(url.toString(), 301)
  }
  return context.next()
}
