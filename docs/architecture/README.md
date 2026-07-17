# Architecture docs

Mental-model documentation of how Satisfactory Factories works, written to onboard both humans and AI agents. These complement (not replace) the repo-level `AGENTS.md` (setup, tech stack, workflows) and the existing docs in `/docs` (contributing, conventions, releases, loading sequence).

| Doc | What it covers |
|---|---|
| [overview.md](./overview.md) | What the app does, the monorepo layout, and the core domain concepts |
| [calculation-engine.md](./calculation-engine.md) | The `Factory` data model, the parts ledger, the recalculation pipeline, inter-factory dependencies, sync state, migrations |
| [frontend-and-data-flow.md](./frontend-and-data-flow.md) | Pinia stores, component hierarchy, event bus, game data loading, testing layout |
| [building-groups.md](./building-groups.md) | The building groups feature (overclocking, somersloops): data model, balancing rules, sync semantics, and current work-in-progress state |

Related, already existing:
- `docs/testing/building-groups-operations.md` — the exhaustive per-operation status sheet for building groups (operation refs like `BG-C-D-1` are used in test names).
- `docs/Loading.md` — the incremental factory-loading handshake.
