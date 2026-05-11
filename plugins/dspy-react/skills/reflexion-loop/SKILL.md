---
name: reflexion-loop
version: "0.1.0"
author: rUv
tags: [dspy, react, reflexion, agentdb, skill-library, learning]
description: >
  How DSPy.ts ReActReflexion makes a ReAct agent learn — recall lessons before acting, record episodes after, promote recurring successful action sequences into skills — all backed by AgentDB.
  Use when: wiring reflexion into a ReAct agent, or deciding `recallK` / `skillThreshold` / the store layout.
---
# The reflexion loop

`ReActReflexion({ store, recallK, skillThreshold })` wraps a `ReAct` agent with memory. The store is an `AgentDBClient` (use a persistent `storage.path`).

## What happens on `run(input)`
1. **Recall** — `recall(taskKey)` vector-searches the store for prior `react-reflexion` (lessons) and `react-skill` (promoted sequences) records for this `taskKey`, returns `{ lessons, skills }`. `buildThoughtPrompt` injects `priorLessons` so the agent starts with hindsight.
2. **Act** — the normal thought → action → observation loop, up to `maxSteps`.
3. **Record** — `recordEpisode(taskKey, { success, steps, critique })`:
   - on **failure** (`reachedAnswer === false`, i.e. the answer came from the fallback) with a critique → a `react-reflexion` record (the lesson) is stored.
   - on **success** → the step sequence is counted; once a given sequence has been seen ≥ `skillThreshold` times, it's promoted to a `react-skill` record (a reusable plan).

## Knobs
- **`taskKey`** — the scope of learning. Use a stable key per task *type* (e.g. `"answer-support-question"`), not per individual input — you want lessons to generalise across instances, not pile up per question. Different keys never share lessons.
- **`recallK`** (default ~3) — how many lessons/skills to inject. Too many bloats the prompt and drowns the current task; 2–4 is plenty.
- **`skillThreshold`** (default ~3) — how often a sequence must succeed before it's a "skill". Lower ⇒ faster skill formation but more noise; higher ⇒ only robust patterns.
- **Store growth** — `getStats()` / `tierCounts()` to watch size; HNSW + `quantization: 'rabitq'` (`coarseThenRerank`) keep recall fast on big stores; `promote`/`evictTier` to manage tiers (keep hot lessons in `working`, age out stale ones from `short`).

## Inspecting
`/dspy-reflexion <store-path>` shows lessons (`lessonsText`/`recall`), promoted skills (`getSkills`), and episode history. Run `/dspy-react-run` a few times on a hard task and watch lessons appear, then a skill once the agent finds a sequence that keeps working.

## Caution
Reflexion is only as good as the `success` signal. If a "successful" run is actually wrong (weak metric / no metric), you'll promote bad skills. Make `success` mean *correct*, not *finished*.
