import {Recipe} from "./interfaces/Recipe";
import {Part,PartDataInterface,RawResource} from "./interfaces/Part";
import {blacklist,whitelist,isFluid,isFicsmas} from "./common";

function getItems(data: any[]): PartDataInterface {
    const parts: { [key: string]: Part } = {};
    const collectables: { [key: string]: string } = {};
    const rawResources = getRawResources(data);

    data
        .filter((entry: any) => entry.Classes)
        .flatMap((entry: any) => entry.Classes)
        .forEach((entry: any) => {
            // There are two exception products we need to check for and add to the parts list
            if (entry.ClassName === "Desc_NuclearWaste_C") {
                // Note that this part id is NuclearWaste, not Uranium Waste
                parts["NuclearWaste"] = { 
                    name: "Uranium Waste",
                    stackSize: 500, //SS_HUGE
                    isFluid: isFluid("NuclearWaste"),
                    isFicsmas: isFicsmas(entry.mDisplayName),
                    energyGeneratedInMJ: 0
                };
            } else if (entry.ClassName === "Desc_PlutoniumWaste_C") {
                parts["PlutoniumWaste"] = {
                    name: "Plutonium Waste",
                    stackSize: 500, //SS_HUGE
                    isFluid: isFluid("PlutoniumWaste"),
                    isFicsmas: isFicsmas(entry.mDisplayName),
                    energyGeneratedInMJ: 0
                };
            }         
            //These are exception products that aren't produced by mines or extractors, they are raw materials
            if (entry.ClassName === "Desc_Leaves_C") {
                parts["Leaves"] = {
                    name: "Leaves",
                    stackSize: 500, //SS_HUGE
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 15
                };
            } else if (entry.ClassName === "Desc_Wood_C") {
                parts["Wood"] = {
                    name: "Wood",
                    stackSize: 200, //SS_BIG
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 100
                };
            } else if (entry.ClassName === "Desc_Mycelia_C") {
                parts["Mycelia"] = {
                    name: "Mycelia",
                    stackSize: 200, //SS_BIG
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 20
                };
            } else if (entry.ClassName === "Desc_HogParts_C") {
                parts["HogParts"] = {
                    name: "Hog Remains",
                    stackSize: 50, //SS_SMALL
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 250
                };
            } else if (entry.ClassName === "Desc_SpitterParts_C") {
                parts["SpitterParts"] = {
                    name: "Spitter Remains",
                    stackSize: 50, //SS_SMALL
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 250
                };
            } else if (entry.ClassName === "Desc_StingerParts_C") {
                parts["StingerParts"] = {
                    name: "Stinger Remains",
                    stackSize: 50, //SS_SMALL
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 250
                };
            } else if (entry.ClassName === "Desc_HatcherParts_C") {
                parts["HatcherParts"] = {
                    name: "Hatcher Remains",
                    stackSize: 50, //SS_SMALL
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 250
                };
            } else if (entry.ClassName === "Desc_DissolvedSilica_C") {
                // This is a special intermediate alt product
                parts["DissolvedSilica"] = {
                    name: "Dissolved Silica",
                    stackSize: 0, //SS_FLUID
                    isFluid: true,
                    isFicsmas: false,
                    energyGeneratedInMJ: 0
                };
            } else if (entry.ClassName === "Desc_LiquidOil_C") {
                // This is a special liquid raw material
                parts["LiquidOil"] = {
                    name: "Liquid Oil",
                    stackSize: 0, //SS_FLUID
                    isFluid: true,
                    isFicsmas: false,
                    energyGeneratedInMJ: 0
                }; 
            } else if (entry.ClassName === "Desc_Gift_C") {
                // this is a ficsmas collectable
                parts["Gift"] = {
                    name: "Gift",
                    stackSize: 500, //SS_HUGE
                    isFluid: false,
                    isFicsmas: true,
                    energyGeneratedInMJ: 0
                };   
            } else if (entry.ClassName === "Desc_Snow_C") {
                // this is a ficsmas collectable
                parts["Snow"] = {
                    name: "Snow",
                    stackSize: 500, //SS_HUGE
                    isFluid: false,
                    isFicsmas: true,
                    energyGeneratedInMJ: 0
                };                
            } else if (entry.ClassName === "Desc_Crystal_C") {
                parts["Crystal"] = {
                    name: "Blue Power Slug",
                    stackSize: 50, //SS_SMALL
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 0
                };                
            } else if (entry.ClassName === "Desc_Crystal_mk2_C") {
                parts["Crystal_mk2"] = {
                    name: "Yellow Power Slug",
                    stackSize: 50, //SS_SMALL
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 0
                };                
            } else if (entry.ClassName === "Desc_Crystal_mk3_C") {
                parts["Crystal_mk3"] = {
                    name: "Purple Power Slug",
                    stackSize: 50, //SS_SMALL
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 0
                };                
            } else if (entry.ClassName === "Desc_SAM_C") {
                parts["SAM"] = {
                    name: "SAM",
                    stackSize: 100, //SS_MEDIUM
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 0
                };                
            } else if (entry.ClassName === "Desc_CrystalShard_C") {
                parts["CrystalShard"] = {
                    name: "Power Shard",
                    stackSize: 100, //SS_MEDIUM
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 0
                }; 
            } else if (entry.ClassName === "BP_ItemDescriptorPortableMiner_C") {
                parts["PortableMiner"] = {
                    name: "Portable Miner",
                    stackSize: 50, //SS_SMALL
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 0
                }; 
            }

            // Ensures it's a recipe, we only care about items that are produced within a recipe.
            if (!entry.mProducedIn) return;
            //if (!whitelist.some(part => entry.ClassName && entry.ClassName.includes(part)) && !entry.mProducedIn) return;

            if (blacklist.some(building => entry.mProducedIn.includes(building))) return;
            //if (!whitelist.some(part => entry.ClassName && entry.ClassName.includes(part)) && blacklist.some(building => entry.mProducedIn.includes(building))) return;

            // Check if it's an alternate recipe and skip it for parts
            if (entry.ClassName.startsWith("Recipe_Alternate")) return;

            // Check if it's an unpackage recipe and skip it for parts
            if (entry.mDisplayName.includes("Unpackage")) return;

            // Extract the part name
            const productMatches = [...entry.mProduct.matchAll(/ItemClass=".*?\/Desc_(.*?)\.Desc_.*?",Amount=(\d+)/g)];

            productMatches.forEach(match => {
                const partName = match[1];  // Use the mProduct part name
                let friendlyName = entry.mDisplayName;  // Use the friendly name

                // Remove any text within brackets, including the brackets themselves
                friendlyName = friendlyName.replace(/\s*\(.*?\)/g, '');

                // Extract the product's Desc_ class name so we can find it in the class descriptors to get the stack size
                const productClass = match[0].match(/Desc_(.*?)\.Desc_/)?.[1];

                const classDescriptor = data
                    .flatMap((entry: any) => entry.Classes)
                    .find((entry: any) => entry.ClassName === `Desc_${productClass}_C`);

                // Extract stack size
                const stackSize = stackSizeConvert(classDescriptor?.mStackSize || "SS_UNKNOWN")
                // Extract the energy value
                const energyValue = classDescriptor?.mEnergyValue;

                // Check if the part is a collectable (e.g., Power Slug)
                if (isCollectable(entry.mIngredients)) {
                    collectables[partName] = friendlyName;
                } else {
                    //console.log(`Adding part: ${partName} (${friendlyName}) with energy value: ${energyValue}`);
                    parts[partName] = {
                        name: friendlyName,
                        stackSize,
                        isFluid: isFluid(partName),
                        isFicsmas: isFicsmas(entry.mDisplayName),
                        energyGeneratedInMJ: Math.round(energyValue), // Round to the nearest whole number (all energy numbers are whole numbers) 
                    };
                }
            });
        });

    // Sort the parts and collectables by key
    return {
        parts: Object.keys(parts)
            .sort()
            .reduce((sortedObj: { [key: string]: Part }, key: string) => {
                sortedObj[key] = parts[key];
                return sortedObj;
            }, {}),
        collectables: Object.keys(collectables)
            .sort()
            .reduce((sortedObj: { [key: string]: string }, key: string) => {
                sortedObj[key] = collectables[key];
                return sortedObj;
            }, {}),
        rawResources
    };
}

// Helper function to determine if an ingredient is a collectable (e.g., Power Slug)
function isCollectable(ingredients: string): boolean {
    const collectableDescriptors = [
        "Desc_Crystal.Desc_Crystal_C",        // Blue Power Slug
        "Desc_Crystal_mk2.Desc_Crystal_mk2_C", // Yellow Power Slug
        "Desc_Crystal_mk3.Desc_Crystal_mk3_C"  // Purple Power Slug
    ];
    return collectableDescriptors.some(descriptor => ingredients.includes(descriptor));
}

function stackSizeConvert(stackSize: string) {
    // Convert e.g. SS_HUGE to 500
    switch (stackSize) {
        case "SS_HUGE":
            return 500;
        case "SS_BIG":
            return 200;
        case "SS_MEDIUM":
            return 100;
        case "SS_SMALL":
            return 50;
        default:
            return 0;
    }
}

// Function to extract raw resources from the game data
function getRawResources(data: any[]): { [key: string]: RawResource } {
    const rawResources: { [key: string]: RawResource } = {};
    const limits: { [key: string]: number } = {
        "Coal": 42300,
        "LiquidOil": 12600,
        "NitrogenGas": 12000,
        "OreBauxite": 12300,
        "OreCopper": 36900,
        "OreGold": 15000,
        "OreIron": 92100,
        "OreUranium": 2100,
        "RawQuartz": 13500,
        "SAM": 10200,
        "Stone": 69900,
        "Sulfur": 10800,
        "Water": 9007199254740991,
    }

    data
        .filter((entry: any) => entry.NativeClass === "/Script/CoreUObject.Class'/Script/FactoryGame.FGResourceDescriptor'")
        .flatMap((entry: any) => entry.Classes)
        .forEach((resource: any) => {
            const className = resource.ClassName
                .replace('Desc_', '')
                .replace(/_C$/, '')
                .toString();
            const displayName = resource.mDisplayName;

            const data = {
                name: displayName,
                limit: limits[className] || 0
            }

            if (className && displayName) {
                rawResources[className] = data;
            }
        });

    return rawResources;
}

function fixItemNames(items: PartDataInterface): void {
    // Go through the item names and do some manual fixes, e.g. renaming "Residual Plastic" to "Plastic"
    const fixItems: Record<string, string> = {
        "AlienProtein": "Alien Protein",
        "CompactedCoal": "Compacted Coal",
        "DarkEnergy": "Dark Matter Residue",
        "HeavyOilResidue": "Heavy Oil Residue",
        "LiquidFuel": "Fuel",
        "Plastic": "Plastic",
        "PolymerResin": "Polymer Resin",
        "Rubber": "Rubber",
        "Snow": "Snow",
        "Water": "Water",
    };

    for (const search of Object.keys(fixItems)) {
        if (items.parts[search]) {
            items.parts[search].name = fixItems[search];
        }
    }
}

function fixTurbofuel(items: PartDataInterface, recipes: Recipe[]): void {
    // Rename the current "Turbofuel" which is actually "Packaged Turbofuel"
    items.parts["PackagedTurboFuel"] = items.parts["TurboFuel"];

    // Add the actual "Turbofuel" as a new item
    items.parts["LiquidTurboFuel"] = {
        name: "Turbofuel",
        stackSize: 0,
        isFluid: true,
        isFicsmas: false,
        energyGeneratedInMJ: 2000
    };
    //rename the packaged item to PackagedTurboFuel
    items.parts["PackagedTurboFuel"] = {
        name: "Packaged Turbofuel",
        stackSize: 100, //SS_MEDIUM
        isFluid: false,
        isFicsmas: false,
        energyGeneratedInMJ: 2000
    };
    //remove the incorrect packaged turbofuel
    delete items.parts["TurboFuel"];

    // Now we need to go through the recipes and wherever "TurboFuel" is mentioned, it needs to be changed to "PackagedTurbofuel"
    recipes.forEach(recipe => {
        recipe.products.forEach(product => {
            if (product.part === "TurboFuel") {
                product.part = "PackagedTurboFuel";
            }
        });

        recipe.ingredients.forEach(ingredient => {
            if (ingredient.part === "TurboFuel") {
                ingredient.part = "PackagedTurboFuel";
            }
        });
    });
}

export { getItems, fixItemNames, fixTurbofuel };