// noinspection DuplicatedCode
// Duplicated by backend
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
  byproduct?: RecipeItem[];
  building: {
    name: string;
    power: number;
    // Variable-power buildings (Particle Accelerator, Converter, Quantum Encoder) oscillate
    // between minPower and maxPower over the recipe cycle; `power` is the average draw.
    minPower?: number;
    maxPower?: number;
  }
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
  }
}
