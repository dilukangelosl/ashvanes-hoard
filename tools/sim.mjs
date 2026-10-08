// RTP simulator: node tools/sim.mjs [rounds] [buyRounds]
import { round, rng, BUY_COST, MAX_WIN } from '../src/engine.js';

const N = +(process.argv[2] ?? 2e6), NB = +(process.argv[3] ?? 2e5);
const r = rng(12345);
let paid = 0, won = 0, hits = 0, fsN = 0, fsWon = 0, fires = 0, max = 0, caps = 0, wrath = 0;
for (let i = 0; i < N; i++) {
  const o = round(r, { wrath });
  wrath = o.wrath; paid += 1; won += o.total;
  if (o.total > 0) hits++;
  if (o.fs.length) { fsN++; fsWon += o.total; }
  fires += o.base.steps.filter((s) => s.t === 'fire').length;
  if (o.capped) caps++;
  max = Math.max(max, o.total);
}
let bWon = 0, bMax = 0;
for (let i = 0; i < NB; i++) { const o = round(r, { buy: true }); bWon += o.total; bMax = Math.max(bMax, o.total); }
const pct = (x) => (100 * x).toFixed(2) + '%';
console.log(`base rounds ${N}: RTP ${pct(won / paid)}  hit ${pct(hits / N)}  FS 1 in ${(N / fsN).toFixed(0)} (FS share ${pct(fsWon / won)}, avg ${(fsWon / fsN).toFixed(1)}x)`);
console.log(`dragonfire 1 in ${(N / fires).toFixed(1)} spins  max ${max.toFixed(1)}x  capped ${caps} (cap ${MAX_WIN}x)`);
console.log(`bonus buy ${NB}: RTP ${pct(bWon / NB / BUY_COST)}  avg ${(bWon / NB).toFixed(1)}x  max ${bMax.toFixed(1)}x`);
