import * as path from 'path';

import * as fs from 'fs-extra';
import * as iconv from 'iconv-lite';

import {ParserRecipe} from "./interfaces/ParserRecipe";
import {ParserPowerRecipe} from "./interfaces/ParserPowerRecipe";
import {ParserPart, ParserItemDataInterface} from "./interfaces/ParserPart";
import {getItems, fixItemNames, fixTurbofuel} from './parts';
import {getProductionRecipes, getPowerGeneratingRecipes} from './recipes';
import {getProducingBuildings, getPowerConsumptionForBuildings} from './buildings';

// Function to detect if the file is UTF-16
async function isUtf16(inputFile: string): Promise<boolean> {
    const buffer = await fs.readFile(path.resolve(inputFile));
    const bomLE = buffer[0] === 0xFF && buffer[1] === 0xFE;
    const bomBE = buffer[0] === 0xFE && buffer[1] === 0xFF;
    return bomLE || bomBE;
}

// Function to read UTF-16 and convert to UTF-8
async function readFileAsUtf8(inputFile: string): Promise<string> {
    const isUtf16Encoding = await isUtf16(inputFile);
    if (isUtf16Encoding) {
        const buffer = await fs.readFile(path.resolve(inputFile));
        const content = iconv.decode(buffer, 'utf-16le');
        return normalizeLineEndings(content);
    } else {
        // noinspection JSVoidFunctionReturnValueUsed
        const content = await fs.readFile(path.resolve(inputFile), 'utf-8');
        return normalizeLineEndings(content);
    }
}

// Helper function to normalize line endings
function normalizeLineEndings(content: string): string {
    return content.replace(/\r\n/g, '\n');
}

// Function to clean up the input file to make it valid JSON
function cleanInput(input: string): string {
    let cleaned = input.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
    return cleaned;
}

function removeRubbishItems(items: ParserItemDataInterface, recipes: ParserRecipe[]): void {
    // Create a Set to store all product keys from recipes
    const recipeProducts = new Set();

    // Loop through each recipe to collect all product keys
    recipes.forEach(recipe => {
        recipe.products.forEach(product => {
            recipeProducts.add(product.part);
        });
        recipe.ingredients.forEach(ingredient => {
            recipeProducts.add(ingredient.part);
        });
    });

    // Loop through each item in items.parts and remove any entries that do not exist in recipeProducts
    Object.keys(items.parts).forEach(part => {
        if (!recipeProducts.has(part)) {
            //console.log(`Removing rubbish item: ${part}`);
            delete items.parts[part];
        }
    });
}

// Central function to process the file and generate the output
async function processFile(
    inputFile: string, 
    outputFile: string) : Promise<{ buildings: { 
                                        [key: string]: number }; 
                                        items: ParserItemDataInterface;
                                        recipes: ParserRecipe[],
                                        powerGenerationRecipes: ParserPowerRecipe[];
                                    } | undefined> {
    try {
        const fileContent = await readFileAsUtf8(inputFile);
        const cleanedContent = cleanInput(fileContent);
        const data = JSON.parse(cleanedContent);

        // Get parts
        const items = getItems(data);
        fixItemNames(items);

        // Get an array of all buildings that produce something
        const producingBuildings = getProducingBuildings(data);

        // Get power consumption for the producing buildings
        const buildings = getPowerConsumptionForBuildings(data, producingBuildings);

        // Pass the producing buildings with power data to getRecipes to calculate perMin and powerPerProduct
        const recipes = getProductionRecipes(data, buildings);
        removeRubbishItems(items, recipes);
        fixTurbofuel(items, recipes);

        //IMPORTANT: The order here matters - don't run this because fixing the turbofuel. 
        const powerGenerationRecipes = getPowerGeneratingRecipes(data, items);

        // Since we've done some manipulation of the items data, re-sort it
        const sortedItems: { [key: string]: ParserPart } = {};
        Object.keys(items.parts).sort().forEach(key => {
            sortedItems[key] = items.parts[key];
        });
        items.parts = sortedItems;

        // Construct the final JSON object
        const finalData = {
            buildings,
            items,
            recipes,
            powerGenerationRecipes
        };

        // Write the output to the file
        await fs.writeJson(path.resolve(outputFile), finalData, {spaces: 4});
        console.log(`Processed parts, buildings, and recipes have been written to ${outputFile}.`);

        return finalData;
    } catch (error) {
        if (error instanceof Error) {
            console.error(`Error processing file: ${error.message}`);
        } else {
            console.error(`Error processing file: ${error}`);
        }
    }
}

// Export processFile for use
export {processFile}
