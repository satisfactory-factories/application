// noinspection DuplicatedCode
// Duplicated by backend
export interface RecipeItem {
  part: string;
  amount: number;
  perMin: number;
  isByProduct?: boolean;
}

export type NodePurity = 'impure' | 'normal' | 'pure'

// Extraction recipes have no ingredients: an extractor placed on a resource node produces it
// outright. The mark and node purity are chosen per building group, so the recipe only declares
// what is available. `extractors` is ordered cheapest first and its first entry's rate is the
// recipe's reference rate — every group's real output is expressed as a multiple of it.
// A resource well is a powered pressurizer driving unpowered satellite extractors, each on its
// own micro-node with its own purity. The pressurizer's clock scales every satellite at once,
// so a well behaves as one overclockable building whose output is the sum of its satellites.
export interface RecipeWell {
  satelliteBuilding: string;
  satelliteRates: { [purity in NodePurity]: number };
}

export interface RecipeExtraction {
  // Empty for wells: purity sits on each satellite, not on the group.
  purities: NodePurity[];
  extractors: { building: string; ratePerMin: number }[];
  well?: RecipeWell;
}

export interface Recipe {
  id: string;
  displayName: string;
  ingredients: RecipeItem[];
  products: RecipeItem[];
  byproduct?: RecipeItem[];
  building: {
    name: string;
    power: number;
    // Variable-power buildings (Particle Accelerator, Converter, Quantum Encoder) oscillate
    // between minPower and maxPower over the recipe cycle; `power` is the average draw.
    minPower?: number;
    maxPower?: number;
  }
  extraction?: RecipeExtraction;
  isAlternate: boolean;
  isFicsmas: boolean;
}

// ===== POWER RECIPES =====
export interface PowerItem {
  part: string;
  perMin: number;
  amount?: number;
  mwPerItem?: number;
  supplementalRatio?: number;
}

export interface PowerRecipe {
  id: string;
  displayName: string;
  ingredients: PowerItem[];
  byproduct: PowerItem | null;
  building: {
    name: string;
    power: number;
    // Variable output generators (Geothermal) oscillate between minPower and maxPower;
    // `power` is the average.
    minPower?: number;
    maxPower?: number;
  }
  // Alien Power Augmenter: grid-wide circuit boost metadata. `base` applies unfueled,
  // `fueled` applies while fed `fuelPart` at `fuelRatePerMin` per building. Fractions (0.1 = 10%).
  boost?: {
    base: number;
    fueled: number;
    fuelPart: string;
    fuelRatePerMin: number;
  }
}
