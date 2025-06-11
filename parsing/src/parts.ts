import { ParserRecipe } from "./interfaces/ParserRecipe";
import { ParserPart, ParserItemDataInterface, ParserRawResource } from "./interfaces/ParserPart";
import {
  blacklist,
  whitelist,
  isFluid,
  isFicsmas,
  getPartName,
  getFriendlyName
} from "./common";

function getItems(data: any[]): ParserItemDataInterface {
    const parts: { [key: string]: ParserPart } = {};
    const rawResources = getRawResources(data);

    // Scan all recipes (not parts), looking for parts that are used in recipes. 
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
                    energyGeneratedInMJ: 0
                };
            } else if (entry.ClassName === "Desc_SpitterParts_C") {
                parts["SpitterParts"] = {
                    name: "Spitter Remains",
                    stackSize: 50, //SS_SMALL
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 0
                };
            } else if (entry.ClassName === "Desc_StingerParts_C") {
                parts["StingerParts"] = {
                    name: "Stinger Remains",
                    stackSize: 50, //SS_SMALL
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 0
                };
            } else if (entry.ClassName === "Desc_HatcherParts_C") {
                parts["HatcherParts"] = {
                    name: "Hatcher Remains",
                    stackSize: 50, //SS_SMALL
                    isFluid: false,
                    isFicsmas: false,
                    energyGeneratedInMJ: 0
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
                    name: "Crude Oil",
                    stackSize: 0, //SS_FLUID
                    isFluid: true,
                    isFicsmas: false,
                    energyGeneratedInMJ: 320
                }; 
            } else if (entry.ClassName === "Desc_Gift_C") {
                // this is a ficsmas collectable
                parts["Gift"] = {
                    name: "FICSMAS Gift",
                    stackSize: 200, //SS_BIG
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

            if (!entry.ClassName) return;

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
                const partName: string = getPartName(match[1]);  // Use the mProduct part name
                const friendlyName: string = getFriendlyName(entry.mDisplayName);  // Use the friendly name

                // Extract the product's Desc_ class name so we can find it in the class descriptors to get the stack size
                const productClass = match[0].match(/Desc_(.*?)\.Desc_/)?.[1];

                const classDescriptor = data
                    .flatMap((entry: any) => entry.Classes)
                    .find((entry: any) => entry.ClassName === `Desc_${productClass}_C`);

                // Extract stack size
                const stackSize: number = stackSizeConvert(classDescriptor?.mStackSize || "SS_UNKNOWN")
                // Extract the energy value

                let energyValue = classDescriptor.mEnergyValue ?? 0;

                // If the part is a fluid, the energy value is multiplied by 1000, cos the game loves to store everything as 0.0001 values...
                if (isFluid(partName)) {
                    energyValue *= 1000;
                }

                //console.log(`Adding part: ${partName} (${friendlyName}) with energy value: ${energyValue}`);
                parts[partName] = {
                    name: friendlyName,
                    stackSize,
                    isFluid: isFluid(partName),
                    isFicsmas: isFicsmas(entry.mDisplayName),
                    energyGeneratedInMJ: Math.round(energyValue), // Round to the nearest whole number (all energy numbers are whole numbers) 
                };

            });
        });

    // Sort the parts by key
    return {
        parts: parts,
        rawResources
    };
}

function stackSizeConvert(stackSize: string): number {
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
function getRawResources(data: any[]): { [key: string]: ParserRawResource } {
    const rawResources: { [key: string]: ParserRawResource } = {};
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
    };

    data
        .filter((entry: any) => entry.NativeClass === "/Script/CoreUObject.Class'/Script/FactoryGame.FGResourceDescriptor'")
        .flatMap((entry: any) => entry.Classes)
        .forEach((resource: any) => {
            const className = getPartName(resource.ClassName);
            const displayName: string = resource.mDisplayName;

            const data = {
                name: displayName,
                limit: limits[className] || 0
            }

            if (className && displayName) {
                rawResources[className] = data;
            }
        });

    // Manually add Leaves, Wood, Mycelia to the rawResources list
    rawResources["Leaves"] = {
        name: "Leaves",
        limit: limits["Leaves"] || 100000000  
    };
    rawResources["Wood"] = {
        name: "Wood",
        limit: limits["Wood"] || 100000000  
    };
    rawResources["Mycelia"] = {
        name: "Mycelia",
        limit: limits["Mycelia"] || 100000000  
    };

    //Manually add alien parts to the rawResources list
    rawResources["HatcherParts"] = {
        name: "Hatcher Remains",
        limit: 100000000  
    };
    rawResources["HogParts"] = {
        name: "Hog Remains",
        limit: 100000000  
    };
    rawResources["SpitterParts"] = {
        name: "Spitter Remains",
        limit: 100000000  
    };
    rawResources["StingerParts"] = {
        name: "Stinger Remains",
        limit: 100000000  
    };

    //Manually add slugs. Numbers from Satisfactory Calculator map
    rawResources["Crystal"] = {
        name: "Blue Power Slug",
        limit: 596  
    };
    rawResources["Crystal_mk2"] = {
        name: "Yellow Power Slug",
        limit: 389  
    };
    rawResources["Crystal_mk3"] = {
        name: "Purple Power Slug",
        limit: 257  
    };
    
    //Ficmas items
    rawResources["Gift"] = {
        name: "FICSMAS Gift",
        limit: 100000000  
    };

    // Order the rawResources by key
    const orderedRawResources: { [key: string]: ParserRawResource } = {};
    Object.keys(rawResources).sort().forEach(key => {
        orderedRawResources[key] = rawResources[key];
    });
    return orderedRawResources;
}

function fixItemNames(items: ParserItemDataInterface): void {
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

function fixTurbofuel(items: ParserItemDataInterface, recipes: ParserRecipe[]): void {
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