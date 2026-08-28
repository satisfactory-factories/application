import { beforeEach, describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from 'common'
import {
  pruneTabMirrorMeta,
  readTabMirrorMeta,
  removeTabMirrorMeta,
  setTabMirrorMeta,
  TAB_MIRROR_META_KEY,
  writeTabMirrorMeta,
} from '@/sync/tab-mirror-meta'

const meta = (revision: number, ids: number[] = []) => ({
  revision,
  appVersion: PROTOCOL_VERSION,
  userTouchedIds: ids,
  userTouchedFields: [] as never[],
})

describe('tab mirror metadata', () => {
  beforeEach(() => {
    localStorage.removeItem(TAB_MIRROR_META_KEY)
  })

  it('reads an empty map when nothing is stored', () => {
    expect(readTabMirrorMeta()).toEqual({})
  })

  it('round-trips an entry', () => {
    setTabMirrorMeta('tab-1', meta(7, [1, 2]))
    expect(readTabMirrorMeta()['tab-1']).toEqual(meta(7, [1, 2]))
  })

  it('keeps entries for other tabs when one is written', () => {
    setTabMirrorMeta('tab-1', meta(1))
    setTabMirrorMeta('tab-2', meta(2))

    expect(Object.keys(readTabMirrorMeta())).toEqual(['tab-1', 'tab-2'])
  })

  it('drops an entry on removal', () => {
    setTabMirrorMeta('tab-1', meta(1))
    removeTabMirrorMeta('tab-1')
    expect(readTabMirrorMeta()).toEqual({})
  })

  it('survives corrupted storage rather than throwing', () => {
    localStorage.setItem(TAB_MIRROR_META_KEY, 'not json')
    expect(readTabMirrorMeta()).toEqual({})
  })

  it('discards entries that are not metadata', () => {
    localStorage.setItem(TAB_MIRROR_META_KEY, JSON.stringify({ 'tab-1': 'nonsense', 'tab-2': meta(3) }))
    expect(Object.keys(readTabMirrorMeta())).toEqual(['tab-2'])
  })

  it('backfills the fields an older entry lacks', () => {
    writeTabMirrorMeta({ 'tab-1': { revision: 4 } as never })

    expect(readTabMirrorMeta()['tab-1']).toEqual({
      revision: 4,
      appVersion: PROTOCOL_VERSION,
      userTouchedIds: [],
      userTouchedFields: [],
    })
  })

  it('prunes tabs the mirror no longer holds', () => {
    setTabMirrorMeta('tab-1', meta(1))
    setTabMirrorMeta('tab-2', meta(2))

    pruneTabMirrorMeta(['tab-2'])

    expect(Object.keys(readTabMirrorMeta())).toEqual(['tab-2'])
  })
})
