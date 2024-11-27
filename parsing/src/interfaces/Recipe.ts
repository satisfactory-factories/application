export interface RecipeItem {
  part: string;
  amount: number;
  perMin: number;
  isByProduct?: boolean;
}

export interface Recipe {
  id: string;
  displayName: string;
  ingredients: RecipeItem[];
  products: RecipeItem[];
  building: Building;
  isAlternate: boolean;
  isFicsmas: boolean;
  isPowerGenerator: boolean;
}

export interface Building {
  name: string;
  power: number;
  minPower?: number;
  maxPower?: number;
}
