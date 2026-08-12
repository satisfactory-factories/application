export const config = {
  apiUrl: import.meta.env.VITE_ENV === 'dev' ? 'http://localhost:3001' : 'https://api.satisfactory-factories.app',
  dataVersion: '1.2-07',
  // Stamped onto every factory as `plannerVersion`, marking a plan as having been answered for
  // the raw-resources change. Bump only when a release needs to ask a plan-wide question again.
  plannerVersion: '0.6',
}
