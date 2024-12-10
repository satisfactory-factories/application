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

export interface DataInterface {
  buildings: { [key: string]: string };
  items: {
    parts: { [key: string]: Part };
    collectables: { [key: string]: string };
    rawResources: { [key: string]: RawResource };
  }
  recipes: Recipe[];
  powerGenerationRecipes: PowerRecipe[];
}
