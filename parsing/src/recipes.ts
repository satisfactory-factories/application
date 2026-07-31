import {
    ParserBuilding,
    ParserPurity,
    ParserRecipe,
} from "./interfaces/ParserRecipe";
import {extractors} from "./buildings";
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
    producingBuildings: { [key: string]: number },
    items: ParserItemDataInterface
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
                return typeof producingBuildings[buildingKey] === 'number';
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
                            // Multiply before dividing — (60 / duration) * amount leaves float noise
                            // behind on some recipes (3 Computers / 25s came out as 7.199999999999999).
                            const perMin: number = recipe.mManufactoringDuration && amount > 0 ? (60 * amount) / parseFloat(recipe.mManufactoringDuration) : 0;

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
                const perMin = recipe.mManufactoringDuration && amount > 0 ? (60 * amount) / parseFloat(recipe.mManufactoringDuration) : 0;

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
                    if (typeof producingBuildings[building] === 'number') {
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
                // get the power from the recipe instead of the building.
                // mVariablePowerConsumptionConstant is the minimum draw; mVariablePowerConsumptionFactor
                // is the range ON TOP of the constant, so max = constant + factor.
                lowPower = Number(recipe.mVariablePowerConsumptionConstant);
                highPower = lowPower + Number(recipe.mVariablePowerConsumptionFactor);
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

    recipes.push(...getExtractionRecipes(data, items));
    labelConverterRecipes(recipes, items);

    return recipes.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// The Converter's ore recipes are named "Iron Ore (Limestone)" in game, which now sits next to
// the extraction recipe "Iron Ore (Miner)" in the recipe selector and reads as though the ore
// simply comes from limestone. Naming the process makes the choice obvious:
// "Iron Ore (Convert: Limestone)".
function labelConverterRecipes(recipes: ParserRecipe[], items: ParserItemDataInterface): void {
    recipes
        .filter(recipe =>
            recipe.building.name === 'converter' &&
            !!items.rawResources[recipe.products[0]?.part]
        )
        .forEach(recipe => {
            recipe.displayName = recipe.displayName.replace(/\(([^)]+)\)\s*$/, '(Convert: $1)');
        });
}

// Solid resources with miner-placeable nodes. Miners declare an empty mAllowedResources, meaning
// "any solid node", and non-fluid does not imply mineable — Leaves, Wood, Mycelia, alien remains
// and power slugs are hand-collected — so the list has to be explicit.
const MINEABLE_SOLIDS = [
    'OreIron',
    'OreCopper',
    'OreGold',
    'Stone',
    'Coal',
    'RawQuartz',
    'Sulfur',
    'OreBauxite',
    'OreUranium',
    'SAM',
];

const MINER_CLASSES = ['Build_MinerMk1_C', 'Build_MinerMk2_C', 'Build_MinerMk3_C'];
const ALL_PURITIES: ParserPurity[] = ['impure', 'normal', 'pure'];

// Fluids and gases with resource wells. Same figures as the game's other node purities, and
// identical across all three resources.
const WELL_RESOURCES = ['Water', 'LiquidOil', 'NitrogenGas'];
const PURITY_MULTIPLIERS: { [purity in ParserPurity]: number } = {
    impure: 0.5,
    normal: 1,
    pure: 2,
};

// Rates are per minute at 100% clock on a normal node. Fluid extractors count in cm3, so a
// water pump's 2000 per second becomes 120 m3/min.
function getExtractorRate(extractor: any, fluid: boolean): number {
    const perMin = (Number(extractor.mItemsPerCycle) / Number(extractor.mExtractCycleTime)) * 60;
    return fluid ? perMin / 1000 : perMin;
}

// Extractors sit on resource nodes rather than running recipes, so nothing in the game data links
// them to the resources they produce. These synthetic recipes make extraction an ordinary product
// in the planner; the extractor mark and node purity are then chosen per building group.
function getExtractionRecipes(data: any[], items: ParserItemDataInterface): ParserRecipe[] {
    const recipes: ParserRecipe[] = [];
    const classes = data
        .filter((entry: any) => entry.Classes)
        .flatMap((entry: any) => entry.Classes);

    const findClass = (className: string) => classes.find((c: any) => c.ClassName === className);

    const build = (
        part: string,
        extractorClasses: string[],
        purities: ParserPurity[],
        extractorLabel: string
    ): void => {
        const resource = items.rawResources[part];
        if (!resource) {
            return;
        }

        const fluid = isFluid(part);
        const extractorData = extractorClasses
            .map(className => ({ className, data: findClass(className) }))
            .filter(entry => entry.data);

        if (extractorData.length === 0) {
            return;
        }

        const extractorList = extractorData.map(entry => ({
            building: extractors.get(entry.className) as string,
            ratePerMin: getExtractorRate(entry.data, fluid),
        }));

        // The first extractor at normal purity is the recipe's reference rate: every building
        // group's real output is expressed as a multiple of it.
        const referenceRate = extractorList[0].ratePerMin;

        recipes.push({
            id: `Extract_${part}`,
            displayName: `${resource.name} (${extractorLabel})`,
            ingredients: [],
            products: [{ part, amount: 1, perMin: referenceRate, isByProduct: false }],
            building: {
                name: extractorList[0].building,
                power: Number(extractorData[0].data.mPowerConsumption) || 0,
            },
            extraction: { purities, extractors: extractorList },
            isAlternate: false,
            isFicsmas: false,
        });
    };

    MINEABLE_SOLIDS.forEach(part => build(part, MINER_CLASSES, ALL_PURITIES, 'Miner'));
    build('LiquidOil', ['Build_OilPump_C'], ALL_PURITIES, 'Oil Extractor');
    // Water sources have no purity, so the Water Extractor is a plain producing building that
    // happens to output a raw resource. It still overclocks like anything else.
    build('Water', ['Build_WaterPump_C'], ['normal'], 'Water Extractor');

    // Resource wells: a powered pressurizer driving unpowered satellite extractors. Purity sits
    // on each satellite rather than on the well, so `purities` is empty and the composition is
    // carried per building group instead. Nitrogen Gas is only obtainable this way.
    const pressurizer = findClass('Build_FrackingSmasher_C');
    const satellite = findClass('Build_FrackingExtractor_C');

    if (pressurizer && satellite) {
        // One satellite on a normal node is the reference rate every well is expressed against.
        const normalRate = getExtractorRate(satellite, true);

        WELL_RESOURCES.forEach(part => {
            const resource = items.rawResources[part];
            if (!resource) {
                return;
            }

            recipes.push({
                id: `Extract_${part}_Well`,
                displayName: `${resource.name} (Resource Well)`,
                ingredients: [],
                products: [{ part, amount: 1, perMin: normalRate, isByProduct: false }],
                building: {
                    name: extractors.get('Build_FrackingSmasher_C') as string,
                    power: Number(pressurizer.mPowerConsumption) || 0,
                },
                extraction: {
                    purities: [],
                    extractors: [{
                        building: extractors.get('Build_FrackingSmasher_C') as string,
                        ratePerMin: normalRate,
                    }],
                    well: {
                        satelliteBuilding: extractors.get('Build_FrackingExtractor_C') as string,
                        satelliteRates: {
                            impure: normalRate * PURITY_MULTIPLIERS.impure,
                            normal: normalRate,
                            pure: normalRate * PURITY_MULTIPLIERS.pure,
                        },
                    },
                },
                isAlternate: false,
                isFicsmas: false,
            });
        });
    }

    return recipes;
}

// Fuel-less power generators (Geothermal Generator, Alien Power Augmenter) have no mFuel
// entry, so they can't flow through getPowerGeneratingRecipes. Their numbers live on the
// buildable descriptors instead, and are emitted here as synthetic power recipes.
const GEOTHERMAL_PURITIES = [
    { id: 'Impure', multiplier: 0.5 },
    { id: 'Normal', multiplier: 1 },
    { id: 'Pure', multiplier: 2 },
];

function getSpecialPowerGeneratingRecipes(data: any[]): ParserPowerRecipe[] {
    const recipes: ParserPowerRecipe[] = [];
    const classes = data
        .filter((entry: any) => entry.Classes)
        .flatMap((entry: any) => entry.Classes);

    const geothermal = classes.find((c: any) => c.ClassName === 'Build_GeneratorGeoThermal_C');
    const augmenter = classes.find((c: any) => c.ClassName === 'Build_AlienPowerBuilding_C');
    const matrixFuel = classes.find((c: any) => c.ClassName === 'Desc_AlienPowerFuel_C');

    if (geothermal) {
        // mVariablePowerProductionFactor is the average output on a Normal purity geyser;
        // purity halves or doubles it, and the output oscillates 0.5x-1.5x around the average.
        const normalAverage = Number(geothermal.mVariablePowerProductionFactor);
        GEOTHERMAL_PURITIES.forEach(purity => {
            const average = normalAverage * purity.multiplier;
            recipes.push({
                id: `GeneratorGeoThermal_${purity.id}`,
                displayName: `${geothermal.mDisplayName} (${purity.id})`,
                ingredients: [],
                byproduct: null,
                building: {
                    name: 'geothermalgenerator',
                    power: average,
                    minPower: average * 0.5,
                    maxPower: average * 1.5,
                },
            });
        });
    }

    if (augmenter && matrixFuel) {
        const baseBoost = Number(augmenter.mBaseBoostPercentage);
        // mBoostDuration is in seconds per matrix, so 12s -> 5/min per augmenter.
        recipes.push({
            id: 'AlienPowerAugmenter',
            displayName: augmenter.mDisplayName,
            ingredients: [],
            byproduct: null,
            building: {
                name: 'alienpoweraugmenter',
                power: Number(augmenter.mBasePowerProduction),
            },
            boost: {
                base: baseBoost,
                fueled: Number((baseBoost + Number(matrixFuel.mBoostPercentage)).toFixed(4)),
                fuelPart: getPartName(matrixFuel.ClassName),
                fuelRatePerMin: 60 / Number(matrixFuel.mBoostDuration),
            },
        });
    }

    return recipes;
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
            // MW is MJ/s, so a minute of running burns power * 60 MJ. e.g. nuclear reactors
            // burn 150,000 MJ/min. Written as a single multiply on purpose: the equivalent
            // (power / 60) / (1 / 3600) is float-lossy (250 MW -> 15000.000000000002).
            const burnRateMJ = building.power * 60;

            const fuels: ParserFuel[] = Array.isArray(recipe.mFuel) ? recipe.mFuel as ParserFuel[] : [];

            // The game data does not seem to contain the duration of the burning of the fuel. So we have to calculate it from the megajuoles of the fuel.
            // We know that the burn rate is 150,000MJ / minute, so we can figure out the durations from that.

            fuels.forEach((fuel: any) => {
                const primaryFuel = getPartName(fuel.mFuelClass);
                const primaryFuelPart = parts.parts[primaryFuel];
                if (!primaryFuelPart) {
                    console.warn(`Skipping power recipe fuel with missing part data: ${primaryFuel}`);
                    return;
                }

                const burnDurationInMins = primaryFuelPart.energyGeneratedInMJ / burnRateMJ;
                const burnDurationInS = burnDurationInMins * 60; // Convert to seconds

                const fuelItem: ParserFuel = {
                    primaryFuel,
                    supplementalResource: fuel.mSupplementalResourceClass ? getPartName(fuel.mSupplementalResourceClass) : "",
                    byProduct: fuel.mByproduct ? getPartName(fuel.mByproduct) : "",
                    byProductAmount: Number(fuel.mByproductAmount),
                    byProductAmountPerMin: Number(fuel.mByproductAmount) / burnDurationInMins,
                    burnDurationInS: burnDurationInS
                };

                //Find the part for the primary fuel
                let primaryPerMin = 0;
                if (primaryFuelPart.energyGeneratedInMJ > 0) {
                    primaryPerMin = burnRateMJ / primaryFuelPart.energyGeneratedInMJ;
                }
                const ingredients: ParserPowerItem[] = [];
                ingredients.push({
                    part: fuelItem.primaryFuel,
                    perMin: primaryPerMin,
                    // Derived from the fuel's energy, NOT from power / primaryPerMin: repeating rates
                    // (Rocket Fuel at 4.1666…/min) make that division inexact, and the planner
                    // multiplies the error up by the building count. See issue #485.
                    mwPerItem: primaryFuelPart.energyGeneratedInMJ / 60,
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
                        perMin: fuelItem.byProductAmountPerMin,
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

    recipes.push(...getSpecialPowerGeneratingRecipes(data));

    return recipes.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Export getRecipes for use
export {getProductionRecipes, getPowerGeneratingRecipes}