import { beforeAll, describe, expect, it } from '@jest/globals'

import { processFile } from '../src/processor'
import {ParserPowerRecipe} from "../src/interfaces/ParserPowerRecipe";

describe('Power Parsing', () => {
    let results: any;

    beforeAll(async () => {
        const inputFile = '../parsing/game-docs.json';
        const outputFile = '../parsing/gameData.json';

        results = await processFile(inputFile, outputFile);
    })

    describe('Power generation recipes', () => {
        it('should generate a biomass burner recipe correctly with expected values', () => {
            const recipe : ParserPowerRecipe = results.powerGenerationRecipes.find((item: { id: string }) => item.id === 'GeneratorBiomass_Automated_Wood');

            expect(recipe.displayName).toBe('Biomass Burner (Wood)');
            expect(recipe.ingredients[0].part).toBe('Wood');
            expect(recipe.ingredients[0].perMin).toBe(18);
            expect(recipe.byproduct).toBe(null);
            expect(recipe.building.name).toBe('generatorbiomass');
            expect(recipe.building.power).toBe(30);
        });

      it('should generate a biomass burner liquid recipe correctly with expected values', () => {
            const recipe : ParserPowerRecipe = results.powerGenerationRecipes.find((item: { id: string }) => item.id === 'GeneratorBiomass_Automated_PackagedBiofuel');

            expect(recipe.displayName).toBe('Biomass Burner (Packaged Liquid Biofuel)');
            expect(recipe.ingredients[0].part).toBe('PackagedBiofuel');
            expect(recipe.ingredients[0].perMin).toBe(2.4);
            expect(recipe.byproduct).toBe(null);
            expect(recipe.building.name).toBe('generatorbiomass');
            expect(recipe.building.power).toBe(30);
        });

        it('should generate a coal powered generation recipe with expected values', () => {
            const recipe : ParserPowerRecipe = results.powerGenerationRecipes.find((item: { id: string }) => item.id === 'GeneratorCoal_Coal');

            expect(recipe.displayName).toBe('Coal-Powered Generator (Coal)');
            expect(recipe.ingredients[0].part).toBe('Coal');
            expect(recipe.ingredients[0].perMin).toBe(15);
            expect(recipe.ingredients[1].part).toBe('Water');
            expect(recipe.ingredients[1].perMin).toBe(45);
            expect(recipe.byproduct).toBe(null);
            expect(recipe.building.name).toBe('generatorcoal');
            expect(recipe.building.power).toBe(75)
        })

        // ==== FUEL GENERATOR
        it('should generate the liquid biofuel fuel generator recipe correctly', () => {
            const recipe : ParserPowerRecipe = results.powerGenerationRecipes.find((item: { id: string }) => item.id === 'GeneratorFuel_LiquidBiofuel');

            expect(recipe.displayName).toBe('Fuel-Powered Generator (Liquid Biofuel)');
            expect(recipe.ingredients[0].part).toBe('LiquidBiofuel');
            expect(recipe.ingredients[0].perMin).toBe(20);
            expect(recipe.byproduct).toBe(null);
            expect(recipe.building.name).toBe('generatorfuel');
            expect(recipe.building.power).toBe(250);
        })
        it('should generate the liquid fuel fuel generator recipe correctly', () => {
            const recipe : ParserPowerRecipe = results.powerGenerationRecipes.find((item: { id: string }) => item.id === 'GeneratorFuel_LiquidFuel');

            expect(recipe.displayName).toBe('Fuel-Powered Generator (Fuel)');
            expect(recipe.ingredients[0].part).toBe('LiquidFuel');
            expect(recipe.ingredients[0].perMin).toBe(20);
            expect(recipe.byproduct).toBe(null);
            expect(recipe.building.name).toBe('generatorfuel');
            expect(recipe.building.power).toBe(250);
        })
        it('should generate the liquid turbofuel fuel generator recipe correctly', () => {
            const recipe : ParserPowerRecipe = results.powerGenerationRecipes.find((item: { id: string }) => item.id === 'GeneratorFuel_LiquidTurboFuel');

            expect(recipe.displayName).toBe('Fuel-Powered Generator (Turbofuel)');
            expect(recipe.ingredients[0].part).toBe('LiquidTurboFuel');
            expect(recipe.ingredients[0].perMin).toBe(7.5);
            expect(recipe.byproduct).toBe(null);
            expect(recipe.building.name).toBe('generatorfuel');
            expect(recipe.building.power).toBe(250);
        })
        it('should generate the rocketfuel fuel generator recipe correctly', () => {
            const recipe : ParserPowerRecipe = results.powerGenerationRecipes.find((item: { id: string }) => item.id === 'GeneratorFuel_RocketFuel');

            expect(recipe.displayName).toBe('Fuel-Powered Generator (Rocket Fuel)');
            expect(recipe.ingredients[0].part).toBe('RocketFuel');
            expect(recipe.ingredients[0].perMin).toBe(4.16667);
            expect(recipe.byproduct).toBe(null);
            expect(recipe.building.name).toBe('generatorfuel');
            expect(recipe.building.power).toBe(250);
        })
        it('should generate the ionized fuel generator recipe correctly', () => {
            const recipe : ParserPowerRecipe = results.powerGenerationRecipes.find((item: { id: string }) => item.id === 'GeneratorFuel_IonizedFuel');

            expect(recipe.displayName).toBe('Fuel-Powered Generator (Ionized Fuel)');
            expect(recipe.ingredients[0].part).toBe('IonizedFuel');
            expect(recipe.ingredients[0].perMin).toBe(3);
            expect(recipe.byproduct).toBe(null);
            expect(recipe.building.name).toBe('generatorfuel');
            expect(recipe.building.power).toBe(250);
        })
        // =====================

        // ==== NUCLEAR GENERATOR
        it('should generate the nuclear fuel rod recipe correctly', () => {
            const recipe : ParserPowerRecipe = results.powerGenerationRecipes.find((item: { id: string }) => item.id === 'GeneratorNuclear_NuclearFuelRod');

            expect(recipe.displayName).toBe('Nuclear Power Plant (Uranium Fuel Rod)');
            expect(recipe.ingredients[0].part).toBe('NuclearFuelRod');
            expect(recipe.ingredients[0].perMin).toBe(0.2);
            expect(recipe.ingredients[1].part).toBe('Water');
            expect(recipe.ingredients[1].perMin).toBe(240);
            expect(recipe.byproduct).toStrictEqual({
                part: 'NuclearWaste',
                perMin: 10,
            });
            expect(recipe.building.name).toBe('generatornuclear');
            expect(recipe.building.power).toBe(2500);
        })
        it('should generate the plutonium fuel rod recipe correctly', () => {
            const recipe : ParserPowerRecipe = results.powerGenerationRecipes.find((item: { id: string }) => item.id === 'GeneratorNuclear_PlutoniumFuelRod');

            expect(recipe.displayName).toBe('Nuclear Power Plant (Plutonium Fuel Rod)');
            expect(recipe.ingredients[0].part).toBe('PlutoniumFuelRod');
            expect(recipe.ingredients[0].perMin).toBe(0.1);
            expect(recipe.ingredients[1].part).toBe('Water');
            expect(recipe.ingredients[1].perMin).toBe(240);
            expect(recipe.byproduct).toStrictEqual({
                part: 'PlutoniumWaste',
                perMin: 1,
            });
            expect(recipe.building.name).toBe('generatornuclear');
            expect(recipe.building.power).toBe(2500);
        })

        it('should generate the ficsonium fuel rod recipe correctly', () => {
            const recipe : ParserPowerRecipe = results.powerGenerationRecipes.find((item: { id: string }) => item.id === 'GeneratorNuclear_FicsoniumFuelRod');

            expect(recipe.displayName).toBe('Nuclear Power Plant (Ficsonium Fuel Rod)');
            expect(recipe.ingredients[0].part).toBe('FicsoniumFuelRod');
            expect(recipe.ingredients[0].perMin).toBe(1);
            expect(recipe.byproduct).toBe(null);
            expect(recipe.building.name).toBe('generatornuclear');
            expect(recipe.building.power).toBe(2500);
        })
    })
})
