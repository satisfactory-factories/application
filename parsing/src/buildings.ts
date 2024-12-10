
// Function to extract all buildings that produce something
import {getPowerProducerBuildingName} from "./common";

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
                    producedInBuildings.forEach((buildingName: string) => producingBuildingsSet.add(buildingName));
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
                buildingName = buildingName.startsWith('build_') ? buildingName.replace('build_', '') : buildingName;

                // Only include power data if the building is in the producingBuildings list
                if (producingBuildings.includes(buildingName)) {
                    buildingsPowerMap[buildingName] = parseFloat(building.mPowerConsumption) || 0;
                }
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