
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
    producingBuildings.forEach((buildingName: string) => {
        if (!Object.prototype.hasOwnProperty.call(buildingsPowerMap, buildingName)) {
            buildingsPowerMap[buildingName] = buildingName.startsWith(generatorPrefix) ? 0 : 0.1;
        } else if (buildingsPowerMap[buildingName] === 0 && !buildingName.startsWith(generatorPrefix)) {
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

export { getProducingBuildings, getPowerConsumptionForBuildings };