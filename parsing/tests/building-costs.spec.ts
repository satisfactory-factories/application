import { beforeAll, describe, expect, it } from '@jest/globals'

import { processFile } from '../src/processor'
import { getBuildingCosts } from '../src/building-costs'
import { ParserBuildingCostIngredient } from '../src/interfaces/ParserBuildingCost'

describe('building costs', () => {
    let results: any;
    let buildingCosts: { [key: string]: ParserBuildingCostIngredient[] };

    beforeAll(async () => {
        const inputFile = '../parsing/game-docs.json';
        const outputFile = '../parsing/gameData.json';

        results = await processFile(inputFile, outputFile);
        buildingCosts = results.buildingCosts;
    })

    it('should extract the cost of a production building', () => {
        expect(buildingCosts['constructormk1']).toEqual([
            { part: 'IronPlateReinforced', amount: 2 },
            { part: 'Cable', amount: 8 },
        ]);
    })

    it('should extract the cost of a power generator', () => {
        expect(buildingCosts['generatorcoal']).toEqual([
            { part: 'IronPlateReinforced', amount: 20 },
            { part: 'Rotor', amount: 10 },
            { part: 'Cable', amount: 30 },
        ]);
    })

    it('should extract the cost of an extractor', () => {
        expect(buildingCosts['minermk1']).toBeTruthy();
        expect(buildingCosts['minermk1'].length).toBeGreaterThan(0);
    })

    it('should extract the cost of a custom building', () => {
        expect(buildingCosts['portal']).toEqual([
            { part: 'MotorLightweight', amount: 5 },
            { part: 'ModularFrameLightweight', amount: 10 },
            { part: 'QuantumOscillator', amount: 15 },
            { part: 'SAMFluctuator', amount: 25 },
            { part: 'FicsiteMesh', amount: 50 },
        ]);
        expect(buildingCosts['radartower']).toBeTruthy();
        expect(buildingCosts['resourcesink']).toBeTruthy();
        expect(buildingCosts['trainstation']).toBeTruthy();
    })

    it('should give every known building a cost', () => {
        const knownBuildings = new Set<string>([
            ...Object.keys(results.buildings),
            ...results.customBuildings.map((building: any) => building.name),
        ]);
        knownBuildings.forEach(building => {
            expect(buildingCosts[building]).toBeDefined();
        });
    })

    it('should not include buildings the Build Gun makes that are not tracked elsewhere', () => {
        // Walls, foundations, conveyor poles etc. are not production, power, extraction or
        // custom buildings, so they must not appear here even though the Build Gun makes them.
        expect(buildingCosts['wall_8x4_01']).toBeUndefined();
        expect(buildingCosts['conveyorpole']).toBeUndefined();
    })

    describe('getBuildingCosts', () => {
        const entry = (recipe: any) => [{ Classes: [recipe] }];
        const buildGunRecipe = (overrides: any = {}) => ({
            ClassName: 'Recipe_ConstructorMk1_C',
            mProducedIn: '("/Game/FactoryGame/Equipment/BuildGun/BP_BuildGun.BP_BuildGun_C")',
            mProduct: '((ItemClass="/Script/Engine.BlueprintGeneratedClass\'/Game/FactoryGame/Buildable/Factory/ConstructorMk1/Desc_ConstructorMk1.Desc_ConstructorMk1_C\'",Amount=1))',
            mIngredients: '((ItemClass="/Script/Engine.BlueprintGeneratedClass\'/Game/FactoryGame/Resource/Parts/Cable/Desc_Cable.Desc_Cable_C\'",Amount=8))',
            ...overrides,
        });

        it('should ignore recipes not produced by the Build Gun', () => {
            const result = getBuildingCosts(entry(buildGunRecipe({
                mProducedIn: '("/Game/FactoryGame/Buildable/Factory/ConstructorMk1/Build_ConstructorMk1.Build_ConstructorMk1_C")',
            })), new Set(['constructormk1']));
            expect(result).toEqual({});
        })

        it('should ignore recipes whose ClassName is not a Recipe', () => {
            const result = getBuildingCosts(entry({
                ...buildGunRecipe(),
                ClassName: 'Build_ConstructorMk1_C',
            }), new Set(['constructormk1']));
            expect(result).toEqual({});
        })

        it('should ignore a recipe whose product cannot be parsed', () => {
            const result = getBuildingCosts(entry(buildGunRecipe({ mProduct: '' })), new Set(['constructormk1']));
            expect(result).toEqual({});
        })

        it('should skip buildings not in the known set', () => {
            const result = getBuildingCosts(entry(buildGunRecipe()), new Set(['somethingelse']));
            expect(result).toEqual({});
        })

        it('should keep the first recipe on a collision', () => {
            const first = buildGunRecipe();
            const second = buildGunRecipe({
                mIngredients: '((ItemClass="/Script/Engine.BlueprintGeneratedClass\'/Game/FactoryGame/Resource/Parts/Screw/Desc_Screw.Desc_Screw_C\'",Amount=99))',
            });
            const result = getBuildingCosts([{ Classes: [first, second] }], new Set(['constructormk1']));
            expect(result['constructormk1']).toEqual([{ part: 'Cable', amount: 8 }]);
        })

        it('should default to no ingredients when mIngredients is missing', () => {
            const result = getBuildingCosts(entry(buildGunRecipe({ mIngredients: undefined })), new Set(['constructormk1']));
            expect(result['constructormk1']).toEqual([]);
        })

        it('should normalize an _automated product the same way the buildings map does', () => {
            const result = getBuildingCosts(entry(buildGunRecipe({
                ClassName: 'Recipe_GeneratorBiomass_Automated_C',
                mProduct: '((ItemClass="/Script/Engine.BlueprintGeneratedClass\'/Game/FactoryGame/Buildable/Factory/GeneratorBiomass/Desc_GeneratorBiomass_Automated.Desc_GeneratorBiomass_Automated_C\'",Amount=1))',
            })), new Set(['generatorbiomass']));
            expect(result['generatorbiomass']).toEqual([{ part: 'Cable', amount: 8 }]);
        })

        it('should ignore entries without classes', () => {
            expect(getBuildingCosts([{ NativeClass: 'nothing here' }], new Set(['constructormk1']))).toEqual({});
        })
    })
})
