import { describe, expect, it } from 'vitest'
import { routes } from 'vue-router/auto-routes'
import vercelConfig from '../../vercel.json'

// The app is a client-side SPA: only `index.html` exists on disk, so any deep
// link or refresh on a sub-route (e.g. /parts) reaches Vercel as a request for a
// file that isn't there. `vercel.json` rewrites those paths back to `/` so the
// router can take over. That list is hand-maintained while the route table is
// generated from `src/pages/`, so a new page silently 404s in production until
// someone remembers to add it — which is exactly how /parts broke.
//
// This test ties the two together: add a page, add a rewrite.

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
// matches zero or more. Turn one into a matcher for a concrete request path.
const sourceMatcher = (source: string): RegExp =>
  new RegExp(`^${source
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:\w+\*/g, '.*')
    .replace(/:\w+/g, '[^/]+')}$`)

// Substitute params so a dynamic route becomes a request path a user could hit.
const sampleRequest = (routePath: string): string =>
  routePath.replace(/:\w+/g, 'sample-value')

describe('vercel SPA rewrites', () => {
  const routePaths = collectPaths(routes)

  it('finds the generated routes', () => {
    // Guards against the matcher silently passing on an empty route table.
    expect(routePaths).toContain('/parts')
    expect(routePaths.length).toBeGreaterThan(1)
  })

  // `/` is served by index.html directly, so it needs no rewrite.
  it.each(routePaths.filter(path => path !== '/'))(
    'rewrites %s back to the SPA entrypoint',
    routePath => {
      const request = sampleRequest(routePath)
      const rewrite = vercelConfig.rewrites.find(({ source }) =>
        sourceMatcher(source).test(request),
      )

      expect(
        rewrite,
        `No rewrite in web/vercel.json matches "${request}", so a refresh or deep link on this route 404s in production. Add { "source": "${routePath}", "destination": "/" }.`,
      ).toBeDefined()
      expect(rewrite?.destination).toBe('/')
    },
  )

  it('has no rewrites for routes that no longer exist', () => {
    const requests = routePaths.map(sampleRequest)
    const orphaned = vercelConfig.rewrites.filter(
      ({ source }) => !requests.some(request => sourceMatcher(source).test(request)),
    )

    expect(orphaned, 'Stale rewrites in web/vercel.json point at routes the app no longer has').toEqual([])
  })
})
