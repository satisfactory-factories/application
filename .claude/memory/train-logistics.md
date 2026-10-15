---
name: train-logistics
description: "Per-export transport method and train stations in the export manager; where the data lives, the throughput model, and decisions already taken"
metadata:
  node_type: memory
  type: project
  volatility: normal
  lastVerified: 2026-10-15
  originSessionId: b4985a59-6be8-4e76-92d8-9bd9e5e0bc7f
  modified: 2026-10-14T23:22:53.765Z
---

Prototyped on `claude/project-thread-2f0xag` (issue #802). The export calculator became an
export manager: one transport method per export, picked from tabs, and a Train tab for the route
from a loading station at the exporter to a receiving station at the importer.

**Where it lives.** The method is `exportCalculator[part].factorySettings[consumerId].method` on
the sending factory; absent means unset, and a guess from an old calculator time is shown but
never written. Stations are `Factory.trainStations` on the factory they are built at, at both ends
of a route. A train is kept on the station it loads at and names the receiving station it unloads
at (`destination`); each car carries a part from the loading factory, never another factory's.
The export's Train tab edits the route; the receiving factory's Imports shows a Train stations
panel with every arriving train, read-only. Station and train names go through the text rules.

**The model** (`utils/factory-management/train-logistics.ts`): each dock stops the whole station's
belts for 27.08s, so a platform clears `belts x speed x (1 - lock share)` unless buffered. A
station's ceiling depends on its belts and the item's stack size, never the round trip; the round
trip only sets how many trains reach it, and past the best whole number another train makes it
slower. An export spread over several cars fills them evenly.

**Decided with the user:** the planner never creates a station; a train unloads at one factory;
no platform groups (balancing is the player's call); guesses stay amber until confirmed; stations
exist at both ends of a route (an early version put all stations on the receiving factory and let
cars pick any import, which read as nonsense); new trains copy the first train's round trip.

**Not yet done:** fluid platforms use pipe speeds only roughly; the fluid freight car is still
1,600 m3 (the wiki says 2,400 since 1.2, unconfirmed in game); no feature-usage metric; drones and
trucks only get the method tab, not stations.
