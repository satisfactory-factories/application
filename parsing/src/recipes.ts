import {
    ParserBuilding,
    ParserRecipe,
} from "./interfaces/ParserRecipe";
import {
    ParserFuel,
    ParserPowerItem,
    ParserPowerRecipe
} from "./interfaces/ParserPowerRecipe";
import {
    blacklist,
    isFluid,
    isFicsmas,
    getRecipeName,
    getPartName,
    getPowerProducerBuildingName
} from "./common";
import {ParserItemDataInterface} from "./interfaces/ParserPart";

// If you can read this, you are a wizard. ChatGPT made this, it works, so I won't question it!
function getProductionRecipes(
    data: any[],
    producingBuildings: { [key: string]: number }
): ParserRecipe[] {
    const recipes: ParserRecipe[] = [];

    data
        .filter((entry: any) => entry.Classes)
        .flatMap((entry: any) => entry.Classes)
        .filter((recipe: any) => {

            // Filter out recipes that don't have a producing building
            if (!recipe.mProducedIn) return false;
            // Filter out recipes that are in the blacklist (typically items produced by the Build Gun)
            if (blacklist.every(building => recipe.mProducedIn.includes(building))) return false;

            // Extract all producing buildings
            const rawBuildingKeys = recipe.mProducedIn.match(/\/([^/]+)\./g);
            if (!rawBuildingKeys) {
                return false;
            }
            // Process all buildings and check if any match the producingBuildings map
            const validBuilding = rawBuildingKeys.some((rawBuilding: string) => {
                const buildingKey: string = rawBuilding.replace(/\//g, '').replace(/\./g, '').toLowerCase().replace('build_', '');
                return producingBuildings[buildingKey];
            })

            return validBuilding;
        })
        .forEach((recipe: any) => {

            const ingredients = recipe.mIngredients
                ? recipe.mIngredients
                    .match(/ItemClass=".*?\/Desc_(.*?)\.Desc_.*?",Amount=(\d+)/g)
                    ?.map((ingredientStr: string) => {
                        const match = RegExp(/Desc_(.*?)\.Desc_.*?,Amount=(\d+)/).exec(ingredientStr);
                        if (match) {
                            const partName: string = match[1];
                            let amount = parseInt(match[2], 10);
                            if (isFluid(partName)) {
                                amount = amount / 1000;
                            }
                            const perMin: number = recipe.mManufactoringDuration && amount > 0 ? (60 / parseFloat(recipe.mManufactoringDuration)) * amount : 0;

                            return {
                                part: partName,
                                amount,
                                perMin
                            };
                        }
                        return null;
                    })
                    .filter((ingredient: any) => ingredient !== null)
                : [];

            // Parse mProduct to extract all products
            let productMatches = [...recipe.mProduct.matchAll(/ItemClass=".*?\/Desc_(.*?)\.Desc_.*?",Amount=(\d+)/g)];
            // exception for automated miner recipes - as the product is a BP_ItemDescriptor
            if (recipe.ClassName === "Recipe_Alternate_AutomatedMiner_C") {
                productMatches = [...recipe.mProduct.matchAll(/ItemClass=".*?\/BP_ItemDescriptor(.*?)\.BP_ItemDescriptor.*?",Amount=(\d+)/g)];
            }

            const products: { part: string, amount: number, perMin: number, isByProduct?: boolean }[] = [];
            productMatches.forEach(match => {
                const productName: string = match[1];
                let amount = parseInt(match[2], 10);
                if (isFluid(productName)) {
                    amount = amount / 1000;  // Divide by 1000 for liquid/gas amounts
                }
                const perMin = recipe.mManufactoringDuration && amount > 0 ? (60 / parseFloat(recipe.mManufactoringDuration)) * amount : 0;

                products.push({
                    part: productName,
                    amount,
                    perMin,
                    isByProduct: products.length > 0
                });
            });

            // Extract all producing buildings
            const producedInMatches = recipe.mProducedIn.match(/\/(\w+)\/(\w+)\.(\w+)_C/g) || [];

            // Filter and normalize building names, excluding invalid entries
            const validBuildings = producedInMatches
                .map((building: { match: (arg0: RegExp) => string[]; }) => building.match(/\/(\w+)\.(\w+)_C/)?.[2]?.replace(/build_/gi, '').toLowerCase())
                .filter((building: string) => building && !['bp_workbenchcomponent', 'bp_workshopcomponent', 'factorygame'].includes(building));

            // Calculate power per building and choose the most relevant one
            let powerPerBuilding: number = 0;
            let selectedBuilding: string | number = '';

            if (validBuildings.length > 0) {
                // Sum up power for all valid buildings
                powerPerBuilding = validBuildings.reduce((totalPower: number, building: string | number) => {
                    if (producingBuildings[building]) {
                        const buildingPower: number = producingBuildings[building]
                        selectedBuilding = selectedBuilding || building; // Set the first valid building as selected
                        return totalPower + buildingPower; // Add power for this building
                    }
                    return totalPower;
                }, 0);
            }

            // Calculate variable power for recipes that need it
            let lowPower: number | null = null;
            let highPower: number | null = null;
            if (selectedBuilding === 'hadroncollider' || 
                selectedBuilding === 'converter' || 
                selectedBuilding === 'quantumencoder') {
                // get the power from the recipe instead of the building
                lowPower = Number(recipe.mVariablePowerConsumptionConstant);
                highPower = Number(recipe.mVariablePowerConsumptionFactor);
                // calculate the average power: Note that because low power can be 0, (and often is), we can't use truthy checks to validate these values
                if (lowPower !== null && highPower !== null) {
                    powerPerBuilding = (lowPower + highPower) / 2;
                }
            }

            // Create building object with the selected building and calculated power
            const building : ParserBuilding = {
                name: selectedBuilding || '', // Use the first valid building, or empty string if none
                power: powerPerBuilding || 0, // Use calculated power or 0
            };
            // keeping this in a separate conditional prevents a ton of properties with null values from being added to the building object
            if (lowPower !== null && highPower !== null) {
                building.minPower = lowPower;
                building.maxPower = highPower;
            }

            recipes.push({
                id: recipe.ClassName.replace("Recipe_", "").replace(/_C$/, ""),
                displayName: recipe.mDisplayName,
                ingredients,
                products,
                building,
                isAlternate: recipe.mDisplayName.includes("Alternate"),
                isFicsmas: isFicsmas(recipe.mDisplayName),
            });
        });

    // // Manually add Nuclear waste recipes
    // recipes.push({
    //     id: "NuclearWaste",
    //     displayName: "Uranium Waste",
    //     ingredients: [{ part: 'NuclearFuelRod', amount: 1, perMin: 0.2 }, { part: 'Water', amount: 1200, perMin: 240 }],
    //     products: [{ part: "NuclearWaste", amount: 1, perMin: 10 }],
    //     building: { name: "nuclearpowerplant", power: 2500 },
    //     isAlternate: false,
    //     isFicsmas: false,
    // });
    // recipes.push({
    //     id: "PlutoniumWaste",
    //     displayName: "Plutonium Waste",
    //     ingredients: [{ part: 'PlutoniumFuelRod', amount: 1, perMin: 0.1 }, { part: 'Water', amount: 2400, perMin: 240 }],
    //     products: [{ part: "PlutoniumWaste", amount: 1, perMin: 1 }],
    //     building: { name: "nuclearpowerplant", power: 2500 },
    //     isAlternate: false,
    //     isFicsmas: false,
    // });

    return recipes.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function getPowerGeneratingRecipes(
    data: any[],
    parts: ParserItemDataInterface
): ParserPowerRecipe[] {

    const recipes: any[] = [];

    data
        .filter((entry: any) => entry.Classes)
        .flatMap((entry: any) => entry.Classes)
        .filter((recipe: any) => {
            // Filter out recipes that don't have a fuel component
            return recipe.mFuel;

        })
        .forEach((recipe: any) => {
            const building : ParserBuilding = {
                name: getPowerProducerBuildingName(recipe.ClassName) ?? 'UNKNOWN',
                power: Math.round(recipe.mPowerProduction), // generated power - can be rounded to the nearest whole number (all energy numbers are whole numbers) 
            };   
            const supplementalRatio = Number(recipe.mSupplementalToPowerRatio);
            // 1. Generator MW generated. This is an hourly value.
            // 2. Divide by 60, to get the minute value
            // 3. Now calculate the MJ, using the MJ->MW constant (1/3600), (https://en.wikipedia.org/wiki/Joule#Conversions) 
            // 4. Now divide this number by the part energy to calculate how many MJ we burn in 1 minute. e.g. For nuclear reactors this is 150,000MJ / minute.
            const burnRateMJ = (recipe.mPowerProduction / 60) / (1/3600);

            const fuels: ParserFuel[] = Array.isArray(recipe.mFuel) ? recipe.mFuel as ParserFuel[] : [];

            // The game data does not seem to contain the duration of the burning of the fuel. So we have to calculate it from the megajuoles of the fuel.
            // We know that the burn rate is 150,000MJ / minute, so we can figure out the durations from that.

            fuels.forEach((fuel: any) => {
                const primaryFuel = getPartName(fuel.mFuelClass);
                const primaryFuelPart = parts.parts[primaryFuel];

                const burnDurationInMins = primaryFuelPart.energyGeneratedInMJ / burnRateMJ;
                const burnDuration = burnDurationInMins * 60; // Convert to seconds

                const fuelItem: ParserFuel = {
                    primaryFuel,
                    supplementalResource: fuel.mSupplementalResourceClass ? getPartName(fuel.mSupplementalResourceClass) : "",
                    byProduct: fuel.mByproduct ? getPartName(fuel.mByproduct) : "",
                    byProductAmount: Number(fuel.mByproductAmount),
                    byProductPerMin: Number(fuel.mByproductAmount) / burnDurationInMins,
                    duration: burnDuration
                };

                //Find the part for the primary fuel
                let primaryPerMin = 0;
                if (primaryFuelPart.energyGeneratedInMJ > 0) {
                    // The rounding here is important to remove floating point errors that appear with some types 
                    // (this is step 4 from above)
                    primaryPerMin = parseFloat((burnRateMJ / primaryFuelPart.energyGeneratedInMJ).toFixed(5))
                }
                const ingredients: ParserPowerItem[] = [];
                ingredients.push({
                    part: fuelItem.primaryFuel,
                    perMin: primaryPerMin,
                    mwPerItem: building.power / primaryPerMin,
                })
                if (fuelItem.supplementalResource && supplementalRatio > 0) {
                    const perMin = (3 / 50) * supplementalRatio * building.power;
                    const supplementalFuelRatio = (3 / 50) * supplementalRatio;
                    ingredients.push({
                        part: fuelItem.supplementalResource,
                        perMin: perMin, // Calculate the ratio of the supplemental resource to the primary fuel
                        supplementalRatio: supplementalFuelRatio,
                    })
                }

                let byproduct: ParserPowerItem | null = null;
                if (fuelItem.byProduct) {
                    byproduct = {
                        part: fuelItem.byProduct,
                        perMin: fuelItem.byProductPerMin,
                    }
                }

                recipes.push({
                    id: getRecipeName(recipe.ClassName) +'_'+ fuelItem.primaryFuel,
                    displayName: recipe.mDisplayName + ' (' + primaryFuelPart.name + ')',
                    ingredients,
                    byproduct,
                    building
                });
            });
        });
    return recipes.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Export getRecipes for use
export {getProductionRecipes, getPowerGeneratingRecipes}