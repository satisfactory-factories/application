import { PowerRecipe, Recipe } from './Recipes'

export interface Part {
  name: string;
  stackSize: number;
  isFluid: boolean;
  isFicsmas: boolean;
}

export interface RawResource {
  name: string;
  limit: number;
}

export interface CustomBuildingIngredient {
  part: string;
  perMin: number;
}

export interface BuildingCostIngredient {
  part: string;
  amount: number;
}

/**
 * A building the player places that runs no production recipe: portals, train stations, radar
 * towers, lights. They cost power — and a couple of them cost parts to keep running — without
 * producing anything, so the planner offers them as "custom buildings" rather than as products.
 *
 * `power` is the draw of ONE building, and `ingredients` its upkeep per building per minute.
 */
export interface CustomBuilding {
  name: string;
  displayName: string;
  power: number;
  ingredients: CustomBuildingIngredient[];
}

export interface DataInterface {
  buildings: { [key: string]: number };
  items: {
    parts: { [key: string]: Part };
    rawResources: { [key: string]: RawResource };
  }
  recipes: Recipe[];
  powerGenerationRecipes: PowerRecipe[];
  customBuildings: CustomBuilding[];
  // The one-time material cost to construct ONE of a building — production buildings, power
  // generators, extractors and custom buildings alike, keyed the same way as `buildings` /
  // `customBuildings[].name`. Absent for anything the Build Gun does not sell as a standalone
  // building (walls, foundations, belts...).
  buildingCosts: { [key: string]: BuildingCostIngredient[] };
}
