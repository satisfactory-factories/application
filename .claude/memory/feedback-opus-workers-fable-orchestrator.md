---
name: feedback-opus-workers-fable-orchestrator
description: Subagents must run on Opus; Fable is for orchestration only — pin model:'opus' on every agent() call
metadata:
  type: feedback
  volatility: durable
  lastVerified: 2026-09-01
---

Execution agents run on **Opus**; Fable's job is orchestration (planning, briefing,
reviewing reports, talking to the owner). This was the arrangement from the start of the
v0.7.0 effort and was re-stated as a correction on 2026-09-01 when workflow agents were
observed running as Fable.

**Why:** subagents inherit the session model unless a model is pinned, and the session
runs Fable. So an unpinned `agent()` in a Workflow script (or an `Agent` call without
`model`) silently promotes the worker to Fable. Nothing errors; the only tell is the
`"model"` field in the workflow progress output.

**How to apply:** pass `model: 'opus'` in the opts of every `agent()` call in a Workflow
script, and on `Agent` tool calls that execute work. Raising `effort` for hard
verify/judge stages is fine; raising the model is not the way to do it. Related context
lives in [[project-sync-v7-rooms]].
