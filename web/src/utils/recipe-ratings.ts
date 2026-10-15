import { palette } from '@/utils/colors'

export type RecipeTier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

export const TIER_ORDER: RecipeTier[] = ['S', 'A', 'B', 'C', 'D', 'F']

export const RECIPE_RATINGS_SOURCE = {
  title: 'Alternate Recipe Ranking 1.0 by u/wrigh516',
  url: 'https://www.reddit.com/r/SatisfactoryGame/comments/1fekus9/alternate_recipe_ranking_10_optimizing_for/',
}

export const RECIPE_TIERS: Record<RecipeTier, { label: string, color: string }> = {
  S: { label: 'Most recommended', color: palette.purple },
  A: { label: 'Very highly recommended', color: palette.green },
  B: { label: 'Highly recommended', color: palette.teal },
  C: { label: 'Recommended', color: palette.indigo },
  D: { label: 'Sometimes recommended', color: palette.greyBorder },
  F: { label: 'Not recommended', color: palette.red },
}

// Keyed by recipe ID, matched from the post's names. Alternates the post leaves out
// (charcoal, canisters, packaged fuel and so on) get no rating.
const tierRecipes: Record<RecipeTier, string[]> = {
  S: [
    'Alternate_CopperAlloyIngot',
    'Alternate_CrystalOscillator',
    'Alternate_DarkMatter_Trap',
    'Alternate_Diamond_OilBased',
    'Alternate_Diamond_Turbo',
    'Alternate_HeavyFlexibleFrame',
    'Alternate_ModularFrameHeavy',
    'Alternate_NuclearFuelRod_1',
    'Alternate_SloppyAlumina',
    'PureAluminumIngot',
  ],
  A: [
    'Alternate_AILimiter_Plastic',
    'Alternate_AluminumRod',
    'Alternate_CircuitBoard_1',
    'Alternate_CircuitBoard_2',
    'Alternate_Computer_1',
    'Alternate_Computer_2',
    'Alternate_Concrete',
    'Alternate_DilutedFuel',
    'Alternate_ElectroAluminumScrap',
    'Alternate_HeatFusedFrame',
    'Alternate_ModularFrame',
    'Alternate_Motor_1',
    'Alternate_RubberConcrete',
    'Alternate_Screw_2',
    'Alternate_SteelBeam_Aluminum',
    'Alternate_SteelRod',
    'Alternate_SuperStateComputer',
    'Alternate_TurboMotor_1',
    'Alternate_TurboPressureMotor',
    'Alternate_UraniumCell_1',
  ],
  B: [
    'Alternate_AdheredIronPlate',
    'Alternate_Cable_1',
    'Alternate_Cable_2',
    'Alternate_CateriumIngot_Tempered',
    'Alternate_CoatedCable',
    'Alternate_CoatedIronPlate',
    'Alternate_CokeSteelIngot',
    'Alternate_CoolingDevice',
    'Alternate_CopperRotor',
    'Alternate_ElectricMotor',
    'Alternate_ElectromagneticControlRod_1',
    'Alternate_FlexibleFramework',
    'Alternate_FusedWire',
    'Alternate_Gunpowder_1',
    'Alternate_HeatSink_1',
    'Alternate_HeavyOilResidue',
    'Alternate_HighSpeedConnector',
    'Alternate_HighSpeedWiring',
    'Alternate_IngotIron',
    'Alternate_IngotSteel_1',
    'Alternate_OCSupercomputer',
    'Alternate_PlasticSmartPlating',
    'Alternate_Plastic_1',
    'Alternate_PolyesterFabric',
    'Alternate_PolymerResin',
    'Alternate_PureQuartzCrystal',
    'Alternate_RadioControlSystem',
    'Alternate_ReinforcedIronPlate_1',
    'Alternate_ReinforcedIronPlate_2',
    'Alternate_RocketFuel_Nitro',
    'Alternate_Rotor',
    'Alternate_Screw',
    'Alternate_Stator',
    'Alternate_SteamedCopperSheet',
    'Alternate_SteelCastedPlate',
    'Alternate_TurboHeavyFuel',
    'Alternate_WetConcrete',
    'Alternate_Wire_2',
  ],
  C: [
    'Alternate_AlcladCasing',
    'Alternate_BoltedFrame',
    'Alternate_CateriumIngot_Leached',
    'Alternate_ClassicBattery',
    'Alternate_Diamond_Pink',
    'Alternate_ElectrodeCircuitBoard',
    'Alternate_EncasedIndustrialBeam',
    'Alternate_IronIngot_Basic',
    'Alternate_IronIngot_Leached',
    'Alternate_PureCateriumIngot',
    'Alternate_PureIronIngot',
    'Alternate_Quartz_Fused',
    'Alternate_Quickwire',
    'Alternate_RecycledRubber',
    'Alternate_Silica',
    'Alternate_Silica_Distilled',
    'Alternate_SteelBeam_Molded',
    'Alternate_SteelPipe_Molded',
    'Alternate_TurboBlendFuel',
    'Alternate_Wire_1',
  ],
  D: [
    'Alternate_IngotSteel_2',
    'Alternate_InstantPlutoniumCell',
    'Alternate_InstantScrap',
    'Alternate_PlutoniumFuelUnit',
    'Alternate_PureCopperIngot',
    'Alternate_Quartz_Purified',
    'Alternate_SteelPipe_Iron',
  ],
  F: [
    'Alternate_CopperIngot_Leached',
    'Alternate_CopperIngot_Tempered',
    'Alternate_DarkMatter_Crystallization',
    'Alternate_Diamond_Cloudy',
    'Alternate_Diamond_Petroleum',
    'Alternate_FertileUranium',
    'Alternate_IonizedFuel_Dark',
    'Alternate_RadioControlUnit_1',
  ],
}

const ratingByRecipe = new Map<string, RecipeTier>(
  (Object.entries(tierRecipes) as [RecipeTier, string[]][])
    .flatMap(([tier, ids]) => ids.map(id => [id, tier] as const))
)

export const getRecipeRating = (recipeId: string): RecipeTier | undefined => ratingByRecipe.get(recipeId)

const tierQuery = /\b(?:([sabcdf])[\s-]*tier|tier[\s-]*([sabcdf]))\b/i

/**
 * Picker search: "s tier", "tier b" or "f-tier" keeps only that tier, and any other words
 * still have to appear in the recipe's name.
 */
export const matchesRecipeQuery = (name: string, tier: RecipeTier | undefined, query: string): boolean => {
  const match = tierQuery.exec(query)
  const wantedTier = match ? (match[1] ?? match[2]).toUpperCase() : undefined
  if (wantedTier && wantedTier !== tier) {
    return false
  }

  const rest = (match ? query.replace(match[0], '') : query).trim().toLowerCase()
  return name.toLowerCase().includes(rest)
}
