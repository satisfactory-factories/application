import { getInventorySlots } from './worldParser'

// THE FUNCTIONS IN THIS FILE ARE CURRENTLY NOT IN USE, BUT ARE READY FOR FUTURE WORLD FACTORY IMPORT/SYNC

// get object connection data (what factory is connected where)
export function getConnections (objects: {[key: string]: any[]}) {
  const connections: any = {}
  const objectConnections = objects['/Script/FactoryGame.FGFactoryConnectionComponent']
  objectConnections.forEach(con => {
    if (!con.properties?.length) return

    const id = con.parentActorName
    if (!connections[id]) connections[id] = {}
    const properties = con.properties.filter((a: any) => a.pathName).filter((a: any) => !a.pathName?.includes('OutputInventory') && !a.pathName?.includes('StorageInventory') && !a.pathName?.includes('.inventory'))
    if (!properties.length) return

    connections[id][con.instanceName] = properties[0]?.pathName
  })

  // WIP trim away all in between conveyors so machines can be linked directly to each other

  console.log('CONNECTIONS', connections)
  return connections
}

// get input/output items per minute for each machine (starting from extractors)
export function getIOItems (objects: {[key: string]: any[]}) {
  const connections = getConnections(objects)

  const extractors = ['MinerMK1', 'MinerMk2', 'MinerMk3', 'WaterPump', 'OilPump']
  Object.keys(objects).forEach(id => {
    if (!extractors.find(a => id.includes(a))) return

    objects[id].forEach(object => {
      const slots = getInventorySlots(object.components || [])

      const outputResource = slots.output[0]?.name
      // could find resource node, but that does not have the node type in this data
      if (!outputResource) return
      console.log(getResourceName(outputResource))

      const io = getIOSlots(object.components || [])

      const firstOutput = io.outputs[0]
      if (!firstOutput) return

      // search through any Conveyor objects
      // WIP get actual items per minute based on node purity / miner mk / overclocking
      const itemsPerMinute = 100
      const outputConnections = findConnectedEnd(firstOutput, outputResource, itemsPerMinute, objects, connections)
      if (!outputConnections) return

      object.outputConnections = outputConnections
    })
  })

  return objects
}

function getResourceName (name: string) {
  // /Game/FactoryGame/Resource/RawResources/OreIron/Desc_OreIron.Desc_OreIron_C
  return name.split('/')[5]
}

function getIOSlots (components: any[]) {
  const inputRegex = /\.Input\d+/g
  const outputRegex = /\.Output\d+/g
  const inputs = components.filter(a => a.pathName.match(inputRegex)).map(a => a.pathName)
  const outputs = components.filter(a => a.pathName.match(outputRegex)).map(a => a.pathName)

  return { inputs, outputs }
}

function findConnectedEnd (id: string, resource: string, itemsPerMinute: number, objects: {[key: string]: any[]}, connections: any) {
  const parentId = id.slice(0, id.lastIndexOf('.'))
  const startConnection = connections[parentId]?.[id]
  if (!startConnection) return

  const usedParents: string[] = []

  let next = id
  let connectionId: any = next
  let loopStop = 0
  while (next && loopStop < 5000) {
    loopStop++

    const parentId = connectionId.slice(0, connectionId.lastIndexOf('.'))
    const nextConnections = connections[parentId]

    // this might not be needed, but prevents loops
    if (usedParents.includes(parentId)) break
    usedParents.push(parentId)

    let newId = ''

    if (connectionId.includes('ConveyorAny0')) newId = parentId + '.ConveyorAny1'
    else if (connectionId.includes('ConveyorAttachmentMerger')) {
      if (connectionId.includes('.Input')) newId = parentId + '.Output1'
      else throw new Error(`Incorrect!`)
    } else if (connectionId.includes('ConveyorAttachmentSplitter')) {
      if (connectionId.includes('.Input')) newId = parentId + '.Output'
      else throw new Error(`Incorrect!`)

      // WIP smart/programmable splitters (only follow allowed outputs)
      const outputIds = Object.keys(nextConnections).filter(a => a.includes('Output'))
      connectionId = { outputs: outputIds.length, itemsPerMinute, next: outputIds.map(id => findConnectedEnd(nextConnections[id], resource, itemsPerMinute / outputIds.length, objects, connections)) }
      break
    } else if (connectionId.includes('.Output')) newId = connectionId
    else if (connectionId.includes('.Input')) {
      const object: any = findObject(parentId)
      if (!object) break

      if (!object.input) object.input = {}
      if (!object.input[resource]) object.input[resource] = 0
      object.input[resource] += itemsPerMinute
      console.log('DONE', object)
      break
    } else throw new Error(`Missing type: ${connectionId}`)

    next = nextConnections?.[newId]

    if (next) connectionId = next
  }

  return connectionId

  function findObject (objectId: string) {
    let obj
    Object.values(objects).find(array =>
      array.find(a => {
        if (a.instanceName === objectId) {
          obj = a
          return true
        }
        return false
      })
    )
    return obj
  }
}
