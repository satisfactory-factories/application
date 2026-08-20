export interface ParserCustomBuildingIngredient {
  part: string;
  perMin: number;
}

// A building the player places that isn't running a production recipe: portals, train
// stations, radar towers, lights. They cost power (and occasionally parts) without making
// anything, so the planner offers them as "custom buildings" rather than as products.
export interface ParserCustomBuilding {
  name: string;
  displayName: string;
  power: number;
  // Upkeep the building consumes while running, e.g. the Main Portal's Singularity Cells.
  // Empty for the majority, which only draw power.
  ingredients: ParserCustomBuildingIngredient[];
}
