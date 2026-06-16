---
name: signature-design
version: "0.1.0"
author: rUv
tags: [dspy, signature, schema]
description: >
  How to design good DSPy.ts Signatures — typed input/output specs that modules and optimizers build prompts from.
  Use when: defining or refactoring a DSPy.ts module's signature.
---
# Signature Design

A `Signature` is `{ inputs: FieldDefinition[], outputs: FieldDefinition[] }`, each field `{ name, type: 'string'|'number'|'boolean'|'object', required?, description? }`.

## Rules of thumb
- **One output per thing you'll score.** If the metric checks an answer *and* a confidence, make them two outputs — don't bury both in one string.
- **Names are part of the prompt.** `inputs: [{ name: 'question' }]` → the module renders `question: ...`. Pick names the model will understand (`context`, `evidence`, `claim`, not `x1`).
- **`description` is documentation for the model.** Use it to constrain (`"the answer, in <= 5 words"`).
- **Types are validated at runtime** (`Module.validateInput/validateOutput`). `object` covers arrays. ReAct adds `reasoning: string` and `steps: object[]` automatically.
- **Keep it small.** A 12-field signature optimizes badly. Split into a `Pipeline` of focused modules instead.

## Examples
```ts
// QA
{ inputs: [{ name: 'question', type: 'string', required: true }],
  outputs: [{ name: 'answer', type: 'string', required: true }] }
// RAG step (fed by RetrieveModule's `context`)
{ inputs: [{ name: 'question', type: 'string', required: true }, { name: 'context', type: 'string', required: true }],
  outputs: [{ name: 'answer', type: 'string', required: true }, { name: 'citations', type: 'object', required: false }] }
```
