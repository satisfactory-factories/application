export interface ParserPowerItem {
  part: string;
  perMin: number;
  mwPerItem?: number;
  supplementalRatio?: number;
}

export interface ParserPowerRecipe {
  id: string;
  displayName: string;
  ingredients: ParserPowerItem[];
  byproduct: ParserPowerItem | null;
  building: {
    name: string;
    power: number;
  }
}

export interface ParserFuel {
  primaryFuel: string;
  supplementalResource: string;
  byProduct: string;
  byProductAmount: number;
  byProductPerMin: number;
  duration: number
}