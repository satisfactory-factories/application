import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { newFactory, repairedFactoryId } from '@/utils/factory-management/factory'
import { repairDuplicateFactoryIds } from '@/utils/factory-management/validation'
import { REPAIRED_ID_OFFSET, repairedFactoryItemId } from '@/utils/factory-management/common'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { addCustomBuildingToFactory } from '@/utils/factory-management/custom-buildings'
import { useAppStore } from '@/stores/app-store'
import { stableStringify } from '@/sync/room-state'

// The plan as it arrives on a second client: the same data, never the same objects.
const collidingPlan = (): Factory[] => [
  newFactory('Ingots', 0, 1),
  newFactory('Plates', 1, 2),
  newFactory('Rods', 2, 2), // The collision
  newFactory('Screws', 3, 2), // And another on the same id
]

const fuelProducer = {
  building: 'generatorfuel',
  buildingAmount: 5,
  recipe: 'GeneratorFuel_LiquidFuel',
  updated: FactoryPowerChangeType.Building,
}

const coalProducer = {
  building: 'generatorcoal',
  buildingAmount: 3,
  recipe: 'GeneratorCoal_Coal',
  updated: FactoryPowerChangeType.Building,
}

const idlessProducerFactory = (): Factory => {
  const factory = newFactory('Fuel', 0, 1)
  addPowerProducerToFactory(factory, fuelProducer)
  addPowerProducerToFactory(factory, coalProducer)
  // As a pre-#11 plan arrives: rows with no id at all.
  factory.powerProducers.forEach(producer => {
    // @ts-ignore
    delete producer.id
  })
  return factory
}

describe('deterministic factory id repair', () => {
  it('gives two clients repairing the same malformed plan the same ids', () => {
    const first = collidingPlan()
    const second = collidingPlan()

    repairDuplicateFactoryIds(first)
    repairDuplicateFactoryIds(second)

    expect(first.map(factory => factory.id)).toEqual(second.map(factory => factory.id))
  })

  /**
   * The property the sync layer actually reads. A repaired factory registers as a local
   * structural add either way, so what keeps that harmless is both clients computing the same
   * record: they claim the same add, send the same diff, and converge on the same plan.
   */
  it('leaves two clients holding a byte-identical repaired plan', () => {
    const first = collidingPlan()
    const second = collidingPlan()

    repairDuplicateFactoryIds(first)
    repairDuplicateFactoryIds(second)

    expect(stableStringify(first)).toBe(stableStringify(second))
  })

  it('changes nothing on a second repair of the same plan', () => {
    const plan = collidingPlan()
    repairDuplicateFactoryIds(plan)
    const afterFirst = plan.map(factory => factory.id)

    const repairs = repairDuplicateFactoryIds(plan)

    expect(repairs).toHaveLength(0)
    expect(plan.map(factory => factory.id)).toEqual(afterFirst)
  })

  it('leaves a plan whose ids are already unique untouched', () => {
    const plan = [newFactory('Ingots', 0, 1), newFactory('Plates', 1, 2), newFactory('Rods', 2, 3)]

    const repairs = repairDuplicateFactoryIds(plan)

    expect(repairs).toHaveLength(0)
    expect(plan.map(factory => factory.id)).toEqual([1, 2, 3])
  })

  // Every id issued at random sits below 10,000, so a repair minted above the offset cannot
  // land on one an existing plan already saved.
  it('mints above the repaired id offset', () => {
    const plan = collidingPlan()

    repairDuplicateFactoryIds(plan)

    expect(plan[0].id).toBe(1)
    expect(plan[1].id).toBe(2)
    expect(plan[2].id).toBeGreaterThanOrEqual(REPAIRED_ID_OFFSET)
    expect(plan[3].id).toBeGreaterThanOrEqual(REPAIRED_ID_OFFSET)
  })

  // A deterministic id that collides is worse than the random one it replaced.
  it('steps past a derived id the plan already holds', () => {
    const probe = collidingPlan()
    repairDuplicateFactoryIds(probe)
    const minted = probe[2].id

    const crowded = collidingPlan()
    crowded.push(newFactory('Squatter', 4, minted))
    repairDuplicateFactoryIds(crowded)

    expect(crowded[2].id).not.toBe(minted)
    expect(crowded[4].id).toBe(minted)
    expect(new Set(crowded.map(factory => factory.id)).size).toBe(crowded.length)
  })

  // Identical names on an identical id: nothing but the position tells these apart.
  it('separates factories that are indistinguishable apart from their position', () => {
    const clones = () => Array.from({ length: 50 }, () => newFactory('Clone', 0, 1))
    const first = clones()
    const second = clones()

    repairDuplicateFactoryIds(first)
    repairDuplicateFactoryIds(second)

    expect(new Set(first.map(factory => factory.id)).size).toBe(50)
    expect(first.map(factory => factory.id)).toEqual(second.map(factory => factory.id))
  })

  it('never hands back an id the plan holds elsewhere', () => {
    const plan = collidingPlan()
    const taken = new Set(plan.map(factory => factory.id))

    plan.forEach((factory, index) => {
      expect(taken.has(repairedFactoryId(plan, factory, index))).toBe(false)
    })
  })
})

describe('deterministic power producer id backfill', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('gives two clients loading the same legacy plan the same producer ids', () => {
    const load = () => {
      setActivePinia(createPinia())
      const plan = [idlessProducerFactory()]
      useAppStore().initFactories(plan)
      return plan[0].powerProducers.map(producer => producer.id)
    }

    const first = load()
    const second = load()

    expect(first).toEqual(second)
    expect(first.every(id => id !== undefined)).toBe(true)
  })

  it('derives the same id from the same producer on every client', () => {
    const first = idlessProducerFactory()
    const second = idlessProducerFactory()

    expect(repairedFactoryItemId(first, first.powerProducers[0]))
      .toBe(repairedFactoryItemId(second, second.powerProducers[0]))
  })

  // The taken set spans both row collections, because these ids also key element ids on the card.
  it('never reuses an id the factory already holds on either collection', () => {
    const factory = idlessProducerFactory()
    const minted = repairedFactoryItemId(factory, factory.powerProducers[0])

    factory.powerProducers[1].id = minted
    addCustomBuildingToFactory(factory, { building: 'Desc_Blender_C', amount: 1 })
    factory.customBuildings[0].id = (Number(minted) + 1).toString()

    const repaired = repairedFactoryItemId(factory, factory.powerProducers[0])

    expect(repaired).not.toBe(minted)
    expect(repaired).not.toBe(factory.customBuildings[0].id)
  })
})
