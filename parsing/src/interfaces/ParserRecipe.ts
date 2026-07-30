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
export interface ParserExtraction {
  purities: ParserPurity[];
  extractors: { building: string; ratePerMin: number }[];
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
