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
  // The muted mauve the Alien Power Augmenter's circuit boost wears.
  mutedPurple: '#9f6d9f',
  mutedPurpleBorder: '#7a4a7a',
  // Sampled from the Mercer Sphere artwork itself (the mean of its brightest saturated pixels),
  // so the Dimensional Depot wears the colour of the thing it is built from. Deliberately NOT
  // mutedPurple, which it used to share with the circuit boost and was too close to read apart;
  // and magenta-leaning rather than the Somersloop's blue-leaning violet, so a plan showing both
  // alien trinkets tells them apart by hue rather than by icon alone.
  mercerPurple: '#dc73e2',
  mercerPurpleBorder: '#9e52a2',
  lightBlue: '#4fc3f7',
  lightBlueBorder: '#0288d1',
  grey: '#bdbdbd',
  greyBorder: '#7f7f7f',
  teal: '#26a69a',
  pink: '#ec407a',
  indigo: '#5c6bc0',
  lime: '#c0ca33',
  offWhite: '#eceff1',
  offWhiteBorder: '#8d9499',
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
  // The Dimensional Depot and the Mercer Spheres its uploaders are built from. This is the ACCENT:
  // chips, icons and the number inputs in the Storage column.
  dimensionalDepot: { color: palette.mercerPurple, border: palette.mercerPurpleBorder },
  // The SURFACE the Depot's section header and its sidebar jump-link wear. Deliberately the muted
  // mauve rather than the accent above: a header-width band of the bright Mercer purple competes
  // with the chips sitting on it and reads as an alert rather than a section. Two roles, two
  // tokens — a panel and the things on it do not want the same strength of the same colour.
  //
  // Opaque rather than the alpha fill this started as, for the reason `problem` gives below: it is
  // used on two different surfaces (a card and the sidebar), and an alpha value composites to a
  // different shade on each. This is that original 22% mauve as rendered over the card.
  dimensionalDepotPanel: { color: palette.mutedPurple, border: palette.mutedPurpleBorder, background: '#443a44' },
  // The AWESOME Sink. Gold, as it is in game, and distinct from `warning`'s yellow: a sunk
  // surplus is a resolved state, not a caution.
  awesomeSink: { color: '#d9a441', border: '#a6761a' },
  // A setting on a building group rather than something that flows through it: the node
  // purity a miner stands on, and a resource well's satellite counts. Deliberately neutral —
  // these were reading as `rawResource` beige, which is the colour of the ore itself.
  nodeSetting: { color: palette.offWhite, border: palette.offWhiteBorder },

  // Power (these were the most inconsistent — the power table used bespoke hexes
  // that no chip matched). One definition each, now shared.
  powerConsumption: { color: '#e59344', border: '#e59344' },
  powerGeneration: { color: '#9e9e9e', border: '#9e9e9e' },
  circuitBoost: { color: palette.mutedPurple, border: palette.mutedPurple },
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
  // Amber rather than red: something the user should read before acting, but not a failure.
  warning: { color: palette.yellow, border: palette.yellowBorder },
  // A factory/card in a problem state. Historically this red drifted into four
  // different literals (#a00, #b50000, rgba(140,9,21,.4), rgba(128,0,0,.5)); the
  // background is deliberately OPAQUE — the old 0.4-alpha value composited to a
  // different shade depending on what surface sat behind it (sidebar vs card header).
  problem: { color: palette.red, border: '#a00000', background: '#4b171c' },
  // The middle tier of a factory's status: coherent, but probably not what you meant, or your
  // world is behind your plan. Deliberately the burnt orange the out-of-sync state already wore,
  // carried over verbatim — naming it stops `building` (an item colour) doubling as a status
  // colour. Not called `warning`: that name is taken by caution *text*, which is a yellow.
  //
  // The background is OPAQUE for the same reason `problem` above is. At 16% alpha it composited
  // against whatever sat behind it — a card header's own translucent grey, the summary table's
  // surface — and the result was a washed-out beige that read as a grey panel rather than amber.
  statusWarning: { color: palette.orange, border: palette.orangeBorder, background: '#4f2b0b' },
  // The lowest tier: shown on a factory but never colouring it, so it is yellow rather than the
  // amber above and its chip is outlined rather than filled. The background exists for the one
  // place a note chip has to look PRESSED - the Factories Summary status filter, where a flat
  // chip means "this filter is on" and Vuetify fills a colourless chip with grey. Opaque for the
  // same reason as the two above.
  statusNote: { color: palette.yellow, border: palette.yellowBorder, background: '#4b3a0e' },
} as const satisfies Record<string, SfColor>

export type SfColorName = keyof typeof sfColors

/**
 * Colours a factory group may be given.
 *
 * Red, orange and yellow are deliberately absent: `problem` and `statusWarning` own them, and a
 * group wearing a status colour would read as a broken factory at a glance. Everything else in
 * the palette is fair game, and the user can pick anything at all through the custom picker —
 * this list is the offered grid, not a restriction.
 */
export const groupPalette: { name: string, value: string }[] = [
  { name: 'Green', value: palette.green },
  { name: 'Teal', value: palette.teal },
  { name: 'Cyan', value: palette.cyan },
  { name: 'Light blue', value: palette.lightBlue },
  { name: 'Blue', value: palette.blue },
  { name: 'Indigo', value: palette.indigo },
  { name: 'Purple', value: palette.purple },
  { name: 'Pink', value: palette.pink },
  { name: 'Lime', value: palette.lime },
  { name: 'Beige', value: palette.beige },
  { name: 'Grey', value: palette.grey },
]

// The card surface a group's muted header is blended into. Matches --sf-factory-bg's opaque
// equivalent — see sfColors.factory, whose background is the same grey at 40%.
const cardSurface = '#2b2b2b'

const parseHex = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number]
}

/**
 * Blend `hex` into `base` by `amount` (0 = all base, 1 = all hex), returning an opaque colour.
 *
 * Opaque on purpose. The `problem` background above had to stop being an alpha value because it
 * composited to a different shade over the sidebar than over a card; a group's muted header has
 * exactly the same problem, and is used on both surfaces.
 */
export const mixHex = (hex: string, amount: number, base: string = cardSurface): string => {
  const [r1, g1, b1] = parseHex(hex)
  const [r2, g2, b2] = parseHex(base)
  const mix = (a: number, b: number) => Math.round(b + (a - b) * amount)
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)]
    .map(channel => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

// The two values every group-coloured surface binds. `muted` fills a card or sidebar header;
// the raw colour draws the spine and the swatch.
export const groupColorVars = (color: string): Record<string, string> => ({
  '--sf-group': color,
  // Kept faint deliberately. The border and the tree already say which group a thing is in, so the
  // fill only has to hint at it — at any real strength a sidebar of six groups reads as six
  // differently-coloured panels rather than one list.
  '--sf-group-muted': mixHex(color, 0.12),
})

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
