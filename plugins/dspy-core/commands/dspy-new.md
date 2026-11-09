---
description: Scaffold a new DSPy.ts program — a typed Signature wrapped in a module (Predict / ChainOfThought / ReAct / Retrieve) and a metric stub.
argument-hint: "<program-name> [signature: in1,in2 -> out1,out2] [module: predict|cot|react|retrieve]"
---
You are scaffolding a DSPy.ts program. Parse `$ARGUMENTS` for a name, an optional `in -> out` signature, and an optional module type (default `cot`).

1. Read the repo's `package.json` to confirm `dspy.ts` is a dependency (suggest `npm i dspy.ts` if not).
2. Create `src/dspy/<name>.ts`:
   - import the right module + `configureLM` from `'dspy.ts'`
   - define a `Signature` (inputs/outputs from the parsed spec, each `{ name, type, required: true }`)
   - instantiate the module with a `promptTemplate`
   - export the module and a `metric(input, output, gold?) => number` stub
3. Create `src/dspy/<name>.spec.ts` — a Jest/Vitest test that `configureLM(new DummyLM())`, runs the module, asserts the output shape.
4. Print next steps: configure a real LM, write the metric, then `/dspy-compile <name>`.

Keep it minimal and idiomatic — match the surrounding code style.
