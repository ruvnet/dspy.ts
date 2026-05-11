---
name: tool-design
version: "0.1.0"
author: rUv
tags: [dspy, react, tools, agent, tool-use]
description: >
  How to design the tool registry for a DSPy.ts ReAct agent — names, descriptions, argument shapes, error handling — so the model picks the right tool and recovers from failures.
  Use when: writing or debugging the tools of a ReAct program (`/dspy-react-new`, `/dspy-react-run`).
---
# Tool design for ReAct

In `dspy.ts`, a ReAct tool is `{ name, description, handler: async (args) => observation }`. The model never sees your code — only `name` + `description`. Treat the description as the API doc the model reads at every step.

## Rules of thumb
- **The description must answer three things:** *what does it do*, *what args does it take* (names + types + an example), and *when to use it vs the other tools*. "Searches the web" is useless; "search(query: string) — full-text web search; returns the top 5 result snippets. Use for current facts you don't know. Not for arithmetic (use `calc`) or for reading a known URL (use `fetch`)." is usable.
- **Keep the set small (3–6).** Every extra tool is another thing the model can pick wrong. If two tools overlap, merge them or sharpen the "when to use" boundary.
- **Name tools for the action**, lowercase, verb-ish: `search`, `calc`, `fetch_url`, `lookup_order`. Not `tool1`, not `WebSearchAPIv2`.
- **Args: flat and named.** A single object with a couple of clearly-named fields beats positional or deeply nested args. Validate inside the handler; on bad args, return an observation that says what was wrong ("error: `query` is required") — don't throw.
- **Handlers must not crash the loop.** A thrown error becomes the observation; the agent then has to reason about a stack trace. Catch, and return a short, actionable string instead ("error: order #123 not found — check the id").
- **Make observations terse and parseable.** The whole observation goes back into the context every step. Return the answer, not a 5KB JSON blob; truncate, summarise, or paginate.
- **Idempotent / read-only where possible.** ReAct may call a tool more than once (retry, re-check). Side-effectful tools (sending mail, writing data) should be obviously named and ideally require a confirmation arg.

## Step budget
`maxSteps` 4–8. If the agent regularly hits the cap, don't raise it — the tools are ambiguous or the thought prompt doesn't explain the task. Read a `/dspy-react-run` trace: the step where it picked the wrong tool tells you which description to fix.
