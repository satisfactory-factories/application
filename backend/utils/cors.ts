// Which origins this deployment answers cross-origin calls from. Kept pure and away from
// Express so it can be unit tested — see cors.spec.ts.
//
// Production leaves CORS_EXTRA_ORIGINS unset and keeps exactly the static list. The preview
// API sets it, because Vercel gives every preview deployment a fresh hostname and there is no
// list to enumerate in advance.

// The origins every deployment allows, whatever the environment says.
export const STATIC_ORIGINS = ['http://localhost:3000', 'https://api.satisfactory-factories.app'];

// Comma-separated. An entry starting with `*.` matches any subdomain of the rest of it, so
// `*.vercel.app` covers every preview deployment; anything else is an exact origin match.
export const parseExtraOrigins = (raw: string | undefined): string[] =>
  (raw ?? '').split(',').map(entry => entry.trim()).filter(Boolean);

export const isAllowedOrigin = (origin: string, extra: string[]): boolean => {
  if (STATIC_ORIGINS.includes(origin)) return true;

  return extra.some(entry => {
    if (!entry.startsWith('*.')) return entry === origin;

    // Match on the parsed hostname rather than the raw string. Substring matching here would
    // accept 'https://evil.com/#.vercel.app', and a wildcard is exactly where that gets tried.
    try {
      return new URL(origin).hostname.endsWith(entry.slice(1));
    } catch {
      return false;
    }
  });
};
