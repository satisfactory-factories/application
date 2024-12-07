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

export interface ParserRecipe {
  id: string;
  displayName: string;
  ingredients: ParserIngredient[];
  products: ParserProduct[];
  building: ParserBuilding;
  isAlternate: boolean;
  isFicsmas: boolean;
}

export interface ParserBuilding {
  name: string;
  power: number;
  minPower?: number;
  maxPower?: number;
}
