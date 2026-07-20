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

export interface ParserFuel {
  primaryFuel: string;
  supplementalResource: string;
  byProduct: string;
  byProductAmount: number;
  byProductAmountPerMin: number;
  burnDurationInS: number
}