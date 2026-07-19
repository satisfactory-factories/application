import { DataInterface } from '@/interfaces/DataInterface'
import { Recipe } from '@/interfaces/Recipes'

// A factory in the current plan producing a part, and how much of it per minute.
export interface PartProducer {
  id: number;
  name: string;
  amount: number;
}

export interface PartEntry {
  id: string;
  name: string;
  isFicsmas: boolean;
  standardRecipes: Recipe[]; // Non-alternate recipes producing this part
  alternateRecipes: Recipe[]; // Alternate recipes producing this part
  usedIn: Recipe[]; // Recipes consuming this part as an ingredient
}

// Builds the item-centric view of the recipe list: every part that is produced or
// consumed by at least one recipe, with its producers (split standard/alternate) and consumers.
export const buildPartEntries = (gameData: DataInterface): PartEntry[] => {
  const entries = new Map<string, PartEntry>()

  const getEntry = (partId: string): PartEntry => {
    let entry = entries.get(partId)
    if (!entry) {
      const partData = gameData.items.parts[partId] ?? gameData.items.rawResources[partId]
      entry = {
        id: partId,
        name: partData?.name ?? `UNKNOWN PART ${partId}!`,
        isFicsmas: (partData && 'isFicsmas' in partData) ? partData.isFicsmas : false,
        standardRecipes: [],
        alternateRecipes: [],
        usedIn: [],
      }
      entries.set(partId, entry)
    }
    return entry
  }

  gameData.recipes.forEach(recipe => {
    recipe.products.forEach(product => {
      const entry = getEntry(product.part)
      if (recipe.isAlternate) {
        entry.alternateRecipes.push(recipe)
      } else {
        entry.standardRecipes.push(recipe)
      }
    })

    recipe.ingredients.forEach(ingredient => {
      getEntry(ingredient.part).usedIn.push(recipe)
    })
  })

  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name))
}
