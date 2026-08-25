export const config = {
  apiUrl: import.meta.env.VITE_ENV === 'dev' ? 'http://localhost:3001' : 'https://api.satisfactory-factories.app',
  // This build's version, from the repo root package.json. Sent on every API request so the
  // backend can refuse writes from a tab too old to know the current save shape. Nothing to do
  // with `plannerVersion` below, which is a property of a plan rather than of the app.
  appVersion: import.meta.env.VITE_APP_VERSION,
  dataVersion: '1.2-09',
  // Stamped onto every factory as `plannerVersion`, marking a plan as having been answered for
  // the raw-resources change. Bump only when a release needs to ask a plan-wide question again.
  plannerVersion: '0.6',
}
