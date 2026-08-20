// Extracts the buildings a player places that run no production recipe: portals, train
// stations, radar towers, lights and the like. They cost power (and occasionally parts)
// without producing anything, so the planner lists them separately from products.
import {ParserCustomBuilding, ParserCustomBuildingIngredient} from "./interfaces/ParserCustomBuilding";

// Upkeep the docs do not describe. `mPowerConsumption` is in every buildable descriptor, but a
// building that eats parts to keep running states neither the part nor the rate anywhere in
// Docs.json — the Main Portal's fuel inventory only says how big it is and how full it has to
// be before the link starts. So the rates are transcribed from the wiki, per building, per
// minute, and only for buildings that consume something while simply running.
// https://satisfactory.wiki.gg/wiki/Portal
const buildingUpkeep = new Map<string, ParserCustomBuildingIngredient[]>([
    // Only the Main Portal is fed: the Satellite Portal draws power but takes no cells.
    ['portal', [{part: 'SingularityCell', perMin: 2}]],
]);

// Buildings the game data still carries but no longer offers in the build menu.
const retiredBuildings = new Set([
    'jumppad',
    'jumppadtilted',
]);

// Matches the normalization getPowerConsumptionForBuildings uses, so a custom building and a
// production building of the same class always land on the same key.
export function getCustomBuildingName(className: string): string {
    return className
        .replace(/_C$/, '')
        .toLowerCase()
        .replace('build_', '')
        .replace('_automated', '');
}

// `producingBuildings` is everything already covered by production recipes or power generation
// — those are configured as products and generators, so they must not appear here as well.
function getCustomBuildings(data: any[], producingBuildings: string[]): ParserCustomBuilding[] {
    const producing = new Set(producingBuildings);
    const customBuildings: ParserCustomBuilding[] = [];
    const seen = new Set<string>();

    data
        .filter((entry: any) => entry.Classes)
        .flatMap((entry: any) => entry.Classes)
        .forEach((building: any) => {
            const className: string = building.ClassName ?? '';
            if (!className.startsWith('Build_')) {
                return;
            }

            // Variable-power buildings state a range ("(Min=25.000000,Max=110.000000)") rather
            // than a number. Every one of them is a production building, so they are already
            // excluded by `producing` — parseFloat would read the range as NaN regardless.
            const power = parseFloat(building.mPowerConsumption);
            if (!power || isNaN(power) || power <= 0) {
                return;
            }

            const name = getCustomBuildingName(className);
            if (producing.has(name) || retiredBuildings.has(name) || seen.has(name)) {
                return;
            }
            seen.add(name);

            customBuildings.push({
                name,
                displayName: building.mDisplayName ?? name,
                power,
                ingredients: buildingUpkeep.get(name) ?? [],
            });
        });

    customBuildings.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return customBuildings;
}

export {getCustomBuildings, buildingUpkeep, retiredBuildings};
