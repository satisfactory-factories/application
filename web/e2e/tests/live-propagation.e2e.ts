import { PROBE_INTERVAL_MS } from '../config'
import { expect, test } from '../helpers/fixtures'
import {
  addProduct,
  expectProductVisible,
  expectQuiesced,
  factoryNames,
  mirroredProducts,
  moveFactoryDown,
  renameFactory,
} from '../helpers/planner'
import { syncedPair } from '../helpers/rooms'

/**
 * Both clients stay open for the whole file and nothing reloads a page: the
 * report from the preview was a second device that only ever caught up on a
 * refresh, which every assertion here would pass in spite of.
 */

test('a product added on one client reaches the other, both ways', async ({ client, request }) => {
  const pair = await syncedPair(client, request, ['Smelters', 'Constructors'])
  const { roomId, first, second } = pair

  // A blank row plus a chosen item: the row is stored content on its own, and
  // nothing recalculates until the item lands, so the two halves sync separately.
  await addProduct(first, 0, 'Iron Ingot')
  await expectProductVisible(second, 0, 'Iron Ingot')

  await addProduct(second, 1, 'Copper Ingot')
  await expectProductVisible(first, 1, 'Copper Ingot')

  await expectQuiesced([first, second], roomId)
  expect(await mirroredProducts(second, roomId, 'Smelters')).toContain('IronIngot')
  expect(await mirroredProducts(first, roomId, 'Constructors')).toContain('CopperIngot')
})

test('a rename and a reorder made on one client reach the other', async ({ client, request }) => {
  const pair = await syncedPair(client, request, ['Smelters', 'Constructors'])
  const { roomId, first, second } = pair

  await renameFactory(first, 0, 'Foundries')
  await expect.poll(() => factoryNames(second), {
    message: 'the rename never reached the other client',
  }).toEqual(['Foundries', 'Constructors'])

  await moveFactoryDown(first, 0)
  await expect.poll(() => factoryNames(first), {
    message: 'the reorder did not take in the client that made it',
  }).toEqual(['Constructors', 'Foundries'])
  await expect.poll(() => factoryNames(second), {
    message: 'the reorder never reached the other client',
  }).toEqual(['Constructors', 'Foundries'])

  await expectQuiesced([first, second], roomId)
})

/**
 * The probe re-joins every idle room, and the reply is `up_to_date` or a healing
 * snapshot. Both were suspected of racing the op fan-out, so the exchange is
 * repeated on the far side of two full cycles with both clients sitting idle
 * through them. `E2E_PROBE_MS=2000` compresses the wait.
 */
test('the exchange still works after two idle probe cycles', async ({ client, request }) => {
  const pair = await syncedPair(client, request, ['Smelters'])
  const { roomId, first, second } = pair

  await addProduct(first, 0, 'Iron Ingot')
  await expectProductVisible(second, 0, 'Iron Ingot')
  await expectQuiesced([first, second], roomId)

  await first.waitForTimeout(PROBE_INTERVAL_MS * 2 + 1_000)

  await addProduct(second, 0, 'Copper Ingot')
  await expectProductVisible(first, 0, 'Copper Ingot')

  await addProduct(first, 0, 'Iron Plate')
  await expectProductVisible(second, 0, 'Iron Plate')

  await expectQuiesced([first, second], roomId)
  expect(await mirroredProducts(second, roomId, 'Smelters')).toEqual(
    expect.arrayContaining(['IronIngot', 'CopperIngot', 'IronPlate']),
  )
})
