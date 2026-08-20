// Extracts the one-time material cost to construct a building: what is spent placing it, as
// opposed to the power it draws (buildings.ts) or the parts a few of them consume to keep
// running (custom-buildings.ts). The game encodes this as an ordinary Build Gun recipe —
// Recipe_X_C, produced in BP_BuildGun, whose single "product" is the building itself and whose
// ingredients are the cost — so the same recipes cover production buildings, power generators,
// extractors and custom buildings alike. Anything else the Build Gun makes (walls, foundations,
// conveyor poles, stairs...) is filtered out by `knownBuildings`, since none of those are tracked
// as buildings anywhere else in the game data.
import { ParserBuildingCostIngredient } from './interfaces/ParserBuildingCost';
import { fuellessGenerators } from './buildings';

const BUILD_GUN = '/Game/FactoryGame/Equipment/BuildGun/BP_BuildGun.BP_BuildGun_C';

// The Geothermal Generator and Alien Power Augmenter are the two buildings whose buildable
// ClassName does not already match the normalized key used elsewhere in the game data —
// buildings.ts remaps them via `fuellessGenerators` (Build_GeneratorGeoThermal_C ->
// 'geothermalgenerator'). Their build-gun recipe's product descriptor carries the same raw
// name, so it needs the same remap or it lands as 'generatorgeothermal' and matches nothing.
const BUILDING_KEY_ALIASES: { [key: string]: string } = {};
fuellessGenerators.forEach((normalizedName, className) => {
    const descriptorSuffix = className.replace(/^Build_/, '').replace(/_C$/, '').toLowerCase();
    BUILDING_KEY_ALIASES[descriptorSuffix] = normalizedName;
});

// Matches the normalization buildings.ts and custom-buildings.ts apply to a buildable's
// ClassName (Build_X_C), so a build-gun recipe's product (Desc_X_C) lands on the same key.
function normalizeBuildingKey(descriptorSuffix: string): string {
    const key = descriptorSuffix.toLowerCase().replace('_automated', '');
    return BUILDING_KEY_ALIASES[key] ?? key;
}

function getBuildingCosts(
    data: any[],
    knownBuildings: Set<string>
): { [key: string]: ParserBuildingCostIngredient[] } {
    const costs: { [key: string]: ParserBuildingCostIngredient[] } = {};

    data
        .filter((entry: any) => entry.Classes)
        .flatMap((entry: any) => entry.Classes)
        .filter((recipe: any) =>
            typeof recipe.ClassName === 'string' &&
            recipe.ClassName.startsWith('Recipe_') &&
            typeof recipe.mProducedIn === 'string' &&
            recipe.mProducedIn.includes(BUILD_GUN)
        )
        .forEach((recipe: any) => {
            const productMatch = /ItemClass=".*?\/Desc_(.*?)\.Desc_.*?",Amount=(\d+)/.exec(recipe.mProduct ?? '');
            if (!productMatch) {
                return;
            }

            const buildingKey = normalizeBuildingKey(productMatch[1]);
            // Only buildings tracked elsewhere in the game data (production buildings, power
            // generators, extractors, custom buildings) matter here; everything else the Build
            // Gun places (walls, belts, stairs...) is out of scope. First recipe wins on a
            // collision, though none is currently known.
            if (!knownBuildings.has(buildingKey) || costs[buildingKey]) {
                return;
            }

            const ingredients: ParserBuildingCostIngredient[] = [];
            const ingredientMatches: string[] = (recipe.mIngredients ?? '')
                .match(/ItemClass=".*?\/Desc_(.*?)\.Desc_.*?",Amount=(\d+)/g) ?? [];

            ingredientMatches.forEach((ingredientStr: string) => {
                const match = /Desc_(.*?)\.Desc_.*?,Amount=(\d+)/.exec(ingredientStr);
                if (match) {
                    ingredients.push({ part: match[1], amount: parseInt(match[2], 10) });
                }
            });

            costs[buildingKey] = ingredients;
        });

    return costs;
}

export { getBuildingCosts };
