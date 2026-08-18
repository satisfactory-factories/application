export interface ParserIngredient {
  part: string;
  amount?: string;
  perMin: number;
}

export interface ParserProduct {
  part: string;
  amount: number;
  perMin: number;
  isByProduct?: boolean;
}

export type ParserPurity = 'impure' | 'normal' | 'pure';

// Extractors are placed on resource nodes rather than running recipes, so extraction recipes
// are synthesised and the planner picks the mark and node purity per building group.
// `extractors` is ordered cheapest first; its first entry is the recipe's reference rate.
// A resource well is a powered pressurizer driving unpowered satellite extractors, each
// standing on its own micro-node with its own purity. The pressurizer's clock scales every
// satellite at once, so the well as a whole behaves like one overclockable building whose
// output is the sum of its satellites.
export interface ParserWell {
  satelliteBuilding: string;
  satelliteRates: { [purity in ParserPurity]: number };
}

export interface ParserExtraction {
  // Empty for wells: purity sits on each satellite, not on the group.
  purities: ParserPurity[];
  extractors: { building: string; ratePerMin: number }[];
  well?: ParserWell;
}

export interface ParserRecipe {
  id: string;
  displayName: string;
  ingredients: ParserIngredient[];
  products: ParserProduct[];
  building: ParserBuilding;
  extraction?: ParserExtraction;
  isAlternate: boolean;
  isFicsmas: boolean;
}

export interface ParserBuilding {
  name: string;
  power: number;
  minPower?: number;
  maxPower?: number;
}
