import eventBus from '@/utils/eventBus'
import parseFile from "sav2json"

export type Building = {
  id: string
  type: string
  positionX: number
  positionY: number
  positionZ: number
}

export const importWorldLoadMessages = {
  read_world: "Reading world $1...",
  parse_sav: "Parsing sav format...",
  organizing_objects: "Organizing objects...",
  done: "Done!",
}

export async function parseSavFile(buffer: Uint8Array) {
  eventBus.emit('loaderNextStep', { message: importWorldLoadMessages.parse_sav })

  let json
  try {
    json = await parseFile(buffer)
  } catch (err) {
    eventBus.emit('loaderNextStep', { message: "Something went wrong!", isFinalStep: true })
    console.error(err)
    return
  }
  console.log("WORLD:", json)
  
  const objects = parseObjects(json)
  // const objectsWithIO = getIOItems(objects)

  let objectsWithSomersloops: any[] = []
  Object.keys(objects).forEach((id) => {
    objects[id].forEach((object) => {
      const slots = getInventorySlots(object.components || [])
      object.slots = slots
      if (slots.somersloops) objectsWithSomersloops.push(trimObject(object))
    })
  })

  console.log("DONE", objectsWithSomersloops)

  eventBus.emit('loaderNextStep', { message: importWorldLoadMessages.done })
  eventBus.emit("worldDataShow", true)
  // wait for popup to init
  setTimeout(() => {
    eventBus.emit("worldData", { buildings: objectsWithSomersloops })
  })
}

function parseObjects(json: any) {
  eventBus.emit('loaderNextStep', { message: importWorldLoadMessages.organizing_objects })

  // get main objects in world
  const levels = json.saveFileBody.levels
  // last level has all of the main parts
  const data = levels[levels.length - 1]

  // we do not need conveyors as we have the connectionComponent
  // only keep the necessary objects, like machines, inventories and belt connections
  const allowObjects = ["/Buildable/Factory", "Inventory", "/Resource/", "FactoryConnectionComponent"]
  const hideObjects = ["Power", "Light", "Floodlight", "ConveyorPole", "SignDigital", "HubTerminal", "WorkBench", "Workshop", "TradingPost", "Mam", "Parts", "Blueprint"]

  // merge objects with their header values
  let filteredObjects: any[] = [];
  data.objectHeaders.forEach((header: any, i: number) => {
    if (!allowObjects.find((a) => header.typePath.includes(a))) return
    if (hideObjects.find((a) => header.typePath.includes(a))) return

    filteredObjects.push({ ...header, ...data.objects[i] })
  })

  // merge same object types into one array (for easier reading)
  const mergedObjects: { [key: string]: any[] } = {}
  filteredObjects.forEach((obj) => {
    const type = obj.typePath.replace("/Game/FactoryGame", "")
    if (!mergedObjects[type]) mergedObjects[type] = []
    mergedObjects[type].push(trimObject(obj))
  })

  // remove unnecessary values
  function trimObject(obj: any) {
    delete obj.typePath
    delete obj.rootObject
    delete obj.parentLevelName
    delete obj.parentPathName
    if (!obj.trailing?.length) delete obj.trailing
    return obj
  }

  // format all inventory items
  let inventories: { [key: string]: any } = {};
  const objectInventories = mergedObjects["/Script/FactoryGame.FGInventoryComponent"]
  objectInventories.forEach((inv) => {
    if (!inv.properties?.length) return

    const id = inv.instanceName
    const values = formatProperties(inv.properties)
    if (!values?.length) return

    inventories[id] = values
  })

  function formatProperties(values: any[]): InventoryItem[] {
    return values
      .map((a) => Object.values(a))
      .flat()
      .filter((a: any) => a.type === "InventoryItem" && a.itemName)
      .map((a: any) => ({ name: a.itemName, amount: a.property?.property?.value || 0 }))
  }

  // add inventory items to objects
  Object.values(mergedObjects).forEach((objects: any[]) => {
    objects.forEach((obj) => {
      obj.components?.forEach((component: any) => {
        let inventory = inventories[component.pathName]
        if (inventory) component.inventory = inventory
      })
    })
  })

  console.log("OBJECTS", mergedObjects)
  return mergedObjects
}

function trimObject(object: any) {
  const name = getBuildingName(object.instanceName)
  const product = object.properties.find((a: any, i: number) => i < 5 && a?.pathName?.includes(".Recipe_"))?.pathName
  return {
    name,
    slots: object.slots,
    product: getRecipeName(product)
  }
}

type InventoryItem = {
  name: string
  amount: number
}

export function getInventorySlots(components: any[]) {
  const input: InventoryItem[] = components.find((a) => a.pathName.includes("InputInventory"))?.inventory || []
  const output: InventoryItem[] = components.find((a) => a.pathName.includes("OutputInventory"))?.inventory || []

  const extra: InventoryItem[] = components.find((a) => a.pathName.includes("InventoryPotential"))?.inventory || []
  // /Game/FactoryGame/Resource/Environment/Crystal/Desc_CrystalShard.Desc_CrystalShard_C (1x1x1)
  const powershards: number = extra.filter((a) => a.name.includes("CrystalShard")).length
  // /Game/FactoryGame/Prototype/WAT/Desc_WAT1.Desc_WAT1_C (4)
  const somersloops: number = extra.filter((a) => a.name.includes("/WAT/"))?.[0]?.amount || 0

  return { input, output, powershards, somersloops }
}

function getBuildingName(instanceName: string) {
  if (!instanceName) return ""
  const start = instanceName.indexOf("Build_") + 6
  const end = instanceName.indexOf("_", start)
  return instanceName.slice(start, end).toLowerCase()
}

function getRecipeName(pathName: string) {
  if (!pathName) return ""
  const start = pathName.indexOf("/Recipe_") + 8
  const end = pathName.indexOf(".Recipe_", start)
  return pathName.slice(start, end).replace(".Recipe", "")
}


// ALTERNATIVE: create a node graph of current world using the existing factory system
// const objects = parseObjects(json)
// loop through existing factories to find matches
// const factories = getFactories()
// factories.forEach((a) => findResources(a, objects))
// setTimeout(() => eventBus.emit("worldGraphData", { factories: Object.values(factories) }), 1000)
// function findResources(factory: Factory, objects: {[key: string]: any[]}) {
//   // remove raw resources for now until there is a way to specify it
//   const factoryParts = Object.entries(factory.parts).map(([id, a]) => ({...a, id})).filter(a => !a.isRaw)
//   console.log(factoryParts)

//   const buildings: Building[] = []
//   Object.values(factory.buildingRequirements).forEach(req => {
//     let type = req.name
//     const buildingType = Object.keys(objects).find(buildingId => buildingId.toLowerCase().includes(type))
//     if (!buildingType) return
    
//     buildings.push(...objects[buildingType].map(a => ({
//       id: a.instanceName,
//       type,
//       positionX: a.positionX,
//       positionY: a.positionY,
//       positionZ: a.positionZ,
//     })))
//   })

//   // load each machine into a factory array for the node view
//   let factories: { [key: string]: Factory } = {}

//   const ioObjects = getIOItems(objects)

//   Object.values(ioObjects).forEach((object) => {
//     object.forEach(building => {
//       if (!building.outputConnections) return

//       const inputs: FactoryInput[] = building.outputConnections.map(([id, amount]: any) => ({ factoryId: id, outputPart: "", amount }))
//       const outputs: FactoryItem[] = []

//       const buildingId = getBuildingName(building.instanceName)

//       let factory: Factory = {
//         id: building.instanceName.slice(building.instanceName.lastIndexOf("_") + 1),
//         name: buildingId,
//         inputs,
//         previousInputs: inputs,
//         products: outputs,
//         byProducts: [],
//         powerProducers: [],
//         parts: {},
//         buildingRequirements: {
//           [buildingId]: { name: buildingId, amount: 1 }
//         },
//         requirementsSatisfied: true,
//         exportCalculator: {},
//         dependencies: { metrics: {}, requests: {} },
//         rawResources: {},
//         power: { consumed: 0, produced: 0, difference: 0 },
//         usingRawResourcesOnly: false,
//         hidden: false,
//         hasProblem: false,
//         inSync: true,
//         syncState: {},
//         displayOrder: 0,
//         tasks: [],
//         notes: "",
//         dataVersion: ""
//       }
  
//       factories[building.instanceName] = factory
//     })
//   })
// }