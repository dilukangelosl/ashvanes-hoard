// Ashvane's Hoard: slot maths. Pure and seeded, so the game and the RTP simulator
// (tools/sim.mjs) run exactly the same code.
//
// 6x5 pay-anywhere grid, 8+ of a kind pays, winners tumble away. Every tumble win fills
// Ashvane's Wrath; when it is full and the cascade stops, the dragon burns 3-8 cells into
// wilds and the cascade goes on. Ember Coins carry x2-x500 and multiply the spin's win.
// 4+ Vault Keys open the Molten Treasury: 10 free spins where coins build a global multiplier.

export const COLS = 6, ROWS = 5, MIN_PAY = 8, WRATH_MAX = 8, MAX_WIN = 10000, BUY_COST = 100;
export const SYM = ['ruby', 'sapphire', 'amethyst', 'topaz', 'nib', 'morra', 'brakka', 'vex', 'key', 'coin', 'wild'];
export const KEY = 8, COIN = 9, WILD = 10;

// pays x bet for 8-9 / 10-11 / 12+ of a kind (before PAY_K)
export const PAYS = [
  [0.25, 0.75, 2], [0.4, 0.9, 4], [0.5, 1, 5], [0.8, 1.2, 8],
  [1, 1.5, 10], [1.5, 2, 12], [2, 5, 15], [2.5, 10, 25],
];
export const PAY_K = 0.27; // tuned by tools/sim.mjs
export const KEY_PAY = { 4: 3, 5: 5, 6: 100 };
export const FS_AWARD = 10, FS_RETRIGGER = 5, FS_WRATH = 2; // the dragon is restless in the Treasury

const W_BASE = [18, 17, 16, 15, 13, 11, 9, 7, 2.0, 0.38];
const W_FREE = [18, 17, 16, 15, 13, 11, 9, 7, 1.1, 2.8];
const COIN_V = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500];
const COIN_W = [30, 20, 14, 10, 7, 6, 5, 3, 2.5, 2, 1.2, 0.6, 0.25, 0.05, 0.02];

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, w) => { let x = r() * w.reduce((s, v) => s + v, 0); for (let i = 0; i < w.length; i++) if ((x -= w[i]) < 0) return i; return w.length - 1; };
const tier = (n) => (n >= 12 ? 2 : n >= 10 ? 1 : 0);
export const payOf = (s, n) => PAYS[s][tier(n)] * PAY_K;

function draw(r, free) {
  const s = pick(r, free ? W_FREE : W_BASE);
  return { s, v: s === COIN ? COIN_V[pick(r, COIN_W)] : 0 };
}
const clone = (g) => g.map((col) => col.map((c) => ({ ...c })));
const cells = (g, f) => { const out = []; g.forEach((col, c) => col.forEach((x, r) => f(x) && out.push([c, r]))); return out; };

function evaluate(g) {
  // wilds join only the cluster they make worth the most
  const wild = cells(g, (x) => x.s === WILD);
  const at = Array.from({ length: 8 }, (_, s) => cells(g, (x) => x.s === s));
  let best = -1, bestGain = 0;
  if (wild.length) for (let s = 0; s < 8; s++) {
    const n = at[s].length, w = n + wild.length;
    if (!n || w < MIN_PAY) continue;
    const gain = payOf(s, w) - (n >= MIN_PAY ? payOf(s, n) : 0);
    if (gain > bestGain) { bestGain = gain; best = s; }
  }
  const clusters = [];
  for (let s = 0; s < 8; s++) {
    const w = s === best ? wild : [], n = at[s].length + w.length;
    if (n >= MIN_PAY) clusters.push({ sym: s, n, cells: [...at[s], ...w], pay: payOf(s, n) });
  }
  return clusters;
}

// remove cells, let survivors fall, refill from the top; `from[c][r]` = old row, or <0 for new
function tumble(r, g, gone, free) {
  const dead = new Set(gone.map(([c, rr]) => c * ROWS + rr));
  const from = [];
  const ng = g.map((col, c) => {
    const keep = [];
    col.forEach((x, rr) => { if (!dead.has(c * ROWS + rr)) keep.push([x, rr]); });
    const add = ROWS - keep.length;
    const fresh = Array.from({ length: add }, (_, i) => [draw(r, free), i - add]);
    const all = [...fresh, ...keep];
    from.push(all.map(([, f]) => f));
    return all.map(([x]) => x);
  });
  return { grid: ng, from };
}

/**
 * One paid (or free) spin with its whole cascade.
 * @param {() => number} r  seeded random
 * @param {{ free?: boolean, wrath?: number, gmult?: number, forceKeys?: boolean }} o
 * @returns {{ steps: object[], win: number, keys: number, wrath: number, gmult: number }}
 */
export function spin(r, { free = false, wrath = 0, gmult = 0, forceKeys = false } = {}) {
  let g = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => draw(r, free)));
  if (forceKeys) {
    const want = r() < 0.08 ? 5 : 4;
    let have = cells(g, (x) => x.s === KEY).length;
    while (have < want) { const c = Math.floor(r() * COLS), rr = Math.floor(r() * ROWS); if (g[c][rr].s !== KEY) { g[c][rr] = { s: KEY, v: 0 }; have++; } }
  }
  const steps = [{ t: 'drop', grid: clone(g), from: g.map((col) => col.map((_, rr) => rr - ROWS)) }];
  let win = 0;
  for (;;) {
    const cl = evaluate(g);
    if (cl.length) {
      const amount = cl.reduce((s, c) => s + c.pay, 0);
      win += amount;
      wrath = Math.min(WRATH_MAX, wrath + (free ? FS_WRATH : 1));
      steps.push({ t: 'win', clusters: cl, amount, total: win, wrath });
      const gone = cl.flatMap((c) => c.cells);
      const t = tumble(r, g, gone, free);
      g = t.grid;
      steps.push({ t: 'tumble', grid: clone(g), from: t.from, removed: gone });
      continue;
    }
    if (wrath >= WRATH_MAX) {
      const n = 3 + Math.floor(r() * 6);
      const open = cells(g, (x) => x.s < 8);
      const burnt = [];
      for (let i = 0; i < n && open.length; i++) burnt.push(open.splice(Math.floor(r() * open.length), 1)[0]);
      burnt.forEach(([c, rr]) => { g[c][rr] = { s: WILD, v: 0 }; });
      wrath = 0;
      steps.push({ t: 'fire', cells: burnt, grid: clone(g), wrath });
      continue;
    }
    break;
  }
  const coins = cells(g, (x) => x.s === COIN).map(([c, rr]) => ({ c, r: rr, v: g[c][rr].v }));
  const sum = coins.reduce((s, x) => s + x.v, 0);
  if (free && sum) gmult += sum;
  // base: this spin's coins multiply; free spins: the global multiplier hits every winning spin
  const m = free ? gmult : sum;
  if (win > 0 && m > 1) {
    const before = win;
    win *= m;
    steps.push({ t: 'mult', coins, sum, mult: m, before, win, gmult });
  }
  const keys = cells(g, (x) => x.s === KEY).length;
  let award = 0;
  if (!free && keys >= 4) { award = FS_AWARD; const kp = KEY_PAY[Math.min(6, keys)]; win += kp; steps.push({ t: 'keys', n: keys, pay: kp, spins: award, cells: cells(g, (x) => x.s === KEY) }); }
  if (free && keys >= 3) { award = FS_RETRIGGER; steps.push({ t: 'keys', n: keys, pay: 0, spins: award, cells: cells(g, (x) => x.s === KEY) }); }
  return { steps, win, keys, award, wrath, gmult };
}

/**
 * A whole round: the base (or bought) spin plus any free spins it opens, capped at MAX_WIN.
 * Wins are in multiples of the bet.
 */
export function round(r, { wrath = 0, buy = false } = {}) {
  const base = spin(r, { wrath, forceKeys: buy });
  let total = base.win, left = base.award, gmult = 0;
  wrath = base.wrath;
  const fs = [];
  let fw = 0;
  while (left > 0 && total < MAX_WIN) {
    left--;
    const s = spin(r, { free: true, wrath, gmult });
    wrath = s.wrath; gmult = s.gmult; left += s.award;
    total += s.win; fw += s.win;
    fs.push(s);
  }
  const capped = total >= MAX_WIN;
  if (capped) total = MAX_WIN;
  return { base, fs, total, fsWin: fw, capped, wrath };
}
