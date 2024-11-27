// Blacklist for excluding items produced by the Build Gun
const blacklist = [
    "/Game/FactoryGame/Equipment/BuildGun/BP_BuildGun.BP_BuildGun_C",
];

const whitelist = [
    // Nuclear Waste is not produced by any buildings - it's a byproduct of Nuclear Power Plants
    "Desc_NuclearWaste_C",
    "Desc_PlutoniumWaste_C",
    // These are colleactable items, not produced by buildings
    "Desc_Leaves_C",
    "Desc_Wood_C",
    "Desc_Mycelia_C",
    "Desc_HogParts_C",
    "Desc_SpitterParts_C",
    "Desc_StingerParts_C",
    "Desc_HatcherParts_C",
    "Desc_DissolvedSilica_C",
    "Desc_Crystal_C",
    "Desc_Crystal_mk2_C",
    "Desc_Crystal_mk3_C",
    // Liquid Oil can be produced by oil extractors and oil wells
    "Desc_LiquidOil_C",
    // FICSMAS items
    "Desc_Gift_C",
    "Desc_Snow_C",
    // SAM Ore is mined, but for some reason doesn't have a produced in property
    "Desc_SAM_C",
    // Special items 
    "Desc_CrystalShard_C",
    "BP_ItemDescriptorPortableMiner_C"
]

// Helper function to check if a recipe is likely to be liquid based on building type and amount
function isFluid(productName: string): boolean {
    const liquidProducts = ['water', 'liquidoil', 'heavyoilresidue', 'liquidfuel', 'liquidturbofuel', 'liquidbiofuel', 'aluminasolution', 'sulfuricacid', 'nitricacid', 'dissolvedsilica']
    const gasProducts = ['nitrogengas', 'rocketfuel', 'ionizedfuel', 'quantumenergy', 'darkenergy'];

    if (liquidProducts.includes(productName.toLowerCase())) {
        return true;
    }

    return gasProducts.includes(productName.toLowerCase());
}

function isFicsmas(displayName: string): boolean {
    return displayName.includes("FICSMAS") ||
        displayName.includes("Gift") ||
        displayName.includes("Snow") ||
        displayName.includes("Candy") ||
        displayName.includes("Fireworks");
}

// Export various items for use
export {blacklist,whitelist,isFluid,isFicsmas}