/**
 * Is it the reader's internet, or SF's servers? The planner itself is served from a different
 * host (Vercel) than the API (self-hosted), so if this page's own origin still answers while the
 * sync connection does not, the reader is online and SF's backend is the one in trouble.
 *
 * Same origin on purpose: no third party is told anything about the reader, and nothing extra
 * has to be allowed through a CSP or an ad blocker. robots.txt is the smallest file the site
 * serves, and the query string plus `no-store` keep any cache from answering for the network.
 */
export const PROBE_PATH = '/robots.txt'
export const PROBE_TIMEOUT_MS = 5_000

export const siteIsReachable = async (): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    const response = await fetch(`${PROBE_PATH}?probe=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    return false
  }
}
