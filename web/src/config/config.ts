// Under Vitest neither of the two defaults below will do. `VITE_ENV` is unset there, so every
// unit test resolved to the live API — and one of them opened a real socket to it, until the
// inert `WebSocket` in `setup-vitest.ts` stopped that. No unit test has business reaching a
// server, the preview API included: that one is a single shared instance, and a suite that
// talks to it is both slower and able to disturb whatever else is pointed at it. Real requests
// belong in the e2e suite, which builds with `VITE_ENV=dev` and boots its own API on 3001.
//
// So the test URL is a port nothing listens on: whatever slips past the mocks fails at once,
// on this machine, rather than travelling. `setup-vitest.ts` refuses the request before it gets
// even that far — this is what that refusal falls back on, and what a spec asserting on a
// request's URL builds from.
const TEST_API_URL = 'http://127.0.0.1:1'

// VITE_API_URL overrides everything, and is how a build is pointed somewhere other than the
// two defaults. Vercel sets it to the preview API for the Preview environment, so no preview
// deployment can read or write live plans; production leaves it unset. See docs/deployment.md.
const apiUrl = import.meta.env.MODE === 'test'
  ? TEST_API_URL
  : import.meta.env.VITE_API_URL ||
  (import.meta.env.VITE_ENV === 'dev' ? 'http://localhost:3001' : 'https://api.satisfactory-factories.app')

export const config = {
  apiUrl,
  // This build's version, from the repo root package.json. Sent on every API request so the
  // backend can refuse writes from a tab too old to know the current save shape. Nothing to do
  // with `plannerVersion` below, which is a property of a plan rather than of the app.
  appVersion: import.meta.env.VITE_APP_VERSION,
  // The commit this bundle was built from, 12 characters, or empty when built outside CI.
  // Reported in the heartbeat so a rollout can be watched by commit as well as by release.
  gitSha: import.meta.env.VITE_GIT_SHA,
  dataVersion: '1.2-09',
  // Stamped onto every factory as `plannerVersion`, marking a plan as having been answered for
  // the raw-resources change. Bump only when a release needs to ask a plan-wide question again.
  plannerVersion: '0.6',
}
