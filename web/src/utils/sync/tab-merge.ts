import { FactoryTab } from '@/interfaces/planner/FactoryInterface'

export interface TabMergeResult {
  // The full tab list to apply locally: remote tabs first (in remote order), then every
  // local tab appended as a separate tab.
  tabs: FactoryTab[];
  // The appended local tabs, which the caller must push to the server.
  toPush: FactoryTab[];
}

// Merges the user's local tabs alongside the remote tabs, losing nothing. There is no
// content-level merging of two plans — if a local tab collides with a remote one by name
// it is kept as a separate tab with a "(local)" suffix, and an id collision gets a fresh
// id so both copies survive.
export const mergeTabs = (localTabs: FactoryTab[], remoteTabs: FactoryTab[]): TabMergeResult => {
  const usedIds = new Set(remoteTabs.map(tab => tab.id))
  const remoteNames = new Set(remoteTabs.map(tab => tab.name))
  // Renamed tabs must not collide with anything — remote names, other local names, or
  // names already assigned during this merge.
  const allNames = new Set([...remoteNames, ...localTabs.map(tab => tab.name)])

  const toPush: FactoryTab[] = localTabs.map(localTab => {
    const tab: FactoryTab = {
      ...localTab,
      id: usedIds.has(localTab.id) ? crypto.randomUUID() : localTab.id,
      // Only a collision with a REMOTE name forces a rename — local tabs sharing a name
      // with each other were already coexisting and stay as they are.
      name: remoteNames.has(localTab.name) ? deduplicateName(localTab.name, allNames) : localTab.name,
    }
    usedIds.add(tab.id)
    allNames.add(tab.name)
    return tab
  })

  return {
    tabs: [...remoteTabs, ...toPush],
    toPush,
  }
}

const deduplicateName = (name: string, usedNames: Set<string>): string => {
  let candidate = `${name} (local)`
  let attempt = 2
  while (usedNames.has(candidate)) {
    candidate = `${name} (local ${attempt})`
    attempt++
  }
  return candidate
}
