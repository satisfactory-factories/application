
// Function to extract all buildings that produce something
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
            } else if (entry.ClassName === "Desc_NuclearWaste_C") { // manually add nuclear power plant, as it produces nuclear waste
                producingBuildingsSet.add("nuclearpowerplant");
            }
        });

    return Array.from(producingBuildingsSet);  // Convert Set to an array
}

// For now this is just the 'Sink', but we may add more in the future
function getConsumingBuildings(data: any[]): string[] {
    const consumingBuildingsSet = new Set<string>();

    data
        .filter((entry: any) => entry.Classes)
        .flatMap((entry: any) => entry.Classes)
        .forEach((building: any) => {
            if (building.ClassName && building.ClassName === "Build_ResourceSink_C") {
                //This is just to make sure that it still exists, but we may grab more data from it in the future

                // Normalize the building name by removing "_C" and lowercasing it
                let buildingName: string = building.ClassName.replace(/_C$/, '').toLowerCase();
                buildingName = buildingName.startsWith('build_') ? buildingName.replace('build_', '') : buildingName;

                consumingBuildingsSet.add(buildingName)
            }
        });

    return Array.from(consumingBuildingsSet);  // Convert Set to an array
}

// Function to extract the power consumption for each building
function getPowerConsumptionForBuildings(data: any[], buildings: string[]): { [key: string]: number } {
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
                if (buildings.includes(buildingName)) {
                    buildingsPowerMap[buildingName] = parseFloat(building.mPowerConsumption) || 0;
                }
            }
        });

        //Manually add nuclear power plant
        buildingsPowerMap["nuclearpowerplant"] = 0;

    // Finally sort the map by key
    const sortedMap: { [key: string]: number } = {};
    Object.keys(buildingsPowerMap).sort().forEach(key => {
        sortedMap[key] = buildingsPowerMap[key];
    });

    return sortedMap;
}



export { getProducingBuildings, getConsumingBuildings, getPowerConsumptionForBuildings };