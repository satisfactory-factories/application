import {Building, Recipe} from "./interfaces/Recipe";
import {blacklist,isFluid,isFicsmas} from "./common";
import { PartDataInterface, Part } from "./interfaces/Part";

// If you can read this, you are a wizard. ChatGPT made this, it works, so I won't question it!
function getProductionRecipes(
    data: any[],
    producingBuildings: { [key: string]: number }
): Recipe[] {
    const recipes: any[] = [];

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
                const buildingKey = rawBuilding.replace(/\//g, '').replace(/\./g, '').toLowerCase().replace('build_', '');
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
                            const partName = match[1];
                            let amount = parseInt(match[2], 10);

                            if (isFluid(partName)) {
                                amount = amount / 1000;
                            }

                            const perMin = recipe.mManufactoringDuration && amount > 0 ? (60 / parseFloat(recipe.mManufactoringDuration)) * amount : 0;

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
                const productName = match[1];
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
                        const buildingPower = producingBuildings[building]
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
            const building : Building = {
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
                isFicsmas: isFicsmas(recipe.mDisplayName)
            });
        });

    // Manually add Nuclear waste recipes
    recipes.push({
        id: "NuclearWaste",
        displayName: "Uranium Waste",
        ingredients: [{ part: 'NuclearFuelRod', amount: 1, perMin: 0.2 }, { part: 'Water', amount: 1200, perMin: 240 }],
        products: [{ part: "NuclearWaste", amount: 1, perMin: 10 }],
        building: { name: "nuclearpowerplant", power: 2500 },
        isAlternate: false,
        isFicsmas: false,
        isPowerGenerator: true
    });
    recipes.push({
        id: "PlutoniumWaste",
        displayName: "Plutonium Waste",
        ingredients: [{ part: 'PlutoniumFuelRod', amount: 1, perMin: 0.1 }, { part: 'Water', amount: 2400, perMin: 240 }],
        products: [{ part: "PlutoniumWaste", amount: 1, perMin: 1 }],
        building: { name: "nuclearpowerplant", power: 2500 },
        isAlternate: false,
        isFicsmas: false,
        isPowerGenerator: true
    });

    return recipes.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function getPowerGeneratingRecipes(
    data: any[],
    parts: PartDataInterface
): Recipe[] {

    const recipes: any[] = [];

    data
        .filter((entry: any) => entry.Classes)
        .flatMap((entry: any) => entry.Classes)
        .filter((recipe: any) => {
            
            // Filter out recipes that don't have a fuel component
            if (!recipe.mFuel)  { 
                return false; 
            } else {
                return true;
            }

        })
        .forEach((recipe: any) => {
            //console.log(recipe.ClassName); 
             
            let building : Building = {
                name: recipe.mDisplayName.replace(/ /g, ''), // Use the first valid building, or empty string if none
                power: Math.round(recipe.mPowerProduction), // generated power - can be rounded to the nearest whole number (all energy numbers are whole numbers) 
            };   
            const powerMJ = (recipe.mPowerProduction / 60) / (1/3600)

            // const ingredients = <any>[];
            const fuels = recipe.mFuel       
            fuels.forEach((fuel: any) => {
                const primaryFuel = fuel.mFuelClass;
                const supplementalResource = fuel.mSupplementalResourceClass;
                const byProduct = fuel.mByproduct;
                const byProductAmount: number = Number(fuel.mByproductAmount);

                //Find the part for the primary fuel
                //console.log(primaryFuel);
                const match = primaryFuel.match(/Desc_(.*?)_C/);
                const extractedPartText = match ? match[1] : null;
                if (extractedPartText !== "LiquidTurboFuel") {
                    //console.log('extractedPartText:'+extractedPartText);

                    const primaryFuelPart: Part = parts.parts[extractedPartText];
                    if (primaryFuelPart) {
                        //console.log('primaryFuelPart: ' + primaryFuelPart.name);
                    } else {
                        console.log('fail: ' + extractedPartText);
                        console.log(parts.parts);
                        console.log('fail: ' + extractedPartText);
                    }
                    //console.log(primaryFuelPart);
                    let primaryPerMin: number = 0; 
                    if (primaryFuelPart.energyGeneratedInMJ) {
                        //console.log('extractedPartText: ' + extractedPartText);
                        primaryPerMin = powerMJ / primaryFuelPart.energyGeneratedInMJ;
                    }
                    let primaryAmount : number = 0;
                    if (primaryPerMin > 0) {
                        primaryAmount = primaryPerMin / 60;

                        const ingredients = <any>[];
                        ingredients.push(
                            { 
                                part: primaryFuel,
                                amount: primaryAmount,
                                perMin: primaryPerMin
                            }
                        )
                        if (supplementalResource) {
                            ingredients.push(
                                { 
                                    part: supplementalResource,
                                    amount: 0,
                                    perMin: 0
                                }
                            )
                        }
                        //console.log(ingredients);
                        
                        const products = <any>[];
                        if (byProduct) {
                            products.push(
                                {
                                    part: byProduct,
                                    amount: 0,
                                    perMin: byProductAmount,
                                    isByProduct: true
                                }
                            );
                        }

                        recipes.push({
                            id: recipe.ClassName.replace("Build_", "").replace(/_C$/, "") +'_'+ primaryFuelPart.name,
                            displayName: recipe.mDisplayName + ' (' + primaryFuelPart.name + ')',
                            ingredients,
                            products,
                            building,
                            isAlternate: false,
                            isFicsmas: false,
                            isPowerGenerator: true
                        });  
                    }
                }
            });
        
        });

    return recipes.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Export getRecipes for use
export {getProductionRecipes,getPowerGeneratingRecipes}