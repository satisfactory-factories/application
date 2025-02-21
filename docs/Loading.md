# Loading process

Our loading process is rather complex as we have to load factories incrementally in order to avoid massive performance issues.

This is the order of how things are loaded based on context:

## Refresh / Page load

1. The app is initalized, the Loading.vue component is mounted
2. **Loader.vue**: As part of the mount, a v-dialog is shown. Once this dialog is shown, it emits an event called `afterEnter`. When that is handled, `readyForLoad` emits via the `eventBus`.
3. **app-store.vue**: The `readyForLoad` event is listened for and the `prepareLoader` method is called.
4. **app-store.vue**: `getFactories()` is called, which also calls `initFactories()` in order to ensure the data is valid, migrated and correct.
5. **app-store.vue**: `prepareLoader` then actually begins. This function wipes the current factory data (which clears the planner) and then calls `loadFactoriesIncrementally()`.
6. **app-store.vue**: `loadFactoriesIncrementally` pushes each factory to each 


## Loading Sequence Diagram

![Loading Sequence Diagram](./loading-sequence-diagram.png)

https://sequencediagram.org/

```text
title Loading Process

actor user
participant loader
control eventBus
participant appStore
participant planner
participant factoryList
==User loads page / opens share / sets template==
note over appStore:Boots, runs\ninitFactories()\ncalculateFactories()
==App loaded, events registered==
note over loader: v-overlay loads
loader--#green>loader: v-overlay emits afterEnter
loader--#green>eventBus:emit(readyForData)
eventBus--#red>appStore:receives readyForData
appStore--#green>eventBus:emit(prepareForLoad, facCount)
eventBus--#red>loader:receives prepareForLoad
eventBus--#red>planner:receives prepareForLoad
eventBus--#red>factoryList:receives prepareForLoad
note over loader:Updates factory total
note over planner,factoryList:Planner and list wiped\nPlanner shows placeholders
abox left of appStore: beginLoading
activate appStore
activate eventBus
activate loader
activate factoryList
abox right of appStore: loadNextFactory
note over appStore:Factory added to data
appStore--#orange>factoryList:Vue reactivity calls
note over factoryList:Renders factory\nin the list
appStore--#green>eventBus:emit(incrementLoad, increment)
eventBus--#red>loader:receives (incrementLoad, increment)
note over loader:Dialog updates progress
note over appStore: 50ms delay
appStore->appStore:loadNextFactory
deactivate appStore
deactivate eventBus
deactivate loader
deactivate factoryList
note over appStore:Loading complete
appStore--#green>eventBus: emits(incrementLoad, render)
eventBus--#red>loader:receives (incrementLoad, render)
note over loader:Dialog shows "Rendering"
note over appStore: 100ms delay
appStore--#green>eventBus:emit(loadingCompleted)
eventBus--#red>planner:receives loadingCompleted
eventBus--#red>loader:receives loadingCompleted
note over planner: Renders plan
==DOM Renders plan, "massive" delay==
note over loader:Dialog hides after\nDOM catches up
==User sees results==
```
