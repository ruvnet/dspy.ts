---
description: Scaffold the DSPy.ts code-review appliance into your repo — copy the program template to src/dspy/code-reviewer.ts (+ spec), build the AgentDB repo-context index (conventions, representative modules, ADRs, prior reviews), and print next steps.
argument-hint: "[--dest src/dspy/code-reviewer.ts] [--context .dspy/review-context] [--include 'src/**/*.ts,docs/adr/**,CONVENTIONS.md'] [--prior-reviews path/to/reviews.json]"
---
Set up the code-review appliance. Parse `$ARGUMENTS` for `--dest` (default `src/dspy/code-reviewer.ts`), `--context` (AgentDB index path, default `.dspy/review-context`), `--include` (globs of repo material to index: conventions docs, ADRs, a sample of representative modules), `--prior-reviews` (a JSON of past PR review comments to index — optional but high value).

1. Confirm `dspy.ts` is a dependency.
2. Copy `${CLAUDE_PLUGIN_ROOT}/templates/code-reviewer.ts` → `--dest` (+ `code-reviewer.spec.ts`); rewrite `CONTEXT_PATH` to `--context`.
3. `const ctx = new AgentDBClient({ vectorDimension: 384, storage: { path: contextPath } }); await ctx.init();`
4. Index the `--include` material: chunk each file (keep `{ source, kind: 'convention'|'adr'|'code'|'review' }` metadata), `ctx.storeText(chunk, meta, { tier: 'long' })`. Index `--prior-reviews` too (`kind: 'review'`) — past reviews teach the reviewer what this team flags. Don't index the whole repo — a representative sample of conventions + patterns + reviews is what helps; bulk source just dilutes retrieval.
5. Print next steps: `git diff` then `/code-review-run` on it; build `tune/reviews.json` (`[{ input:{diff, intent?}, output:{knownIssues:[{severity, near}], verdict} }]` from labelled past PRs); then `/code-review-tune tune/reviews.json`.
