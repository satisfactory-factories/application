/**
 * safeHtml.ts — escape untrusted text before it reaches a `v-html`.
 *
 * Tooltip and toast strings are assembled from plan data: part ids, factory names, group names.
 * A share link decides all three, and an unrecognised part id is echoed back verbatim as
 * "UNKNOWN PART <id>!" — so a crafted link could put markup into a tooltip and have it executed
 * on the visitor's page, with the auth token sitting in localStorage on the same origin.
 *
 * The strings genuinely need a little markup (the tooltips use <br> and <b>), so this escapes
 * everything and then restores a fixed list of formatting tags. Attributes are never restored,
 * which is what makes an `onerror` payload inert even if its tag were on the list.
 */

// Restored after escaping. Deliberately short: anything not named here stays escaped and renders
// as visible text, which is the safe failure.
const ALLOWED_TAGS = /&lt;(\/?)(br|b|i|u|em|strong|ul|ol|li|small)\s*\/?&gt;/gi

export const safeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(ALLOWED_TAGS, (_match, slash: string, tag: string) => `<${slash}${tag.toLowerCase()}>`)
