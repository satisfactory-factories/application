
// Function to extract all buildings that produce something
import {getPowerProducerBuildingName} from "./common";

// Buildings that appear in mProducedIn but are not actual production buildings
const nonProductionBuildings = new Set([
    'bp_buildgun',
    'bp_workbenchcomponent',
    'bp_workshopcomponent',
    'automatedworkbench',
    'factorygame',
]);

// Generators without an mFuel entry, mapped from buildable ClassName to the normalized
// building name used across the game data. They produce power rather than consume it.
const fuellessGenerators = new Map([
    ['Build_GeneratorGeoThermal_C', 'geothermalgenerator'],
    ['Build_AlienPowerBuilding_C', 'alienpoweraugmenter'],
]);

// Extractors sit on resource nodes and never appear in mProducedIn, so they must be picked up
// from their buildable descriptors to land in the buildings map with their real power draw.
const extractors = new Map([
    ['Build_MinerMk1_C', 'minermk1'],
    ['Build_MinerMk2_C', 'minermk2'],
    ['Build_MinerMk3_C', 'minermk3'],
    ['Build_WaterPump_C', 'waterpump'],
    ['Build_OilPump_C', 'oilpump'],
    // Resource wells: the pressurizer draws the power, the satellites draw none.
    ['Build_FrackingSmasher_C', 'frackingsmasher'],
    ['Build_FrackingExtractor_C', 'frackingextractor'],
]);

function getProducingBuildings(data: any[]): string[] {
    const producingBuildingsSet = new Set<string>();

    data
        .filter((entry: any) => entry.Classes)
        .flatMap((entry: any) => entry.Classes)
        .forEach((entry: any) => {
            if (entry.mProducedIn) {
                // Updated regex to capture building names inside quotes
                const producedInBuildings = entry.mProducedIn.match(/\/(\w+)\/(\w+)\.(\w+)_C/g)
                    ?.map((building: string) => {
                        const match = RegExp(/\/(\w+)\.(\w+)_C/).exec(building);
                        if (match) {
                            // Remove "build_" prefix if present
                            return match[2].startsWith('Build_') ? match[2].replace('Build_', '').toLowerCase() : match[2].toLowerCase();
                        }
                        return null;
                    })
                    .filter((buildingName: string | null) => buildingName !== null);  // Filter out null values

                if (producedInBuildings) {
                    // The 1.2 game data references non-production buildings (e.g. BuildGun,
                    // WorkBench) in mProducedIn. Exclude them so they don't inflate the
                    // building map or pull in equipment/tool recipes downstream.
                    producedInBuildings
                        .filter((buildingName: string) => !nonProductionBuildings.has(buildingName))
                        .forEach((buildingName: string) => producingBuildingsSet.add(buildingName));
                }
            }
            // If a power generator
            if (entry.mFuel) {
                const name = getPowerProducerBuildingName(entry.ClassName)
                if (!name) {
                    throw new Error(`Could not extract building name for Power Recipe from ${entry.ClassName}`);
                }
                producingBuildingsSet.add(name)
            }
            // Fuel-less generators (Geothermal, Alien Power Augmenter) have no mFuel, so
            // they must be picked up from their buildable descriptors directly.
            if (entry.ClassName && fuellessGenerators.has(entry.ClassName)) {
                producingBuildingsSet.add(fuellessGenerators.get(entry.ClassName) as string)
            }
            if (entry.ClassName && extractors.has(entry.ClassName)) {
                producingBuildingsSet.add(extractors.get(entry.ClassName) as string)
            }
        });

    return Array.from(producingBuildingsSet);  // Convert Set to an array
}

// Function to extract the power consumption for each producing building
function getPowerConsumptionForBuildings(data: any[], producingBuildings: string[]): { [key: string]: number } {
    const buildingsPowerMap: { [key: string]: number } = {};

    data
        .filter((entry: any) => entry.Classes)
        .flatMap((entry: any) => entry.Classes)
        .forEach((building: any) => {
            if (building.ClassName && building.mPowerConsumption) {
                // Normalize the building name by removing "_C" and lowercasing it
                let buildingName: string = building.ClassName.replace(/_C$/, '').toLowerCase();
                buildingName = buildingName.replace('build_', '');
                buildingName = buildingName.replace('_automated', '');

                // Only include power data if the building is in the producingBuildings list
                if (producingBuildings.includes(buildingName)) {
                    buildingsPowerMap[buildingName] = parseFloat(building.mPowerConsumption) || 0;
                }
            }
        });

    // Variable power buildings (e.g. Hadron Collider, Converter, Quantum Encoder) may
    // have mPowerConsumption of 0 or lack it entirely. Use a sentinel value (0.1) so
    // downstream recipe filtering still includes them. The actual power is calculated
    // per-recipe from mVariablePowerConsumption fields. Power generators (which also
    // have 0 power) are excluded — they legitimately produce power rather than consume it.
    const generatorPrefix = 'generator';
    const generatorNames = new Set(fuellessGenerators.values());
    // Resource Well Extractors are genuinely unpowered — the pressurizer driving them pays the
    // whole 150 MW — so the sentinel must not invent a draw for them either.
    const unpowered = new Set(['frackingextractor']);
    const isGenerator = (buildingName: string) =>
        buildingName.startsWith(generatorPrefix) ||
        generatorNames.has(buildingName) ||
        unpowered.has(buildingName);
    producingBuildings.forEach((buildingName: string) => {
        if (!Object.prototype.hasOwnProperty.call(buildingsPowerMap, buildingName)) {
            buildingsPowerMap[buildingName] = isGenerator(buildingName) ? 0 : 0.1;
        } else if (buildingsPowerMap[buildingName] === 0 && !isGenerator(buildingName)) {
            buildingsPowerMap[buildingName] = 0.1;
        }
    });

    // Finally sort the map by key
    const sortedMap: { [key: string]: number } = {};
    Object.keys(buildingsPowerMap).sort().forEach(key => {
        sortedMap[key] = buildingsPowerMap[key];
    });

    return sortedMap;
}

export { getProducingBuildings, getPowerConsumptionForBuildings, extractors, fuellessGenerators };