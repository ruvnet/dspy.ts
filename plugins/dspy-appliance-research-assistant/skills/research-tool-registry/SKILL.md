---
name: research-tool-registry
version: "0.1.0"
author: rUv
tags: [dspy, appliance, research-assistant, react, tools, tool-use]
description: >
  How to wire the search / fetch / note tool registry for the DSPy.ts research-assistant appliance — backend choices, the note-as-bridge pattern, error handling, and the ReAct step budget — so the agent gathers good evidence the synthesizer can cite.
  Use when: implementing or debugging the tools of a research-assistant (`/research-init`, `/research-ask`).
---
# The research tool registry

The appliance's `ReAct` gatherer has three tools. The synthesizer downstream only sees what the gatherer **noted** — so the registry's job is: find evidence → read it → record it with its source.

## The three tools
- **`search(query)`** — full-text search over your corpus / the web. Returns ~5 snippets with **source ids**. Wire this to: a web search API, your doc corpus, an `AgentDBClient` retriever (`dspy-rag`'s `RetrieveModule`), an internal search API. The description must tell the model what it searches and when *not* to use it (not for arithmetic; not for reading a known source).
- **`fetch(source)`** — full text of a known source id from a prior `search`. Wire to: an HTTP fetch, a doc-store get, `AgentDBClient.searchText`. The agent should `fetch` before citing past a snippet.
- **`note(source, text)`** — the bridge. Records `{ id, source, text }` to a per-run scratchpad; the gatherer's `evidence` output is the concatenation of notes. **Every fact the agent intends to use in the answer must be noted with its source.** Don't change this contract — the synthesizer's groundedness metric checks citations against the noted evidence.

## Mechanics
- **Handlers must not throw.** An exception becomes the observation; the agent then reasons about a stack trace. Catch; return a short, actionable string ("error: `query` is required", "fetch failed: doc:42 not found").
- **Observations terse and parseable.** The whole observation goes back into context every step. Return the snippet/answer, not a giant JSON payload; truncate/summarise.
- **Stable, semantic source ids** — `doc:42`, `https://...`, `kb/security#reset`. The citation only works if the id the agent saw in `search` is the id it `note`s and the id the synthesizer can verify.
- **Idempotent search/fetch** — ReAct may retry. `note` is append-only and that's fine.
- **Step budget** — `maxSteps` 6–10. Research is iterative (search → fetch → note, a few times). If it routinely hits the cap without enough notes, the tools are returning junk or the thought prompt doesn't explain the task — read a `/research-ask` trace; don't just raise the cap.

## Reflexion interaction
`ReActReflexion` recalls *lessons* (e.g. "for questions about X, search for Y first") and promotes *search strategies* (recurring successful tool sequences) into skills — injected into the thought prompt before the loop. Use a `taskKey` scoped to the research-task *type*, not the individual question, so lessons generalise. (See `dspy-react`'s `reflexion-loop` skill.)
