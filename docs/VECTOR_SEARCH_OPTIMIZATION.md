# Vector search selection optimization

The default AgentDBClient backend performs exact cosine scanning. It previously retained and sorted every candidate to return the top K. A stable bounded heap now retains K candidates and sorts only those winners. Equal scores preserve insertion order. This does not change the quantized search path or implement HNSW.

Selection cost changes from O(N log N) to O(N log K + K log K), with O(K) retained candidates instead of O(N). Cosine scoring still costs O(ND). Candidate objects are still created during scanning; this is not an allocation-free implementation.

## Reproduce

```sh
npm run build
npm test -- --runInBand
node tests/benchmarks/vector-top-k.cjs
```

Acceptance: exact identity and score equality against full stable sorting, including tied scores, insertion, update and deletion. Timings are informational, not CI thresholds.

## Observed results

Node 24.19.0, Linux x64, seeded vectors, K=10, eight warmups and 31 interleaved samples per implementation. Median milliseconds include cosine scoring and result selection, excluding cache lookup, model calls and initialization. The baseline uses the original push, sort and slice algorithm. Results vary with hardware and load.

| Vectors | Dimensions | Full sort ms | Bounded selection ms | Speedup |
| --- | --- | --- | --- | --- |
| 10,000 | 16 | 3.603 | 0.651 | 5.54x |
| 10,000 | 384 | 11.183 | 8.423 | 1.33x |
| 50,000 | 16 | 22.491 | 4.791 | 4.69x |

Raw measurements: `tests/benchmarks/vector-top-k.results.json`.

All 180 tests in 30 suites passed. TypeScript build passed. ESLint reported zero errors and 147 existing warnings. Both SVGs were parsed and statically rendered for visual inspection; CSS motion was not verified in GitHub's image proxy. The assets total 5,624 bytes and are included by the package file allowlist.

The ruOS clean install reported 60 dependency audit findings, including three critical findings. These are installer reports, not a vulnerability triage or proof of exploitability. Dependency remediation remains a separate release concern. Local npm 11 clean install rejected the existing optional MLflow lock entry; installation with `npm install --ignore-scripts --package-lock=false` succeeded without modifying the lockfile. The ruOS `npm ci --ignore-scripts` completed.
