import { describe, expect, it } from 'vitest'
import { routes } from 'vue-router/auto-routes'
import vercelConfig from '../../vercel.json'

// The app is a client-side SPA: only `index.html` exists on disk, so any deep
// link or refresh on a sub-route (e.g. /parts) reaches Vercel as a request for
// a file that isn't there. `vercel.json` has to rewrite those back to the
// entrypoint so the router can take over.
//
// This used to be a hand-maintained list of routes, which meant every new page
// in `src/pages/` 404'd in production until someone remembered to add it — how
// /parts broke. It's a single catch-all now, so the list can't drift. These
// tests hold that property in place: the catch-all covers every generated
// route, and nobody quietly reintroduces the allowlist.
//
// The one thing the catch-all must NOT swallow is `/_vercel/*`. Those paths are
// served by the platform (@vercel/analytics and @vercel/speed-insights fetch
// their scripts from there), and a bare `/(.*)` hands them index.html instead —
// the browser then parses HTML as JS and analytics silently dies. Hence the
// negative lookahead, and the test below pinning it.

const { rewrites } = vercelConfig

// Collect every path the generated route table can resolve, as full paths.
const collectPaths = (records: readonly any[], parent = ''): string[] =>
  records.flatMap(record => {
    const path = record.path.startsWith('/')
      ? record.path
      : `${parent.replace(/\/$/, '')}/${record.path}`
    return [
      ...(record.component ? [path] : []),
      ...collectPaths(record.children ?? [], path),
    ]
  })

// Vercel sources use path-to-regexp: `:name` matches one segment, `:name*`
// matches zero or more, and bare regex groups pass through. Turn a source into
// a matcher for a concrete request path.
const sourceMatcher = (source: string): RegExp =>
  new RegExp(`^${source
    .replace(/:\w+\*/g, '.*')
    .replace(/:\w+/g, '[^/]+')}$`)

// Substitute params so a dynamic route becomes a request path a user could hit.
const sampleRequest = (routePath: string): string =>
  routePath
    .replace(/:\w+\(\.\*\)\*?/g, 'some/unknown/url')
    .replace(/:\w+/g, 'sample-value')

describe('vercel SPA rewrites', () => {
  const routePaths = collectPaths(routes)

  it('finds the generated routes', () => {
    // Guards against the assertions below passing on an empty route table.
    expect(routePaths).toContain('/parts')
    expect(routePaths.length).toBeGreaterThan(1)
  })

  it('serves the SPA from a single catch-all, not a per-route allowlist', () => {
    // If this fails because someone added a route-specific entry, delete it —
    // the catch-all already covers it. Adding pages must stay a zero-config
    // operation; enumerating them here is what caused the /parts 404.
    expect(rewrites).toEqual([{ source: '/((?!_vercel/).*)', destination: '/index.html' }])
  })

  it.each([
    '/_vercel/insights/script.js',
    '/_vercel/speed-insights/script.js',
    '/_vercel/image',
  ])('leaves the platform-served path %s alone', request => {
    // Rewriting these to index.html makes the browser parse HTML as JavaScript
    // ("Unexpected token '<'") and kills analytics with no visible symptom.
    expect(rewrites.some(({ source }) => sourceMatcher(source).test(request))).toBe(false)
  })

  it.each(routePaths)('rewrites %s back to the SPA entrypoint', routePath => {
    const request = sampleRequest(routePath)
    const rewrite = rewrites.find(({ source }) => sourceMatcher(source).test(request))

    expect(
      rewrite,
      `No rewrite in web/vercel.json matches "${request}", so a refresh or deep link on this route 404s in production.`,
    ).toBeDefined()
    expect(rewrite?.destination).toBe('/index.html')
  })

  it('also rewrites URLs that match no route, so they reach the not-found page', () => {
    // Without this the request 404s at the CDN and the in-app not-found page
    // never gets a chance to render.
    const request = '/no/such/page'
    expect(rewrites.some(({ source }) => sourceMatcher(source).test(request))).toBe(true)
  })
})
