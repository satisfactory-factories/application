import { Factory, FactoryGroup, FactoryPowerChangeType, ItemType } from '@/interfaces/planner/FactoryInterface'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { newFactory } from '@/utils/factory-management/factory'
import { palette } from '@/utils/colors'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { TemplatePlan } from '@/utils/factory-setups/template-plan'

let oilFac: Factory
let copperIngotsFac: Factory
let copperMineFac: Factory
let rawMineFac: Factory
let copperBasicsFac: Factory
let circuitBoardsFac: Factory
let computersFac: Factory
let uraniumFac: Factory
let uraniumMineFac: Factory
let plutoniumFac: Factory
let alienPowerFac: Factory
let geothermalFac: Factory

// This is a more complex setup with multiple factories with dependencies going in a straight chain from Computers to Ingots and Oil Processing.
// This setup is used to test the more complex factory management functions.
// Copper Basics has a deliberate shortage of Copper Ingots to highlight that functionality to new users.
export const complexDemoPlan = (): TemplatePlan => {
  // Initialize factories
  // displayOrder is the zero-based index into the array below, as the other templates author it.
  oilFac = newFactory('Oil Processing', 0, 1)
  circuitBoardsFac = newFactory('Circuit Boards', 1, 4)
  computersFac = newFactory('Computers (end product)', 2, 5)
  rawMineFac = newFactory('Raw Materials Mine', 3, 11)
  // Grouped factories sort below the ungrouped ones and are contiguous in group order, so the
  // groups are authored last and in their own order, matching how the plan actually loads.
  // See factory-groups.ts — that invariant is load-bearing for the sidebar and the scroll-spy.
  copperMineFac = newFactory('Copper Mine', 4, 10)
  copperIngotsFac = newFactory('Copper Ingots', 5, 2)
  copperBasicsFac = newFactory('Copper Basics', 6, 3)
  // Power sits ahead of Nuclear because Uranium Power's Nuclear Waste is a BYPRODUCT, and a
  // byproduct only exists once its factory has been calculated. Put the consumer first and the
  // first pass finds nothing producing it, so flushInvalidRequests prunes the export before the
  // second pass can see it — the waste chain simply vanishes. Ordinary products are declared up
  // front and have no such constraint, which is why Circuit Boards can precede Copper Basics.
  uraniumMineFac = newFactory('Uranium Mine', 7, 12)
  uraniumFac = newFactory('Uranium Power', 8, 6)
  alienPowerFac = newFactory('Alien Power', 9, 8)
  geothermalFac = newFactory('Geothermal Power', 10, 9)
  plutoniumFac = newFactory('Plutonium Processing', 11, 7)

  // Two groups, so a new plan shows what folders are for and that a plan can have more than one.
  // Copper is a custom colour rather than a palette entry — nothing offered reads as copper —
  // while Power takes one. Deliberately not yellow: the palette leaves red and amber out because
  // a group wearing the problem colour reads as a broken factory, and the demo should not be the
  // one plan that breaks its own advice. Power holds the whole nuclear chain, mine to waste.
  const copperGroup: FactoryGroup = { id: 'g-copper', name: 'Copper', color: '#b87333', order: 0 }
  const powerGroup: FactoryGroup = { id: 'g-power', name: 'Power', color: palette.lime, order: 1 }
  copperMineFac.group = { ...copperGroup }
  copperIngotsFac.group = { ...copperGroup }
  copperBasicsFac.group = { ...copperGroup }
  uraniumMineFac.group = { ...powerGroup }
  uraniumFac.group = { ...powerGroup }
  alienPowerFac.group = { ...powerGroup }
  geothermalFac.group = { ...powerGroup }
  plutoniumFac.group = { ...powerGroup }

  // Bare IDs from src/data/factory-icons.json.
  oilFac.icon = 'packaged-oil'
  circuitBoardsFac.icon = 'circuit-board'
  computersFac.icon = 'computer'
  uraniumMineFac.icon = 'uranium-ore'
  uraniumFac.icon = 'nuclear-power-plant'
  plutoniumFac.icon = 'plutonium-fuel-rod'
  alienPowerFac.icon = 'alien-power-augmenter'
  geothermalFac.icon = 'geothermal-generator'
  rawMineFac.icon = 'miner-mk-3'
  copperMineFac.icon = 'copper-ore'
  copperIngotsFac.icon = 'copper-ingot'
  copperBasicsFac.icon = 'wire'

  // Ungrouped first, then each group contiguous and in group order — the same order as the
  // displayOrder above, because that is what the invariant means.
  const factories = [
    oilFac, circuitBoardsFac, computersFac, rawMineFac,
    copperMineFac, copperIngotsFac, copperBasicsFac,
    uraniumMineFac, uraniumFac, alienPowerFac, geothermalFac, plutoniumFac,
  ]

  // Private methods to configure the factories
  const setupFactories = () => {
    // === OIL FAC ===
    // Extraction on site, as opposed to the Copper Mine's dedicated-factory approach: the oil
    // comes out of the ground in the same factory that refines it. 3 pure nodes at 240/min plus
    // 2 normal at 120 covers the 960/min the Plastic line drinks.
    addProductToFactory(oilFac, {
      id: 'LiquidOil',
      amount: 960,
      recipe: 'Extract_LiquidOil',
    })
    const crudeOil = oilFac.products[0]
    const [pureOilGroup] = crudeOil.buildingGroups
    Object.assign(pureOilGroup, { extractorBuilding: 'oilpump', purity: 'pure', buildingCount: 3 })
    crudeOil.buildingGroups.push({
      ...pureOilGroup,
      id: pureOilGroup.id + 1,
      extractorBuilding: 'oilpump',
      purity: 'normal',
      buildingCount: 2,
      parts: {},
    })
    crudeOil.buildingGroupsTrayOpen = true

    addProductToFactory(oilFac, {
      id: 'Plastic',
      amount: 640,
      recipe: 'Plastic',
    })
    const plastic = oilFac.products[1]
    // Overclocking showcase: most of the Plastic line runs at stock clock, with four
    // refineries pushed to 200% — costing 2 Power Shards per building (8 total), shown
    // in the Power Shards & Somersloops statistics. 24 + 4x2 = 32 effective buildings.
    plastic.buildingGroups = [
      {
        id: 901,
        type: ItemType.Product,
        buildingCount: 24,
        overclockPercent: 100,
        somersloops: 0,
        parts: {},
        powerUsage: 0,
        powerProduced: 0,
      },
      {
        id: 902,
        type: ItemType.Product,
        buildingCount: 4,
        overclockPercent: 200,
        somersloops: 0,
        parts: {},
        powerUsage: 0,
        powerProduced: 0,
      },
    ]
    // Mirrors the app: adding a second group turns off item sync so the custom split sticks.
    plastic.buildingGroupItemSync = false
    // Start with the tray open so the overclock showcase is visible immediately.
    plastic.buildingGroupsTrayOpen = true
    addProductToFactory(oilFac, {
      id: 'LiquidFuel',
      amount: 40,
      recipe: 'ResidualFuel',
    })
    addPowerProducerToFactory(oilFac, {
      building: 'generatorfuel',
      powerAmount: 500,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Power,
    })
    oilFac.notes = 'This factory extracts its own Crude Oil on site — 3 Oil Extractors on pure nodes and 2 on normal, for the 960/min the Plastic line drinks — rather than importing it from a dedicated mine like the Copper chain does.\n\nIt is producing fuel which is burned off internally, also demonstrating how power generators work.\n\nIt also purposefully has a surplus of Heavy Oil Residue which unless handled would cause a blockage in the system.'
    oilFac.syncState = {
      LiquidOil: {
        amount: 960,
        recipe: 'Extract_LiquidOil',
      },
      Plastic: {
        amount: 640,
        recipe: 'Plastic',
      },
      LiquidFuel: {
        amount: 40,
        recipe: 'ResidualFuel',
      },
    }
    oilFac.syncStatePower = {
      generatorfuel: {
        powerAmount: 500,
        buildingAmount: 2,
        recipe: 'GeneratorFuel_LiquidFuel',
        ingredientAmount: 40,
      },
    }
    oilFac.inSync = true
    // =================

    // === COPPER INGOTS FAC ===
    addProductToFactory(copperIngotsFac, {
      id: 'CopperIngot',
      amount: 320,
      recipe: 'IngotCopper',
    })
    copperIngotsFac.syncState = {
      CopperIngot: {
        amount: 320,
        recipe: 'IngotCopper',
      },
    }
    copperIngotsFac.inSync = true
    // =================

    // === COPPER MINE FAC ===
    // A mine mixing marks and purities, and over-producing a little: nodes come in fixed sizes,
    // so a real mine rarely lands exactly on the number you wanted.
    addProductToFactory(copperMineFac, {
      id: 'OreCopper',
      amount: 360,
      recipe: 'Extract_OreCopper',
    })
    const copperOre = copperMineFac.products[0]
    const [mk3Group] = copperOre.buildingGroups
    Object.assign(mk3Group, { extractorBuilding: 'minermk3', purity: 'normal', buildingCount: 1 })
    copperOre.buildingGroups.push({
      ...mk3Group,
      id: mk3Group.id + 1,
      extractorBuilding: 'minermk1',
      purity: 'pure',
      buildingCount: 1,
      parts: {},
    })
    // Open on load, so the mixed marks and purities are the first thing you see.
    copperOre.buildingGroupsTrayOpen = true
    copperMineFac.notes = 'Mk.3 on a normal node plus a Mk.1 on a pure one — 360/min against the 320 the smelters need, because you take the nodes you are given.'
    // =================

    // === RAW MATERIALS MINE FAC ===
    // One mine factory hosting three resources, feeding the nuclear chain. Like the Copper Mine it
    // over-produces where the nodes don't divide neatly: extractor rates are all multiples of 30,
    // so 160 Sulfur and 200 Uranium are unreachable exactly without clocking a miner down.
    addProductToFactory(rawMineFac, { id: 'Stone', amount: 180, recipe: 'Extract_Stone' })
    const stone = rawMineFac.products[0]
    const [stoneGroup] = stone.buildingGroups
    Object.assign(stoneGroup, { extractorBuilding: 'minermk2', purity: 'normal', buildingCount: 1 })
    stone.buildingGroups.push({
      ...stoneGroup,
      id: stoneGroup.id + 1,
      extractorBuilding: 'minermk1',
      purity: 'normal',
      buildingCount: 1,
      parts: {},
    })
    stone.buildingGroupsTrayOpen = true

    addProductToFactory(rawMineFac, { id: 'Sulfur', amount: 240, recipe: 'Extract_Sulfur' })
    Object.assign(rawMineFac.products[1].buildingGroups[0], {
      extractorBuilding: 'minermk2', purity: 'normal', buildingCount: 2,
    })

    rawMineFac.notes = 'Limestone and Sulfur for the nuclear chain. A mine factory can host several resources — the Copper Mine shows the single-resource version, and Oil Processing the mine-on-site one.\n\nThe Sulfur group over-produces: miner rates are all multiples of 30, so the 160 that factory wants cannot be hit exactly without underclocking a miner.'
    // =================

    // === COPPER BASICS FAC ===
    addProductToFactory(copperBasicsFac, {
      id: 'Wire',
      amount: 400,
      recipe: 'Wire',
    })
    addProductToFactory(copperBasicsFac, {
      id: 'Cable',
      amount: 200,
      recipe: 'Cable',
    })
    addProductToFactory(copperBasicsFac, {
      id: 'CopperSheet',
      amount: 160,
      recipe: 'CopperSheet',
    })
    // Overclocking showcase: the whole sheet line runs at 200% — half the constructors
    // for the same output, at 2 Power Shards each (16 total). 8 x 2 = 16 effective.
    copperBasicsFac.products[2].buildingGroups = [
      {
        id: 903,
        type: ItemType.Product,
        buildingCount: 8,
        overclockPercent: 200,
        somersloops: 0,
        parts: {},
        powerUsage: 0,
        powerProduced: 0,
      },
    ]
    // Start with the tray open so the overclock showcase is visible immediately.
    copperBasicsFac.products[2].buildingGroupsTrayOpen = true
    addInputToFactory(copperBasicsFac, {
      factoryId: copperIngotsFac.id,
      outputPart: 'CopperIngot',
      amount: 320, // Deliberate shortage, should be 520.
    })
    addInputToFactory(copperIngotsFac, {
      factoryId: copperMineFac.id,
      outputPart: 'OreCopper',
      amount: 320,
    })
    copperBasicsFac.notes = 'This factory is deliberately short on Copper Ingots to highlight the shortage functionality. It is also over producing cables by 40 to show trimming.'
    // =================

    // === CIRCUIT BOARDS FAC ===
    addProductToFactory(circuitBoardsFac, {
      id: 'CircuitBoard',
      amount: 80,
      recipe: 'CircuitBoard',
    })
    addInputToFactory(circuitBoardsFac, {
      factoryId: copperBasicsFac.id,
      outputPart: 'CopperSheet',
      amount: 160,
    })
    addInputToFactory(circuitBoardsFac, {
      factoryId: oilFac.id,
      outputPart: 'Plastic',
      amount: 320,
    })
    // =================

    // === COMPUTERS FAC ===
    addProductToFactory(computersFac, {
      id: 'Computer',
      amount: 20,
      recipe: 'Computer',
    })
    addInputToFactory(computersFac, {
      factoryId: oilFac.id,
      outputPart: 'Plastic',
      amount: 320,
    })
    addInputToFactory(computersFac, {
      factoryId: copperBasicsFac.id,
      outputPart: 'Cable',
      amount: 160,
    })
    addInputToFactory(computersFac, {
      factoryId: circuitBoardsFac.id,
      outputPart: 'CircuitBoard',
      amount: 80,
    })
    computersFac.notes = 'This factory is the end product of the chain / plan. While not yet supported, it will eventually show that the computers will be sunk or for space elevator parts used in the construction of Project Assembly.'
    // =================

    // === URANIUM MINE FAC ===
    // Half the plan's uranium, shipped to Uranium Power. The other half is dug on site there, so
    // the plan shows one resource arriving both ways at once.
    addProductToFactory(uraniumMineFac, { id: 'OreUranium', amount: 120, recipe: 'Extract_OreUranium' })
    Object.assign(uraniumMineFac.products[0].buildingGroups[0], {
      extractorBuilding: 'minermk3', purity: 'impure', buildingCount: 1,
    })
    uraniumMineFac.products[0].buildingGroupsTrayOpen = true
    uraniumMineFac.notes = 'A dedicated mine for half the plan\'s Uranium. The other half is extracted on site in Uranium Power — the same resource reaching one factory both ways, which is the choice the planner now leaves to you.'
    // =================

    // === URANIUM FAC ===
    // Mined where it is used, next to the half that is shipped in from the Uranium Mine.
    addProductToFactory(uraniumFac, {
      id: 'OreUranium',
      amount: 120,
      recipe: 'Extract_OreUranium',
    })
    Object.assign(uraniumFac.products[0].buildingGroups[0], {
      extractorBuilding: 'minermk3', purity: 'impure', buildingCount: 1,
    })
    addProductToFactory(uraniumFac, {
      id: 'Cement',
      amount: 60,
      recipe: 'Concrete',
    })
    addProductToFactory(uraniumFac, {
      id: 'SulfuricAcid',
      amount: 160,
      recipe: 'SulfuricAcid',
    })
    addProductToFactory(uraniumFac, {
      id: 'ElectromagneticControlRod',
      amount: 10,
      recipe: 'ElectromagneticControlRod',
    })
    addProductToFactory(uraniumFac, {
      id: 'NuclearFuelRod',
      amount: 2,
      recipe: 'NuclearFuelRod',
    })
    addProductToFactory(uraniumFac, {
      id: 'UraniumCell',
      amount: 100,
      recipe: 'UraniumCell',
    })
    // Water on site — there is no purity to choose, so a Water Extractor is a plain producing
    // building that happens to output a raw resource. 22 of them against the 2560 it drinks.
    addProductToFactory(uraniumFac, {
      id: 'Water',
      amount: 2640,
      recipe: 'Extract_Water',
    })
    addPowerProducerToFactory(uraniumFac, {
      building: 'generatornuclear',
      powerAmount: 25000,
      recipe: 'GeneratorNuclear_NuclearFuelRod',
      updated: FactoryPowerChangeType.Power,
    })
    addInputToFactory(uraniumFac, { factoryId: rawMineFac.id, outputPart: 'Stone', amount: 180 })
    addInputToFactory(uraniumFac, { factoryId: rawMineFac.id, outputPart: 'Sulfur', amount: 160 })
    addInputToFactory(uraniumFac, { factoryId: uraniumMineFac.id, outputPart: 'OreUranium', amount: 120 })
    uraniumFac.notes = 'This factory is producing nuclear fuel rods and using them via a nuclear power station. This demonstrates how power generators also can generate waste products which need to be handled.\n\nIts Uranium comes from two places on purpose: half is dug on site, half is shipped in from the Uranium Mine. Its Limestone and Sulfur come from the Raw Materials Mine and its water from Water Extractors on site. It is still short of Stators, High-Speed Connectors and Encased Beams — those are the missing pieces the plan is meant to show you.'
    uraniumFac.tasks.push(
      { title: 'Add Stators factory to supply this one', completed: false },
      { title: 'Make a place for the waste to go', completed: false },
      { title: 'Get a hazmat suit', completed: true }
    )
    // =================

    // === PLUTONIUM FAC ===
    addProductToFactory(plutoniumFac, {
      id: 'NonFissibleUranium',
      amount: 33.333,
      recipe: 'NonFissileUranium',
    })
    addInputToFactory(plutoniumFac, {
      factoryId: uraniumFac.id,
      outputPart: 'NuclearWaste',
      amount: 100,
    })
    // =================

    // === ALIEN POWER FAC ===
    addPowerProducerToFactory(alienPowerFac, {
      building: 'alienpoweraugmenter',
      buildingAmount: 3,
      recipe: 'AlienPowerAugmenter',
      updated: FactoryPowerChangeType.Building,
    })
    // Two augmenters supplied with Alien Power Matrixes (+30% grid boost each) and one
    // running unfueled (+10%). Constructing each augmenter costs 10 Somersloops, which
    // surfaces in the Power Shards & Somersloops statistics.
    alienPowerFac.powerProducers[0].buildingGroups = [
      {
        id: 801,
        type: ItemType.Power,
        buildingCount: 2,
        overclockPercent: 100,
        somersloops: 0,
        parts: {},
        powerUsage: 0,
        powerProduced: 0,
        supplyMatrixes: true,
      },
      {
        id: 802,
        type: ItemType.Power,
        buildingCount: 1,
        overclockPercent: 100,
        somersloops: 0,
        parts: {},
        powerUsage: 0,
        powerProduced: 0,
      },
    ]
    // Start with the tray open so the matrix-supply toggle showcase is visible immediately.
    alienPowerFac.powerProducers[0].buildingGroupsTrayOpen = true
    alienPowerFac.notes = 'Alien Power Augmenters generate 500 MW each and boost the whole grid: +10% of total generation per augmenter, or +30% when supplied with Alien Power Matrixes.\n\nThe two fueled augmenters create a deliberate Alien Power Matrix shortage (5/min each) to show how matrix demand lands on the satisfaction ledger. Each augmenter also costs 10 Somersloops to construct — see the Power Shards & Somersloops statistics.'
    // =================

    // === GEOTHERMAL POWER FAC ===
    // One producer per geyser purity: Impure 100 MW, Normal 200 MW, Pure 400 MW average
    // per generator, each oscillating between 0.5x and 1.5x of that.
    addPowerProducerToFactory(geothermalFac, {
      building: 'geothermalgenerator',
      buildingAmount: 4,
      recipe: 'GeneratorGeoThermal_Impure',
      updated: FactoryPowerChangeType.Building,
    })
    addPowerProducerToFactory(geothermalFac, {
      building: 'geothermalgenerator',
      buildingAmount: 3,
      recipe: 'GeneratorGeoThermal_Normal',
      updated: FactoryPowerChangeType.Building,
    })
    addPowerProducerToFactory(geothermalFac, {
      building: 'geothermalgenerator',
      buildingAmount: 2,
      recipe: 'GeneratorGeoThermal_Pure',
      updated: FactoryPowerChangeType.Building,
    })
    geothermalFac.notes = 'Geothermal Generators are fuel-less — pick the geyser\'s node purity and the planner shows the average output (Impure 100 MW, Normal 200 MW, Pure 400 MW) plus the 0.5x-1.5x oscillation range the game swings between.'
  }

  // Apply setup steps
  setupFactories()

  // Every raw resource in this plan is mined or imported. What is left short is deliberate and
  // manufactured: the Copper Basics bottleneck, and the Stators / High-Speed Connectors / Encased
  // Beams that Uranium Power has no supplier for.

  // Return an object with a method to access the configured factories
  return {
    getFactories: () => factories,
    // 40 GW: comfortably above the plan's ~27 GW of generation, so the demo also
    // shows off the power-target (bullseye) deficit feature.
    powerTarget: 40_000,
  }
}
