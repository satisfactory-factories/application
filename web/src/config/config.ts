// VITE_API_URL overrides everything, and is how a build is pointed somewhere other than the
// two defaults. Vercel sets it to the preview API for the Preview environment, so no preview
// deployment can read or write live plans; production leaves it unset. See docs/deployment.md.
const apiUrl = import.meta.env.VITE_API_URL ||
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
