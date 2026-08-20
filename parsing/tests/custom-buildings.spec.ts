import { beforeAll, describe, expect, it } from '@jest/globals'

import { processFile } from '../src/processor'
import { ParserCustomBuilding } from '../src/interfaces/ParserCustomBuilding'
import { getCustomBuildingName, getCustomBuildings } from '../src/custom-buildings'

describe('custom buildings', () => {
    let results: any;
    let customBuildings: ParserCustomBuilding[];

    const find = (name: string): ParserCustomBuilding | undefined =>
        customBuildings.find(building => building.name === name);

    beforeAll(async () => {
        const inputFile = '../parsing/game-docs.json';
        const outputFile = '../parsing/gameData.json';

        results = await processFile(inputFile, outputFile);
        customBuildings = results.customBuildings;
    })

    it('should extract the expected number of custom buildings', () => {
        expect(customBuildings.length).toBe(20);
    })

    it('should sort them by display name', () => {
        const names = customBuildings.map(building => building.displayName);
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    })

    it('should extract the Main Portal with its power and Singularity Cell upkeep', () => {
        expect(find('portal')).toEqual({
            name: 'portal',
            displayName: 'Main Portal',
            power: 250,
            ingredients: [{ part: 'SingularityCell', perMin: 2 }],
        });
    })

    // The cells go into the Main Portal; the satellite end only draws power.
    it('should give the Satellite Portal no upkeep', () => {
        expect(find('portalsatellite')).toEqual({
            name: 'portalsatellite',
            displayName: 'Satellite Portal',
            power: 250,
            ingredients: [],
        });
    })

    it('should extract other powered non-production buildings', () => {
        expect(find('trainstation')?.power).toBe(50);
        expect(find('dronestation')?.power).toBe(100);
        expect(find('radartower')?.power).toBe(30);
        expect(find('resourcesink')?.power).toBe(30);
        expect(find('streetlight')?.power).toBe(1);
    })

    it('should give every custom building a power draw and a display name', () => {
        customBuildings.forEach(building => {
            expect(building.power).toBeGreaterThan(0);
            expect(building.displayName).toBeTruthy();
            expect(building.displayName).not.toBe(building.name);
        });
    })

    // Production buildings and generators are configured as products and power generators, so
    // offering them here as well would let the same building be planned twice.
    it('should exclude production buildings, extractors and generators', () => {
        const producing = Object.keys(results.buildings);
        customBuildings.forEach(building => {
            expect(producing).not.toContain(building.name);
        });
        expect(find('constructormk1')).toBeUndefined();
        expect(find('minermk1')).toBeUndefined();
        expect(find('generatorcoal')).toBeUndefined();
        expect(find('frackingsmasher')).toBeUndefined();
    })

    // Both are still in the game data but neither can be built any more.
    it('should exclude the retired jump pads', () => {
        expect(find('jumppad')).toBeUndefined();
        expect(find('jumppadtilted')).toBeUndefined();
        expect(find('jumppadadjustable')?.displayName).toBe('Jump Pad');
    })

    it('should exclude unpowered buildings', () => {
        // Foundations, walls and the Space Elevator draw nothing.
        expect(find('spaceelevator')).toBeUndefined();
        expect(find('powerstoragemk1')).toBeUndefined();
    })

    describe('getCustomBuildingName', () => {
        it('should normalize class names the same way the buildings map does', () => {
            expect(getCustomBuildingName('Build_Portal_C')).toBe('portal');
            expect(getCustomBuildingName('Build_GeneratorBiomass_Automated_C')).toBe('generatorbiomass');
        })
    })

    describe('getCustomBuildings', () => {
        const entry = (building: any) => [{ Classes: [building] }];

        it('should skip buildings that are not buildables', () => {
            const result = getCustomBuildings(entry({
                ClassName: 'Desc_Portal_C',
                mDisplayName: 'Not a building',
                mPowerConsumption: '250.000000',
            }), []);
            expect(result).toEqual([]);
        })

        it('should skip variable power ranges, which only production buildings carry', () => {
            const result = getCustomBuildings(entry({
                ClassName: 'Build_HadronCollider_C',
                mDisplayName: 'Particle Accelerator',
                mPowerConsumption: '(Min=25.000000,Max=110.000000)',
            }), []);
            expect(result).toEqual([]);
        })

        it('should skip duplicate class names', () => {
            const building = {
                ClassName: 'Build_RadarTower_C',
                mDisplayName: 'Radar Tower',
                mPowerConsumption: '30.000000',
            };
            const result = getCustomBuildings([{ Classes: [building, building] }], []);
            expect(result.length).toBe(1);
        })

        it('should fall back to the normalized name when the game data has no display name', () => {
            const result = getCustomBuildings(entry({
                ClassName: 'Build_MysteryBuilding_C',
                mPowerConsumption: '5.000000',
            }), []);
            expect(result[0].displayName).toBe('mysterybuilding');
        })

        it('should ignore classes with no class name', () => {
            expect(getCustomBuildings(entry({ mPowerConsumption: '5.000000' }), [])).toEqual([]);
        })

        it('should ignore entries without classes', () => {
            expect(getCustomBuildings([{ NativeClass: 'nothing here' }], [])).toEqual([]);
        })
    })
})
