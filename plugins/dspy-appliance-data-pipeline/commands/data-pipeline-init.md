---
description: Scaffold the DSPy.ts data-pipeline appliance into your repo — copy the program template to src/dspy/data-pipeline.ts (+ spec), with typed PredictModules in a Pipeline (clean → classify → extract), a CSV/JSONL loader, a row metric, and a BootstrapFewShot tuning helper.
argument-hint: "[--dest src/dspy/data-pipeline.ts] [--labels billing,bug,feature_request,how_to,other] [--raw-field raw] [--stages clean,classify,extract]"
---
Set up the data-pipeline appliance. Parse `$ARGUMENTS` for `--dest` (default `src/dspy/data-pipeline.ts`), `--labels` (the fixed classification label set; rewrite `LABELS` in the template), `--raw-field` (the input column name, default `raw`), `--stages` (which stages to keep — default all three; drop `extract` for pure classification, add your own).

1. Confirm `dspy.ts` is a dependency.
2. Copy `${CLAUDE_PLUGIN_ROOT}/templates/data-pipeline.ts` → `--dest` (+ `data-pipeline.spec.ts`). Rewrite `LABELS`, `--raw-field`, and trim/extend the `Pipeline` stages per `--stages`.
3. Adjust each stage's `Signature` to your schema (input/output field names + types — keep them semantic; one output per thing you'll score), and its `promptTemplate`.
4. Print next steps: prepare a batch file (`data.csv` with a `--raw-field` column, or `.jsonl`); `/data-pipeline-run data.csv` to process it; for tuning, label a sample (`label` column = the gold class) → `/data-pipeline-tune labeled.csv`.
