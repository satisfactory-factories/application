import { BuildingGroup } from '@/interfaces/planner/FactoryInterface'

// Somersloop amplification slots per building (production amplification).
// Not present in the game data export, so maintained here.
// https://satisfactory.wiki.gg/wiki/Production_amplifier
export const SOMERSLOOP_SLOTS: { [building: string]: number } = {
  smeltermk1: 1,
  constructormk1: 1,
  assemblermk1: 2,
  foundrymk1: 2,
  oilrefinery: 2,
  converter: 2,
  manufacturermk1: 4,
  blender: 4,
  hadroncollider: 4,
  quantumencoder: 4,
  // These buildings cannot be amplified.
  packager: 0,
  generatorbiomass: 0,
  generatorcoal: 0,
  generatorfuel: 0,
  generatornuclear: 0,
}

export const getSomersloopSlots = (building: string): number => {
  return SOMERSLOOP_SLOTS[building] ?? 0
}

// Somersloops are stored per building in the group: every building in a group is
// identical (same clock, same somersloops). Clamped to the building's slot count.
export const sanitizeGroupSomersloops = (group: BuildingGroup, building: string): number => {
  // An unknown/empty building name (e.g. before the first calculation has resolved it)
  // gives no boost, but must not wipe the user's entered somersloops.
  if (!(building in SOMERSLOOP_SLOTS)) {
    return 0
  }

  const slots = getSomersloopSlots(building)
  const raw = group.somersloops ?? 0
  const requested = Number.isFinite(raw) ? Math.round(raw) : 0
  const clamped = Math.min(Math.max(requested, 0), slots)

  if (group.somersloops !== clamped) {
    group.somersloops = clamped
  }

  return clamped
}

// Output multiplier: 1 + filledSlots / totalSlots. Fully slooped = 2x output.
// Applies to outputs (product + byproducts) only — ingredient consumption is unchanged.
export const getSomersloopOutputMultiplier = (group: BuildingGroup, building: string): number => {
  const slots = getSomersloopSlots(building)
  const sloops = sanitizeGroupSomersloops(group, building)
  if (slots === 0) {
    return 1
  }

  return 1 + sloops / slots
}

// Power multiplier: (1 + filledSlots / totalSlots)^2. Fully slooped = 4x power.
// Stacks multiplicatively with the overclock power exponent.
export const getSomersloopPowerMultiplier = (group: BuildingGroup, building: string): number => {
  return Math.pow(getSomersloopOutputMultiplier(group, building), 2)
}

// Total somersloops physically consumed by an item's groups. `somersloops` is stored
// per building, so a group of N buildings uses N × somersloops of them.
export const getTotalSomersloops = (buildingGroups: BuildingGroup[] | undefined): number => {
  if (!buildingGroups?.length) {
    return 0
  }

  let total = 0
  for (const group of buildingGroups) {
    const perGroup = (group.somersloops ?? 0) * group.buildingCount
    if (Number.isFinite(perGroup)) {
      total += perGroup
    }
  }

  return total
}

// Somersloops boost outputs without increasing ingredient consumption, so an item's
// amount-derived ingredient demand over-states what the (partially) slooped machines
// actually eat. This returns physical-effective / output-effective buildings across the
// groups — the discount to apply to amount-derived ingredient demand. 1 when no sloops.
export const getSomersloopIngredientFactor = (
  buildingGroups: BuildingGroup[] | undefined,
  building: string
): number => {
  if (!buildingGroups?.length) {
    return 1
  }

  let physicalEffective = 0
  let outputEffective = 0

  for (const group of buildingGroups) {
    const effective = group.buildingCount * group.overclockPercent / 100

    // Freshly added groups can transiently hold NaN counts until the first full
    // calculation heals them — they must not poison the item's ingredient demand.
    if (!Number.isFinite(effective)) {
      continue
    }

    physicalEffective += effective
    outputEffective += effective * getSomersloopOutputMultiplier(group, building)
  }

  if (outputEffective === 0 || physicalEffective === outputEffective) {
    return 1
  }

  return physicalEffective / outputEffective
}
