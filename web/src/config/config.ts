export const config = {
  apiUrl: import.meta.env.VITE_ENV === 'dev' ? 'http://localhost:3010' : 'https://api.satisfactory-factories.app',
  dataVersion: '1.0-28',
}
