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
            expect(Object.keys(results.items.parts).length).toBe(156);
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
            expect(results.recipes.length).toBe(291);
        })


        test('buildings should generate correct data', () => {
            expect(Object.keys(results.buildings).length).toBe(15);
            expect(results.buildings).toStrictEqual({
                assemblermk1: 15,
                blender: 75,
                constructormk1: 4,
                converter: 0.1,  // This has variable power consumption and is calculated in the recipe
                foundrymk1: 16,
                hadroncollider: 0.1,  // This has variable power consumption and is calculated in the recipe
                // The generators don't consume any power, they produce it.
                generatorbiomass: 0,
                generatorcoal: 0,
                generatorfuel: 0,
                generatornuclear: 0,
                manufacturermk1: 55,
                oilrefinery: 30,
                packager: 10,
                quantumencoder: 0.1,  // This has variable power consumption and is calculated in the recipe
                smeltermk1: 4,
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
                "SAM",
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
})
