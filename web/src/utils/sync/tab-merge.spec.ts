import { describe, expect, it } from 'vitest'
import { mergeTabs } from '@/utils/sync/tab-merge'
import { Factory, FactoryTab } from '@/interfaces/planner/FactoryInterface'

const makeTab = (id: string, name: string, factories: Factory[] = []): FactoryTab => ({
  id,
  name,
  factories,
})

describe('mergeTabs', () => {
  it('puts remote tabs first and appends all local tabs', () => {
    const local = [makeTab('local-1', 'My Plan')]
    const remote = [makeTab('remote-1', 'Server Plan'), makeTab('remote-2', 'Server Plan 2')]

    const result = mergeTabs(local, remote)

    expect(result.tabs.map(tab => tab.id)).toEqual(['remote-1', 'remote-2', 'local-1'])
    expect(result.toPush.map(tab => tab.id)).toEqual(['local-1'])
  })

  it('renames local tabs whose name collides with a remote tab', () => {
    const local = [makeTab('local-1', 'Main')]
    const remote = [makeTab('remote-1', 'Main')]

    const result = mergeTabs(local, remote)

    expect(result.tabs[1].name).toBe('Main (local)')
    expect(result.toPush[0].name).toBe('Main (local)')
  })

  it('increments the suffix when the "(local)" name is also taken', () => {
    const local = [makeTab('local-1', 'Main'), makeTab('local-2', 'Main (local)')]
    const remote = [makeTab('remote-1', 'Main')]

    const result = mergeTabs(local, remote)

    // local-2 keeps its name (no remote collision); local-1's rename must not collide with it
    expect(result.tabs.map(tab => tab.name)).toEqual(['Main', 'Main (local 2)', 'Main (local)'])
  })

  it('leaves local tabs sharing a name with each other untouched', () => {
    const local = [makeTab('local-1', 'Twin'), makeTab('local-2', 'Twin')]
    const remote = [makeTab('remote-1', 'Something Else')]

    const result = mergeTabs(local, remote)

    expect(result.tabs.map(tab => tab.name)).toEqual(['Something Else', 'Twin', 'Twin'])
  })

  it('regenerates the id of a local tab colliding with a remote id, keeping both', () => {
    const factories = [{ id: 42 } as Factory]
    const local = [makeTab('shared-id', 'Local Copy', factories)]
    const remote = [makeTab('shared-id', 'Remote Copy')]

    const result = mergeTabs(local, remote)

    expect(result.tabs).toHaveLength(2)
    expect(result.tabs[0].id).toBe('shared-id')
    expect(result.tabs[1].id).not.toBe('shared-id')
    // Content survives, no merging of the two plans
    expect(result.tabs[1].factories).toBe(factories)
  })

  it('handles an empty local side', () => {
    const remote = [makeTab('remote-1', 'Server Plan')]
    const result = mergeTabs([], remote)

    expect(result.tabs.map(tab => tab.id)).toEqual(['remote-1'])
    expect(result.toPush).toEqual([])
  })

  it('handles an empty remote side', () => {
    const local = [makeTab('local-1', 'My Plan')]
    const result = mergeTabs(local, [])

    expect(result.tabs.map(tab => tab.id)).toEqual(['local-1'])
    expect(result.toPush.map(tab => tab.id)).toEqual(['local-1'])
    expect(result.tabs[0].name).toBe('My Plan')
  })

  it('does not mutate the passed-in local tabs', () => {
    const local = [makeTab('local-1', 'Main')]
    const remote = [makeTab('remote-1', 'Main')]

    mergeTabs(local, remote)

    expect(local[0].name).toBe('Main')
    expect(local[0].id).toBe('local-1')
  })
})
