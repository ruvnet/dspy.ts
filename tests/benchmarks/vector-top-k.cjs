/* Run npm run build, then node tests/benchmarks/vector-top-k.cjs. No model or network. */
const { topK } = require('../../dist/utils/top-k');
const { AgentDBClient } = require('../../dist/memory/agentdb/client');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
let seed = 42;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
const median = a => [...a].sort((a,b) => a-b)[Math.floor(a.length/2)];
const results = [];
for (const [n, dimensions] of [[10000,16], [10000,384], [50000,16]]) {
 const vectors = Array.from({length:n}, () => Array.from({length:dimensions}, random));
 const query = Array.from({length:dimensions}, random);
 function* candidates() {
  for (let id=0; id<n; id++) {
   const score = AgentDBClient.cosineSimilarity(query, vectors[id]);
   yield {id,score,distance:1-score,vector:vectors[id],metadata:{}};
  }
 }
 const compare = (a,b) => b.score-a.score;
 const before = () => {
  const out = [];
  for (let id=0; id<n; id++) {
   const score = AgentDBClient.cosineSimilarity(query, vectors[id]);
   out.push({id,score,distance:1-score,vector:vectors[id],metadata:{}});
  }
  return out.sort(compare).slice(0,10);
 };
 const after = () => topK(candidates(),10,compare);
 assert.deepEqual(after(),before());
 for (let i=0;i<8;i++){before();after();}
 const a=[], b=[];
 const time = (fn, list) => {const start=performance.now();fn();list.push(performance.now()-start);};
 for(let i=0;i<31;i++) {
  if(i%2){time(after,b);time(before,a);}else{time(before,a);time(after,b);}
 }
 results.push({n,dimensions,k:10,beforeMedianMs:median(a),afterMedianMs:median(b),speedup:median(a)/median(b),identicalResults:true});
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,benchmark:'cosine scan + result selection; excludes cache, initialization and model calls',results},null,2));
