/**
 * colors.ts — the single source of truth for the planner's semantic colours.
 *
 * Historically colours were scattered across `global.scss` (the `.sf-chip` classes),
 * per-component scoped SCSS (e.g. the power table), hardcoded hexes, and Vuetify
 * `color="green"` props that resolved to Material defaults that did NOT match the
 * chip hexes. This module centralises them.
 *
 * How it reaches the styles: `applySfColorVars()` (called once from `main.ts`) writes
 * every token to a `--sf-*` CSS custom property on `:root`, so SCSS references
 * `var(--sf-power-consumption)` and templates can bind `:style` / import the raw hex —
 * all from ONE definition here. Change a value here and it updates everywhere.
 *
 * When adding a coloured chip/label, use a SEMANTIC token (`product`, `building`,
 * `powerConsumption`, …) — a `.sf-chip` semantic class or `var(--sf-*)` — rather than a
 * new literal hex.
 */

// Raw palette — the only place literal colour values live. Prefer a semantic token below.
export const palette = {
  red: '#f44336',
  green: '#4caf50',
  blue: '#2196f3',
  blueBorder: '#016fcc',
  cyan: '#a3ceff',
  cyanBorder: '#4b97df',
  beige: '#e8d5a3',
  beigeBorder: '#b39a58',
  orange: '#f57f17',
  orangeBorder: '#a75600',
  yellow: '#fbc02d',
  yellowBorder: '#ac9902',
  purple: '#bd67ff',
  purpleBorder: '#9a1df6',
  lightBlue: '#4fc3f7',
  lightBlueBorder: '#0288d1',
  grey: '#bdbdbd',
  greyBorder: '#7f7f7f',
} as const

export interface SfColor {
  color: string
  border: string
  // Optional fill for chips/surfaces that carry a background (published as --sf-<name>-bg).
  background?: string
}

// Semantic tokens — map a domain concept to a colour. This is what components should reference.
export const sfColors = {
  // The app chrome: burnt FICSIT orange main header (colour) with its gold bottom
  // border. Also used by the divider between factory cards in the planner.
  header: { color: '#6c3e26', border: '#ba7800' },

  // A factory itself — used wherever another factory is referenced (import/export
  // links, satisfaction export requests, summary rows). Neutral white-on-grey, with
  // the same background as the factory card header so the two always match.
  factory: { color: '#ffffff', border: palette.greyBorder, background: 'rgba(43, 43, 43, 0.4)' },

  // Items & flows
  product: { color: palette.blue, border: palette.blueBorder },
  byproduct: { color: palette.cyan, border: palette.cyanBorder },
  rawResource: { color: palette.beige, border: palette.beigeBorder },
  building: { color: palette.orange, border: palette.orangeBorder },
  import: { color: palette.grey, border: palette.greyBorder },
  somersloop: { color: palette.purple, border: palette.purpleBorder },

  // Power (these were the most inconsistent — the power table used bespoke hexes
  // that no chip matched). One definition each, now shared.
  powerConsumption: { color: '#e59344', border: '#e59344' },
  powerGeneration: { color: '#9e9e9e', border: '#9e9e9e' },
  circuitBoost: { color: '#9f6d9f', border: '#9f6d9f' },
  peakConsumption: { color: '#5cb0c5', border: '#5cb0c5' },

  // Muted info blue: the fill of "please note" info notices and of interactive
  // affordances that should match them (e.g. the sidebar summary's expand button).
  // Deliberately OPAQUE — Vuetify's tonal variant renders `info` at 12% alpha,
  // which composites to a different shade per backdrop (same trap as `problem`
  // below); this is that tonal blue as rendered over the dark card surface.
  mutedBlue: { color: '#212f3a', border: '#212f3a' },

  // Status
  success: { color: palette.green, border: palette.green },
  error: { color: palette.red, border: palette.red },
  // A factory/card in a problem state. Historically this red drifted into four
  // different literals (#a00, #b50000, rgba(140,9,21,.4), rgba(128,0,0,.5)); the
  // background is deliberately OPAQUE — the old 0.4-alpha value composited to a
  // different shade depending on what surface sat behind it (sidebar vs card header).
  problem: { color: palette.red, border: '#a00000', background: '#4b171c' },
} as const satisfies Record<string, SfColor>

export type SfColorName = keyof typeof sfColors

const toKebab = (name: string) => name.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)

/**
 * Publish every token as a `--sf-*` CSS custom property on the given root (default
 * `<html>`), so SCSS and inline styles resolve from this file. Called once at boot.
 */
export const applySfColorVars = (root: HTMLElement = document.documentElement): void => {
  for (const [name, value] of Object.entries(palette)) {
    root.style.setProperty(`--sf-${toKebab(name)}`, value)
  }
  for (const [name, { color, border, background }] of Object.entries(sfColors) as [string, SfColor][]) {
    const base = toKebab(name)
    root.style.setProperty(`--sf-${base}`, color)
    root.style.setProperty(`--sf-${base}-border`, border)
    if (background) {
      root.style.setProperty(`--sf-${base}-bg`, background)
    }
  }
}
