import { beforeAll, describe, expect, it, test } from '@jest/globals'

import { processFile } from '../src/processor'
import { ParserPart } from '../src/interfaces/ParserPart'
import { ParserRecipe } from '../src/interfaces/ParserRecipe'

// TODO: break this into smaller files, this is getting too big.
describe('common', () => {
    let results: any;

    beforeAll(async () => {
        //arrange
        const inputFile = '../parsing/game-docs.json';
        const outputFile = '../parsing/gameData.json';

        //act
        results = await processFile(inputFile, outputFile);

    })

    describe('parsing tests', () => {
        test('parts should be of expected length', async () => {
            expect(Object.keys(results.items.parts).length).toBe(157);
        })
        test('raw resources should be of expected length', async () => {
            //debugging code to print out all raw resources for verification
            // let rawString = '';
            // Object.keys(results.items.rawResources).forEach((key: string) => {
            //     const rawResource = results.items.rawResources[key];
            //     rawString +=`Key: ${key}, Name: ${rawResource.name}, Limit: ${rawResource.limit} \n`;
            // });
            // console.log(rawString)
            expect(Object.keys(results.items.rawResources).length).toBe(24);
            expect(results.items.rawResources["Coal"].name).toBe('Coal');
            expect(results.items.rawResources["Coal"].limit).toBe(42300);
            expect(results.items.rawResources["Crystal"].name).toBe('Blue Power Slug');
            expect(results.items.rawResources["Crystal"].limit).toBe(596);
            expect(results.items.rawResources["Wood"].name).toBe('Wood');
            expect(results.items.rawResources["Wood"].limit).toBe(100000000);
        })

        test('iron plate part should be correct', async () => {
            const part : ParserPart = results.items.parts["IronPlate"];

            expect(part).toBeDefined();
            expect(part.name).toBe('Iron Plate');
            expect(part.stackSize).toBe(200);
            expect(part.isFluid).toBe(false);
            expect(part.isFicsmas).toBe(false);
            expect(part.energyGeneratedInMJ).toBe(0);
        })
         test('LiquidFuel part should be correct', async () => {
            const part : ParserPart = results.items.parts["LiquidFuel"];

            expect(part).toBeDefined();
            expect(part.name).toBe('Fuel');
            expect(part.stackSize).toBe(0);
            expect(part.isFluid).toBe(true);
            expect(part.isFicsmas).toBe(false);
            expect(part.energyGeneratedInMJ).toBe(750);
        })

        test('recipe length should be correct', () => {
            expect(results.recipes.length).toBe(303);
        })


        test('buildings should generate correct data', () => {
            expect(Object.keys(results.buildings).length).toBe(22);
            expect(results.buildings).toStrictEqual({
                assemblermk1: 15,
                blender: 75,
                constructormk1: 4,
                converter: 0.1,  // This has variable power consumption and is calculated in the recipe
                foundrymk1: 16,
                hadroncollider: 0.1,  // This has variable power consumption and is calculated in the recipe
                // The generators don't consume any power, they produce it.
                alienpoweraugmenter: 0,
                generatorbiomass: 0,
                generatorcoal: 0,
                generatorfuel: 0,
                geothermalgenerator: 0,
                generatornuclear: 0,
                manufacturermk1: 55,
                oilrefinery: 30,
                packager: 10,
                quantumencoder: 0.1,  // This has variable power consumption and is calculated in the recipe
                smeltermk1: 4,
                // Extractors: placed on resource nodes, so they never appear in mProducedIn
                minermk1: 5,
                minermk2: 15,
                minermk3: 45,
                oilpump: 40,
                waterpump: 20,
            })
        })

    })

    // #390: Items with no recipe (e.g. Leaves) must never be offered as selectable parts.
    // The planner builds its product selector directly from items.parts, so anything in there
    // must be producible by a recipe. Collectables stay available via items.rawResources.
    describe('recipe-less items (#390)', () => {
        test('every part must be producible by at least one recipe', () => {
            const producibleParts = new Set<string>();

            results.recipes.forEach((recipe: ParserRecipe) => {
                recipe.products.forEach(product => {
                    producibleParts.add(product.part);
                });
            });

            // Nuclear / Plutonium Waste are only produced as power generation byproducts
            results.powerGenerationRecipes.forEach((recipe: any) => {
                if (recipe.byproduct) {
                    producibleParts.add(recipe.byproduct.part);
                }
            });

            const recipelessParts = Object.keys(results.items.parts).filter(part => !producibleParts.has(part));

            if (recipelessParts.length > 0) {
                console.log('Parts with no producing recipe:', recipelessParts);
            }
            expect(recipelessParts).toEqual([]);
        });

        test('Leaves must not be a part, only a raw resource', () => {
            expect(results.items.parts["Leaves"]).toBeUndefined();
            expect(results.items.rawResources["Leaves"]).toBeDefined();
            expect(results.items.rawResources["Leaves"].name).toBe('Leaves');
        });

        test('other recipe-less collectables must also only be raw resources', () => {
            const collectables = [
                "Wood",
                "Mycelia",
                "HogParts",
                "SpitterParts",
                "StingerParts",
                "HatcherParts",
                "Crystal",
                "Crystal_mk2",
                "Crystal_mk3",
                "Gift",
            ];

            collectables.forEach(part => {
                expect(results.items.parts[part]).toBeUndefined();
                expect(results.items.rawResources[part]).toBeDefined();
            });
        });

        test('power generation byproducts must remain parts', () => {
            expect(results.items.parts["NuclearWaste"]).toBeDefined();
            expect(results.items.parts["NuclearWaste"].name).toBe('Uranium Waste');
            expect(results.items.parts["PlutoniumWaste"]).toBeDefined();
            expect(results.items.parts["PlutoniumWaste"].name).toBe('Plutonium Waste');
        });

        test('SAM is producible now it has an extraction recipe', () => {
            expect(results.items.parts["SAM"]).toBeDefined();
            expect(results.items.rawResources["SAM"]).toBeDefined();
        });

        test('burnable collectables must still have power generation recipes', () => {
            const fuels = ["Leaves", "Wood", "Mycelia"];

            fuels.forEach(fuel => {
                const recipe = results.powerGenerationRecipes.find(
                    (recipe: any) => recipe.id === `GeneratorBiomass_Automated_${fuel}`
                );
                expect(recipe).toBeDefined();
                expect(recipe.ingredients[0].part).toBe(fuel);
            });
        });
    })

    // Extraction recipes are synthetic — extractors sit on resource nodes and never appear in
    // mProducedIn — so every field is asserted here rather than trusted from the game data.
    describe('extraction recipes', () => {
        const findExtraction = (id: string): ParserRecipe =>
            results.recipes.find((recipe: ParserRecipe) => recipe.id === id);

        test('every mineable solid gets a miner recipe with all three marks', () => {
            const solids = [
                'OreIron', 'OreCopper', 'OreGold', 'Stone', 'Coal',
                'RawQuartz', 'Sulfur', 'OreBauxite', 'OreUranium', 'SAM',
            ];

            solids.forEach(part => {
                const recipe = findExtraction(`Extract_${part}`);
                expect(recipe).toBeDefined();
                expect(recipe.ingredients).toEqual([]);
                expect(recipe.products).toEqual([{ part, amount: 1, perMin: 60, isByProduct: false }]);
                expect(recipe.isAlternate).toBe(false);
                expect(recipe.extraction?.purities).toEqual(['impure', 'normal', 'pure']);
                expect(recipe.extraction?.extractors).toEqual([
                    { building: 'minermk1', ratePerMin: 60 },
                    { building: 'minermk2', ratePerMin: 120 },
                    { building: 'minermk3', ratePerMin: 240 },
                ]);
                // The reference rate must be the first extractor at normal purity, since every
                // building group's output is expressed as a multiple of it.
                expect(recipe.products[0].perMin).toBe(recipe.extraction?.extractors[0].ratePerMin);
                expect(recipe.building).toEqual({ name: 'minermk1', power: 5 });
            });
        });

        test('oil extraction is purity-based at 120 m3/min on a normal node', () => {
            const recipe = findExtraction('Extract_LiquidOil');
            expect(recipe.displayName).toBe('Crude Oil (Oil Extractor)');
            expect(recipe.products[0]).toEqual({ part: 'LiquidOil', amount: 1, perMin: 120, isByProduct: false });
            expect(recipe.extraction?.purities).toEqual(['impure', 'normal', 'pure']);
            expect(recipe.extraction?.extractors).toEqual([{ building: 'oilpump', ratePerMin: 120 }]);
            expect(recipe.building).toEqual({ name: 'oilpump', power: 40 });
        });

        test('water has no purity — a flat 120 m3/min', () => {
            const recipe = findExtraction('Extract_Water');
            expect(recipe.displayName).toBe('Water (Water Extractor)');
            expect(recipe.products[0]).toEqual({ part: 'Water', amount: 1, perMin: 120, isByProduct: false });
            expect(recipe.extraction?.purities).toEqual(['normal']);
            expect(recipe.extraction?.extractors).toEqual([{ building: 'waterpump', ratePerMin: 120 }]);
            expect(recipe.building).toEqual({ name: 'waterpump', power: 20 });
        });

        test('collectables never get an extraction recipe', () => {
            ['Leaves', 'Wood', 'Mycelia', 'HogParts', 'Crystal', 'NitrogenGas'].forEach(part => {
                expect(findExtraction(`Extract_${part}`)).toBeUndefined();
            });
        });

        // "Iron Ore (Limestone)" sits next to "Iron Ore (Miner)" in the recipe selector and reads
        // as though the ore just comes from limestone, so the Converter recipes name the process.
        test('converter recipes for raw resources name the conversion', () => {
            const expected: Record<string, string> = {
                Iron_Limestone: 'Iron Ore (Convert: Limestone)',
                Quartz_Coal: 'Raw Quartz (Convert: Coal)',
                Quartz_Bauxite: 'Raw Quartz (Convert: Bauxite)',
                Uranium_Bauxite: 'Uranium Ore (Convert: Bauxite)',
                Nitrogen_Caterium: 'Nitrogen Gas (Convert: Caterium)',
            };

            Object.entries(expected).forEach(([id, displayName]) => {
                expect(results.recipes.find((recipe: ParserRecipe) => recipe.id === id).displayName).toBe(displayName);
            });
        });

        test('every raw-producing converter recipe is relabelled, and nothing else is', () => {
            const rawResources = new Set(Object.keys(results.items.rawResources));
            const converterRaw = results.recipes.filter((recipe: ParserRecipe) =>
                recipe.building.name === 'converter' && rawResources.has(recipe.products[0].part));

            expect(converterRaw.length).toBe(17);
            converterRaw.forEach((recipe: ParserRecipe) => {
                expect(recipe.displayName).toContain('(Convert: ');
            });

            // Ficsite Ingot (Iron) and the like are Converter recipes too, but not raw resources.
            const untouched = results.recipes.filter((recipe: ParserRecipe) =>
                recipe.building.name === 'converter' && !rawResources.has(recipe.products[0].part));
            untouched.forEach((recipe: ParserRecipe) => {
                expect(recipe.displayName).not.toContain('Convert: ');
            });
        });

        test('every extractor building is in the buildings map with its power draw', () => {
            expect(results.buildings.minermk1).toBe(5);
            expect(results.buildings.minermk2).toBe(15);
            expect(results.buildings.minermk3).toBe(45);
            expect(results.buildings.oilpump).toBe(40);
            expect(results.buildings.waterpump).toBe(20);
        });
    })

    // TODO: Resolve Turbofuel and Slug issues
    describe('ParserRecipe tests', () => {
        it('should properly calculate the correct number of parts used and produced in recipes', () => {
            const parts = new Set<string>();

            // Scan all ingredients and products in all recipes to produce a list of parts that are used
            for (const recipe of results.recipes) {
                for (const ingredient of recipe.ingredients) {
                    parts.add(ingredient.part);
                }
                for (const product of recipe.products) {
                    parts.add(product.part);
                }
                if (recipe.products.length === 0) {
                    console.error('ParserRecipe ' + recipe.id + ' has no products');
                    expect(recipe.products.length).not.toBe(0);
                }
            }

            // Now we have our list of parts, assert that every part we've generated is actually used by a recipe
            const partsList = Object.keys(results.items.parts);
            const missingParts = partsList.filter(part => !parts.has(part));

            // Ingredients that are not parts (e.g. Leaves) must be raw resources — otherwise the
            // planner has no data at all for them.
            const nonPartIngredients = Array.from(parts).filter(part => !partsList.includes(part));
            const unknownIngredients = nonPartIngredients.filter(part => !results.items.rawResources[part]);

            if (missingParts && missingParts.length > 0) {
                console.log('Missing parts:');
                console.log(missingParts);
            }
            if (unknownIngredients && unknownIngredients.length > 0) {
                console.log('Ingredients missing from both parts and rawResources:', unknownIngredients);
            }
            expect(missingParts.length).toBe(0);
            expect(unknownIngredients.length).toBe(0);
        });

        it('validate a recipe with a single ingredient and product (iron plates)', () => {
            const recipe : ParserRecipe = results.recipes.find((item: { id: string; }) => item.id === 'IronPlate');

            expect(recipe.displayName).toBe('Iron Plate');
            expect(recipe.ingredients.length).toBe(1);
            expect(recipe.ingredients[0].part).toBe('IronIngot');
            expect(recipe.ingredients[0].amount).toBe(3);
            expect(recipe.ingredients[0].perMin).toBe(30);
            expect(recipe.products.length).toBe(1);
            expect(recipe.products[0].part).toBe('IronPlate');
            expect(recipe.products[0].amount).toBe(2);
            expect(recipe.products[0].perMin).toBe(20);
            expect(recipe.products[0].isByProduct).toBe(false);
            expect(recipe.building.name).toBe('constructormk1');
            expect(recipe.building.power).toBe(4);
        });

        it('validate a recipe with multiple ingredients (modular frames)', () => {
            const recipe : ParserRecipe = results.recipes.find((item: { id: string; }) => item.id === 'ModularFrame');

            expect(recipe.displayName).toBe('Modular Frame');
            expect(recipe.ingredients.length).toBe(2);
            expect(recipe.ingredients[0].part).toBe('IronPlateReinforced');
            expect(recipe.ingredients[0].amount).toBe(3);
            expect(recipe.ingredients[0].perMin).toBe(3);
            expect(recipe.ingredients[1].part).toBe('IronRod');
            expect(recipe.ingredients[1].amount).toBe(12);
            expect(recipe.ingredients[1].perMin).toBe(12);
            expect(recipe.products.length).toBe(1);
            expect(recipe.products[0].part).toBe('ModularFrame');
            expect(recipe.products[0].amount).toBe(2);
            expect(recipe.products[0].perMin).toBe(2);
            expect(recipe.products[0].isByProduct).toBe(false);
            expect(recipe.building.name).toBe('assemblermk1');
            expect(recipe.building.power).toBe(15);
            expect(recipe.isAlternate).toBe(false);
        });

        it('validate a recipe with multiple products (plastic)', () => {
            const recipe : ParserRecipe = results.recipes.find((item: { id: string; }) => item.id === 'Plastic');

            expect(recipe.displayName).toBe('Plastic');
            expect(recipe.ingredients.length).toBe(1);
            expect(recipe.ingredients[0].part).toBe('LiquidOil');
            expect(recipe.ingredients[0].amount).toBe(3);
            expect(recipe.ingredients[0].perMin).toBe(30);
            expect(recipe.products.length).toBe(2);
            expect(recipe.products[0].part).toBe('Plastic');
            expect(recipe.products[0].amount).toBe(2);
            expect(recipe.products[0].perMin).toBe(20);
            expect(recipe.products[0].isByProduct).toBe(false);
            expect(recipe.products[1].part).toBe('HeavyOilResidue');
            expect(recipe.products[1].amount).toBe(1);
            expect(recipe.products[1].perMin).toBe(10);
            expect(recipe.products[1].isByProduct).toBe(true);
            expect(recipe.building.name).toBe('oilrefinery');
            expect(recipe.building.power).toBe(30);
            expect(recipe.isAlternate).toBe(false);
        });

        it('validate a recipe with variable power (nuclear pasta)', () => {
            const recipe : ParserRecipe = results.recipes.find((item: { id: string; }) => item.id === 'SpaceElevatorPart_9');

            expect(recipe.displayName).toBe('Nuclear Pasta');
            expect(recipe.ingredients.length).toBe(2);
            expect(recipe.ingredients[0].part).toBe('CopperDust');
            expect(recipe.ingredients[0].amount).toBe(200);
            expect(recipe.ingredients[0].perMin).toBe(100);
            expect(recipe.ingredients[1].part).toBe('PressureConversionCube');
            expect(recipe.ingredients[1].amount).toBe(1);
            expect(recipe.ingredients[1].perMin).toBe(0.5);
            expect(recipe.products.length).toBe(1);
            expect(recipe.products[0].part).toBe('SpaceElevatorPart_9');
            expect(recipe.products[0].amount).toBe(1);
            expect(recipe.products[0].perMin).toBe(0.5);
            expect(recipe.products[0].isByProduct).toBe(false);
            expect(recipe.building.name).toBe('hadroncollider');
            expect(recipe.building.power).toBe(1000);
            expect(recipe.building.minPower).toBe(500);
            expect(recipe.building.maxPower).toBe(1500);
            expect(recipe.isAlternate).toBe(false);
        });

        it('validate a recipe with variable power with a Quantum encoder (Neural-Quantum Processor)', () => {
            const recipe : ParserRecipe = results.recipes.find((item: { id: string; }) => item.id === 'TemporalProcessor');

            expect(recipe.displayName).toBe('Neural-Quantum Processor');
            expect(recipe.ingredients.length).toBe(4);
            expect(recipe.ingredients[0].part).toBe('TimeCrystal');
            expect(recipe.ingredients[0].amount).toBe(5);
            expect(recipe.ingredients[0].perMin).toBe(15);
            expect(recipe.ingredients[1].part).toBe('ComputerSuper');
            expect(recipe.ingredients[1].amount).toBe(1);
            expect(recipe.ingredients[1].perMin).toBe(3);
            expect(recipe.ingredients[2].part).toBe('FicsiteMesh');
            expect(recipe.ingredients[2].amount).toBe(15);
            expect(recipe.ingredients[2].perMin).toBe(45);
            expect(recipe.ingredients[3].part).toBe('QuantumEnergy');
            expect(recipe.ingredients[3].amount).toBe(25);
            expect(recipe.ingredients[3].perMin).toBe(75);
            expect(recipe.products.length).toBe(2);
            expect(recipe.products[0].part).toBe('TemporalProcessor');
            expect(recipe.products[0].amount).toBe(1);
            expect(recipe.products[0].perMin).toBe(3);
            expect(recipe.products[0].isByProduct).toBe(false);
            expect(recipe.products[1].part).toBe('DarkEnergy');
            expect(recipe.products[1].amount).toBe(25);
            expect(recipe.products[1].perMin).toBe(75);
            expect(recipe.products[1].isByProduct).toBe(true);
            expect(recipe.building.name).toBe('quantumencoder');
            expect(recipe.building.power).toBe(1000);
            expect(recipe.building.minPower).toBe(0);
            expect(recipe.building.maxPower).toBe(2000);
            expect(recipe.isAlternate).toBe(false);
        });
    })

    // #485: the planner multiplies these rates up by the building count, so a value that is
    // a hair off the number it means (7.199999999999999 for 7.2) surfaces as 2400.002 in the UI.
    describe('numeric precision', () => {
        // Noise is a value that sits within a rounding hair of a short decimal without being
        // it. Genuine repeating rates (1.6666666666666667) are far from their 5dp form and pass.
        const isFloatNoise = (value: number): boolean => {
            if (Number.isInteger(value)) return false;
            const short = parseFloat(value.toFixed(5));
            return short !== value && Math.abs(value - short) < 1e-9;
        }

        const numbersIn = (node: any, trail: string, found: { trail: string, value: number }[] = []) => {
            if (Array.isArray(node)) node.forEach((item, i) => numbersIn(item, `${trail}[${i}]`, found));
            else if (node && typeof node === 'object') Object.entries(node).forEach(([key, item]) => numbersIn(item, `${trail}.${key}`, found));
            else if (typeof node === 'number') found.push({ trail, value: node });
            return found;
        }

        test('no number anywhere in the output should carry float noise', () => {
            const noisy = numbersIn(results, '')
                .filter(entry => isFloatNoise(entry.value))
                .map(entry => `${entry.trail} = ${entry.value}`);

            expect(noisy).toEqual([]);
        })

        test('production rates should be the exact amount-per-duration ratio', () => {
            // 3 Computers per 25s and 3 Crystal Oscillators per 300s: both came out long
            // when perMin was calculated as (60 / duration) * amount.
            const superState: ParserRecipe = results.recipes.find((item: ParserRecipe) => item.id === 'Alternate_SuperStateComputer');
            expect(superState.ingredients[0].perMin).toBe(7.2);

            const uraniumUnit: ParserRecipe = results.recipes.find((item: ParserRecipe) => item.id === 'Alternate_NuclearFuelRod_1');
            expect(uraniumUnit.ingredients[2].perMin).toBe(0.6);
            expect(uraniumUnit.products[0].perMin).toBe(0.6);

            const fuelRod: ParserRecipe = results.recipes.find((item: ParserRecipe) => item.id === 'NuclearFuelRod');
            expect(fuelRod.ingredients[1].perMin).toBe(1.2);
        })
    })
})
