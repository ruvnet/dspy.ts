---
description: Run the code-review appliance on a diff or file — retrieves relevant repo context (conventions, related code, prior reviews), produces a structured review (severity-tagged, located findings + suggested fixes), and prints it.
argument-hint: "<diff-or-file> [--intent \"PR title/description\"] [--program src/dspy/code-reviewer.ts] [--severity-min nit|minor|major|blocker] [--show-context]"
---
Review a change. Parse `$ARGUMENTS` for the target (a path to a `.diff`/`.patch`, a source file, or `-` to read a diff from stdin / `git diff`), `--intent` (what the change is meant to do), `--program`, `--severity-min` (filter findings), `--show-context`.

1. Obtain the diff (read the file, or `git diff` if `-`).
2. `const rev = await buildCodeReviewer();` (from the appliance module) — `RetrieveModule → ChainOfThought`.
3. `const out = await rev.run({ diff, intent });`
4. Print: the **summary** (ship / changes-needed / blocked + why); the **findings** grouped by severity — each `location · issue · suggestion` (filter by `--severity-min`); the **questions** for the author; and the **passages** that informed it (rank · score · source · kind). With `--show-context`, the assembled context.
5. If findings are vague ("consider refactoring") or it flags things that aren't actually project conventions: that's what `/code-review-tune` fixes (the metric rewards specific, located, convention-cited findings and penalises noise). If it misses obvious issues: index more representative code / prior reviews into the context.
