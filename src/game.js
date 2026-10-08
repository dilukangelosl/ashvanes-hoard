// Ashvane's Hoard: every symbol, the dragon, the crew and every effect below is a
// transparent video sprite (.opal), drawn by opal-sprites' own WebGL2 runtime.
// The DOM carries text and controls; a 2D canvas adds cheap particles on top.
import { createOpal } from 'https://cdn.jsdelivr.net/npm/opal-sprites@0.1.0/src/index.js';
import * as E from './engine.js';

const $ = (id) => document.getElementById(id);
const world = $('world'), cv = $('opal'), fxc = $('fx'), g2 = fxc.getContext('2d');
const QS = new URLSearchParams(location.search);
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------- layout (design units)
// cell = row height; cells are 1.129x wider so the grid fills the animated frame's opening
const CW = 1.085;
const LAYOUTS = {
  land: { name: 'land', W: 1600, H: 900, cell: 96, board: [487.5, 182], logo: [195, 92, 390], dragon: { h: 430, left: -14, feet: 772 }, wrath: [195, 196, 330],
    chest: [1415, 330, 430], fs: [1415, 470], buy: [1415, 560], braziers: [[1278, 788, 300], [1552, 788, 300]], bar: [0, 790, 1600, 110],
    story: 230, banner: 300, bigwin: 230, row: 600, crewSize: 230 },
};
// the frame clip's opening, as fractions of its video cell (measured with tools/measure_frame.py)
const HOLE = { x: 0.1574, y: 0.2481, w: 0.6869, h: 0.5463 };
// the dragon clips share one 16:9 canvas: dragon body height, left edge, feet and mouth as fractions of it
const DRAGON = { bodyH: 0.644, left: 0.05, feet: 0.92, mouth: [0.43, 0.415] };
// Portrait is laid out for the phone's real aspect: the bar and board hug the bottom and the
// space above (logo, dragon, chest) grows or shrinks with the screen.
function portrait(H) {
  const board = [131, H - 852], top = H - 1036, region = top, s = clamp(region / 616, 0.68, 1.45), ls = Math.min(1, s);
  const logoW = 540 * ls, logoY = 24 + 118 * ls;
  return { name: 'port', W: 900, H, cell: 98, board, logo: [450, logoY, logoW], wrath: [735, logoY + 104 * ls, 280],
    dragon: { h: clamp(400 * s, 270, 560), left: -16, feet: top + 50 }, chest: [728, top - 150 * s, 340 * Math.min(s, 1.25)],
    buy: [728, top - 150 * s + 150 * Math.min(s, 1.2)], braziers: [], bar: [0, H - 240, 900, 240],
    story: board[1] + 60, banner: board[1] + 110, bigwin: board[1] + 40, row: H - 430, crewSize: 170 };
}
let L = LAYOUTS.land;
const view = { k: 1, ox: 0, oy: 0, dpr: 1 };
const X = (x) => (view.ox + x * view.k) * view.dpr, Y = (y) => (view.oy + y * view.k) * view.dpr, PK = () => view.k * view.dpr;
const cellXY = (c, r) => [L.board[0] + (c + 0.5) * L.cell * CW, L.board[1] + (r + 0.5) * L.cell];
const place = (el, x, y, w, h) => Object.assign(el.style, { left: x + 'px', top: y + 'px', ...(w != null && { width: w + 'px' }), ...(h != null && { height: h + 'px' }) });

// ---------------------------------------------------------------- tweens (time scaled by turbo)
let T = 1;
const tweens = [];
const ease = {
  lin: (t) => t, out: (t) => 1 - (1 - t) ** 3, in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};
function tween(o, to, dur, e = ease.out, delay = 0) {
  return new Promise((res) => tweens.push({ o, to, from: null, d: Math.max(0.001, dur * T), t: -delay * T, e, res }));
}
const wait = (s) => tween({}, {}, s);
function stepTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i];
    if ((w.t += dt) < 0) continue;
    if (!w.from) { w.from = {}; for (const k in w.to) w.from[k] = w.o[k]; }
    const p = Math.min(1, w.t / w.d), v = w.e(p);
    for (const k in w.to) w.o[k] = w.from[k] + (w.to[k] - w.from[k]) * v;
    if (p >= 1) { tweens.splice(i, 1); w.res(); }
  }
}

// ---------------------------------------------------------------- opal sprites
let opal;
const A = {};
const sprites = new Set();
class Spr {
  // fit: 'cell' sizes by the whole video cell (consistent across clips of a file),
  //      'h' / 'w' by the visible box. mode: where (x, y) sits: 'center', 'feet', 'left'.
  constructor(asset, clip, { size = 100, x = 0, y = 0, fit = 'cell', mode = 'center', anchor } = {}) {
    Object.assign(this, { a: asset, clip, size, x, y, s: 1, op: 1, flip: 1 });
    const c = asset.clips[anchor ?? clip], [bx, by, bw, bh] = c.box;
    this.base = 1 / (fit === 'h' ? bh : fit === 'w' ? bw : c.width);
    this.ox = fit === 'cell' ? 0 : mode === 'left' ? bx - c.width / 2 : bx + bw / 2 - c.width / 2;
    this.oy = fit === 'cell' ? 0 : mode === 'feet' ? by + bh - c.height / 2 : by + bh / 2 - c.height / 2;
    this.cw = c.width; this.ch = c.height;
    this.id = opal.spawn(asset, clip, -9999, -9999, 0.001);
    sprites.add(this);
  }
  desync() { const c = this.a.clips[this.clip]; this.warp = Math.random() * (c.frames / this.a.fps); return this; }
  play(clip, speed = 1) { this.clip = clip; opal.play(this.a, this.id, clip); opal.speed(this.id, speed); return this; }
  get k() { return this.size * this.s * this.base; }
  point(u, v) { const k = this.k; return [this.x + ((u - 0.5) * this.cw - this.ox) * k * this.flip, this.y + ((v - 0.5) * this.ch - this.oy) * k]; }
  apply() {
    const k = this.k * PK();
    opal.set(this.id, X(this.x) - this.ox * k * this.flip, Y(this.y) - this.oy * k, k * this.flip, this.hidden ? 0 : clamp(this.op * (this.fade ? this.fade() : 1)));
  }
  kill() { if (this.dead) return; this.dead = true; opal.kill(this.id); sprites.delete(this); this.label?.remove(); }
}
// one-shot effect: pops in, plays once, fades over its last quarter, removes itself
function burst(clip, x, y, size, { speed = 1, s0 = 0.45 } = {}) {
  const f = new Spr(A.fx, clip, { size, x, y });
  f.s = s0; f.once = true; opal.speed(f.id, speed / Math.max(T, 0.5));
  f.fade = () => { const p = opal.progress(f.id); return p > 0.75 ? (1 - p) / 0.25 : 1; };
  tween(f, { s: 1 }, 0.2, ease.back);
  return f;
}

// symbols: [asset, clip, size in cells]
const SYMDEF = [
  ['sym', 'ruby', 1.3], ['sym', 'sapphire', 1.3], ['sym', 'amethyst', 1.3], ['sym', 'topaz', 1.3],
  ['crew', 'nib', 1.12], ['crew', 'morra', 1.12], ['crew', 'brakka', 1.12], ['crew', 'vex', 1.12],
  ['sym', 'key', 1.2], ['sym', 'coin', 1.22], ['sym', 'wild', 1.3],
];
const SYMCOL = ['#ff3048', '#3a8bff', '#b45cff', '#ffb02e', '#a3b86c', '#7fd0ff', '#c0c4cc', '#ff5a5a', '#ffd774', '#ffd774', '#ff6a1a'];
const NAMES = { nib: ['Nib', 'the pickpocket'], morra: ['Morra', 'the alchemist'], brakka: ['Brakka', 'the brute'], vex: ['Vex', 'the leader'] };
let grid = [];
function makeSym(cell, c, r) {
  const [a, clip, f] = SYMDEF[cell.s];
  const sp = new Spr(A[a], clip, { size: L.cell * f });
  [sp.x, sp.y] = cellXY(c, r);
  Object.assign(sp, { sym: cell.s, v: cell.v, sizeF: f });
  sp.fade = () => clamp(Math.min(sp.y - (L.board[1] - L.cell * 0.45), L.board[1] + L.cell * (E.ROWS + 0.45) - sp.y) / (L.cell * 0.9));
  sp.desync();
  if (cell.s === E.COIN) {
    sp.label = document.createElement('b');
    sp.label.textContent = '×' + cell.v;
    if (cell.v >= 50) sp.label.className = 'big';
    $('labels').append(sp.label);
  }
  return sp;
}

// ---------------------------------------------------------------- particles (2D canvas)
const parts = [];
function spark(x, y, n, color = '#ffb02e', speed = 420) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(0.3, 1) * speed;
    parts.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, g: 700, life: rand(0.35, 0.8), t: 0, size: rand(2, 4), color });
  }
}
function coins(n, x0 = L.W / 2, y0 = -40, spread = L.W) {
  for (let i = 0; i < n; i++) parts.push({ k: 'coin', x: x0 + rand(-spread / 2, spread / 2), y: y0 - rand(0, 300), vx: rand(-60, 60), vy: rand(100, 400), g: 900, life: 3, t: 0, size: rand(14, 24), spin: rand(4, 10) });
}
function fountain(x, y, n) {
  for (let i = 0; i < n; i++) parts.push({ k: 'coin', x, y, vx: rand(-420, 420), vy: rand(-1100, -600), g: 1500, life: 2.2, t: 0, size: rand(14, 24), spin: rand(4, 12) });
}
const ring = (x, y, r = 200, color = '#ffb02e') => parts.push({ k: 'ring', x, y, r, life: 0.6, t: 0, color });
let emberRate = 14;
function drawParts(dt) {
  g2.setTransform(1, 0, 0, 1, 0, 0);
  g2.clearRect(0, 0, fxc.width, fxc.height);
  for (let n = emberRate * dt; n > 0; n--) if (Math.random() < n) parts.push({ k: 'ember', x: rand(0, L.W), y: L.H + 10, vx: rand(-20, 20), vy: rand(-140, -60), g: 0, life: rand(3, 7), t: 0, size: rand(1.5, 3.5), ph: rand(0, 6) });
  const P = PK();
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t > p.life) { parts.splice(i, 1); continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const a = 1 - p.t / p.life, x = X(p.x), y = Y(p.y);
    if (p.k === 'ember') {
      g2.globalCompositeOperation = 'lighter';
      p.x += Math.sin(p.t * 2 + p.ph) * 0.4;
      g2.fillStyle = `rgba(255,${120 + 80 * a | 0},40,${a * 0.8})`;
      g2.beginPath(); g2.arc(x, y, p.size * P, 0, 7); g2.fill();
    } else if (p.k === 'spark') {
      g2.globalCompositeOperation = 'lighter';
      g2.strokeStyle = p.color; g2.globalAlpha = a; g2.lineWidth = p.size * P;
      g2.beginPath(); g2.moveTo(x, y); g2.lineTo(x - p.vx * 0.04 * P, y - p.vy * 0.04 * P); g2.stroke(); g2.globalAlpha = 1;
    } else if (p.k === 'coin') {
      g2.globalCompositeOperation = 'source-over';
      const sx = Math.abs(Math.cos(p.t * p.spin)) * p.size * P + 1;
      g2.globalAlpha = Math.min(1, a * 3);
      g2.fillStyle = '#ffcf4a'; g2.strokeStyle = '#8a4a08'; g2.lineWidth = 2 * P;
      g2.beginPath(); g2.ellipse(x, y, sx, p.size * P, 0, 0, 7); g2.fill(); g2.stroke();
      g2.fillStyle = '#fff6c0'; g2.beginPath(); g2.ellipse(x - sx * 0.3, y - p.size * P * 0.3, sx * 0.25, p.size * P * 0.25, 0, 0, 7); g2.fill();
      g2.globalAlpha = 1;
    } else if (p.k === 'ring') {
      g2.globalCompositeOperation = 'lighter';
      g2.strokeStyle = p.color; g2.globalAlpha = a; g2.lineWidth = 10 * a * P;
      g2.beginPath(); g2.arc(x, y, p.r * (1 - a * a) * P, 0, 7); g2.stroke(); g2.globalAlpha = 1;
    }
  }
  g2.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- sound (synthesised, no files)
const AU = { c: null, out: null, on: true, music: null };
function ac() {
  if (!AU.c) {
    const c = new AudioContext(), g = c.createGain(), comp = c.createDynamicsCompressor();
    g.gain.value = 0.55; g.connect(comp).connect(c.destination);
    AU.c = c; AU.out = g;
  }
  return AU.c;
}
function tone(f, d, { type = 'sine', vol = 0.2, at = 0, f2 = f, a = 0.005 } = {}) {
  if (!AU.on) return;
  const c = ac(), t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + d);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(AU.out); o.start(t); o.stop(t + d + 0.02);
}
let nbuf;
function noise(d, { vol = 0.3, at = 0, f = 1200, f2 = f, q = 0.8, type = 'lowpass' } = {}) {
  if (!AU.on) return;
  const c = ac(), t = c.currentTime + at;
  nbuf ??= (() => { const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; return b; })();
  const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = nbuf; fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl).connect(g).connect(AU.out); s.start(t); s.stop(t + d);
}
const SFX = {
  click: () => tone(900, 0.05, { type: 'square', vol: 0.04 }),
  land: () => { tone(150, 0.12, { f2: 60, vol: 0.22 }); noise(0.07, { vol: 0.1, f: 900 }); },
  key: () => [1320, 1760, 2640].forEach((f, i) => tone(f, 0.6, { type: 'triangle', vol: 0.12, at: i * 0.08 })),
  win: (n = 1) => [523, 659, 784, 1047].slice(0, 2 + Math.min(2, n)).forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.13, at: i * 0.07 })),
  shatter: () => { noise(0.25, { vol: 0.22, f: 6000, f2: 1500, type: 'highpass' }); tone(2200, 0.15, { type: 'square', vol: 0.025, f2: 800 }); },
  coin: () => { tone(1568, 0.25, { type: 'square', vol: 0.045 }); tone(2093, 0.3, { type: 'square', vol: 0.045, at: 0.06 }); },
  roar: () => { noise(1.4, { vol: 0.6, f: 320, f2: 90, q: 3 }); tone(85, 1.3, { type: 'sawtooth', vol: 0.2, f2: 50, a: 0.12 }); tone(127, 1.1, { type: 'sawtooth', vol: 0.1, f2: 66, a: 0.12 }); },
  fire: () => noise(1.1, { vol: 0.4, f: 400, f2: 3000, type: 'bandpass', q: 0.7 }),
  boom: () => { tone(70, 0.7, { f2: 28, vol: 0.5 }); noise(0.6, { vol: 0.35, f: 600, f2: 80 }); },
  tick: () => tone(1100 + Math.random() * 500, 0.04, { type: 'square', vol: 0.025 }),
};
function music() {
  if (AU.music || !AU.on) return;
  const c = ac(), g = c.createGain(), lp = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
  g.gain.value = 0.05; lp.type = 'lowpass'; lp.frequency.value = 420;
  lfo.frequency.value = 0.07; lg.gain.value = 260; lfo.connect(lg).connect(lp.frequency); lfo.start();
  for (const f of [55, 55.4, 82.4, 110.3]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
  lp.connect(g).connect(AU.out);
  AU.music = { g, lp };
}
const musicMood = (hot) => AU.music && AU.music.lp.frequency.setTargetAtTime(hot ? 900 : 420, ac().currentTime, 0.8);

// ---------------------------------------------------------------- scene
let crew = [];
const scene = { braziers: [] };
let dragonBox = { left: 0, top: 0, w: 1, h: 1 };
const S = { bal: 1000, betI: 3, wrath: 0, busy: false, auto: 0, turbo: false, free: false, fsLeft: 0, gmult: 0, units: 0 };
const BETS = [0.2, 0.4, 0.6, 1, 2, 4, 6, 10, 20, 50, 100];
const bet = () => BETS[S.betI];
// ?seeds=1,2,3 replays exact rounds (demos, trailer); ?wrath=n preloads the meter
const FORCED = (QS.get('seeds') ?? '').split(',').filter(Boolean).map(Number);
S.wrath = clamp(+(QS.get('wrath') ?? 0), 0, E.WRATH_MAX - 1);

// A fixed game window, like casino lobbies: 16:9 letterboxed on desktop and landscape, and on
// portrait phones a window that fills the screen with a layout made for its exact aspect.
function resize() {
  const vw = innerWidth, vh = innerHeight;
  L = vw / vh < 0.9 ? portrait(clamp((900 * vh) / vw, 1450, 2000)) : LAYOUTS.land;
  document.body.classList.toggle('portrait', L.name === 'port');
  view.k = Math.min(vw / L.W, vh / L.H);
  const w = Math.round(L.W * view.k), h = Math.round(L.H * view.k);
  Object.assign(world.style, { width: w + 'px', height: h + 'px', left: Math.round((vw - w) / 2) + 'px', top: Math.round((vh - h) / 2) + 'px' });
  world.classList.toggle('fill', w >= vw - 2 && h >= vh - 2);
  view.ox = 0; view.oy = 0;
  view.dpr = Math.min(devicePixelRatio || 1, MOBILE ? 1.75 : 2);
  for (const c of [cv, fxc]) { c.width = Math.round(w * view.dpr); c.height = Math.round(h * view.dpr); }
  for (const id of ['under', 'top']) Object.assign($(id).style, { width: L.W + 'px', height: L.H + 'px', transform: `scale(${view.k})` });
  const bw = L.cell * CW * E.COLS, bh = L.cell * E.ROWS;
  place($('board'), L.board[0] - 8, L.board[1] - 8, bw + 16, bh + 16);
  $('cells').style.grid = `repeat(${E.ROWS}, 1fr) / repeat(${E.COLS}, 1fr)`;
  place($('wrath'), L.wrath[0] - L.wrath[2] / 2, L.wrath[1], L.wrath[2]);
  place($('fsInfo'), L.chest[0], L.chest[1] - 46);
  place($('buy'), ...L.buy);
  if ($('buyHit')) place($('buyHit'), L.chest[0] - L.chest[2] * 0.3, L.chest[1] - L.chest[2] * 0.3, L.chest[2] * 0.6, L.chest[2] * 0.6);
  place($('bar'), ...L.bar);
  $('story').style.top = L.story + 'px';
  $('banner').style.top = L.banner + 'px';
  $('bigwin').style.top = L.bigwin + 'px';
  seat();
}
// put every layout-anchored video sprite in place for the current orientation
function seat() {
  grid.forEach((col, c) => col.forEach((sp, r) => { if (sp) { [sp.x, sp.y] = cellXY(c, r); sp.size = L.cell * sp.sizeF; } }));
  const bw = L.cell * CW * E.COLS, bh = L.cell * E.ROWS;
  if (scene.frame) {
    const f = scene.frame, fw = bw / HOLE.w, fh = (fw * f.ch) / f.cw;
    Object.assign(f, { size: fw, x: L.board[0] + bw / 2 - (HOLE.x + HOLE.w / 2 - 0.5) * fw, y: L.board[1] + bh / 2 - (HOLE.y + HOLE.h / 2 - 0.5) * fh });
  }
  const d = L.dragon, h = d.h / DRAGON.bodyH, w = (h * 16) / 9;
  dragonBox = { w, h, left: d.left - DRAGON.left * w, top: d.feet - DRAGON.feet * h };
  for (const sp of [scene.dragon, scene.breath]) if (sp) Object.assign(sp, { size: w, x: dragonBox.left + w / 2, y: dragonBox.top + h / 2 });
  if (scene.logo) Object.assign(scene.logo, { size: L.logo[2] / 0.87, x: L.logo[0], y: L.logo[1] });
  for (const sp of [scene.chest, scene.orb]) if (sp) Object.assign(sp, { size: L.chest[2], x: L.chest[0], y: L.chest[1] });
  scene.braziers.forEach((sp, i) => { const b = L.braziers[i]; sp.hidden = !b; if (b) Object.assign(sp, { x: b[0], y: b[1], size: b[2] }); });
}
const mouth = () => [dragonBox.left + DRAGON.mouth[0] * dragonBox.w, dragonBox.top + DRAGON.mouth[1] * dragonBox.h];

const cellsEl = [];
function buildDom() {
  for (let r = 0; r < E.ROWS; r++) for (let c = 0; c < E.COLS; c++) { const i = document.createElement('i'); $('cells').append(i); cellsEl[r * E.COLS + c] = i; }
  for (let i = 0; i < E.WRATH_MAX; i++) $('pips').append(document.createElement('i'));
}
function setWrath(n) {
  [...$('pips').children].forEach((p, i) => p.classList.toggle('on', i < n));
  $('wrath').classList.toggle('full', n >= E.WRATH_MAX);
}
function hud() {
  $('bal').textContent = fmt(S.bal);
  $('bet').textContent = fmt(bet());
  $('buyCost').textContent = fmt(bet() * E.BUY_COST);
  $('autoN').textContent = S.auto ? S.auto : 'Auto';
  for (const id of ['betDown', 'betUp', 'buy']) $(id).disabled = S.busy;
  $('spin').disabled = S.busy && !S.auto;
  $('spin').classList.toggle('busy', S.busy);
}
function setWin(units, hit = false) {
  S.units = units;
  $('winAmt').textContent = fmt(units * bet());
  if (hit) { $('winAmt').classList.remove('hit'); void $('winAmt').offsetWidth; $('winAmt').classList.add('hit'); }
}
function pop(text, x, y, cls = '') {
  const b = document.createElement('b');
  b.textContent = text; b.className = cls;
  place(b, x, y);
  $('pops').append(b);
  setTimeout(() => b.remove(), 1400);
  return b;
}
async function fly(text, from, to) {
  const b = pop(text, ...from, 'fly');
  await new Promise((r) => requestAnimationFrame(r));
  place(b, ...to); b.style.opacity = 0;
  await wait(0.55);
}
async function banner(html, dur = 2.2) {
  const b = $('banner');
  b.innerHTML = html; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  b.style.animationDuration = dur * T + 's';
  await wait(dur * 0.55);
}
function shake() { world.classList.remove('shake'); void world.offsetWidth; world.classList.add('shake'); }
const scrim = (on, red = false) => { $('scrim').classList.toggle('on', on); $('scrim').classList.toggle('red', red); };
const dimGrid = (op, d = 0.3) => Promise.all(grid.flat().filter(Boolean).map((sp) => tween(sp, { op }, d)));
let breathing = null;
function roar() { if (!breathing) breathe(); }

// ---------------------------------------------------------------- spin steps
async function dropIn(step, free) {
  const old = grid.flat().filter(Boolean);
  if (old.length) {
    await Promise.all(old.map((sp) => tween(sp, { y: sp.y + L.cell * 6, op: 0 }, 0.32, ease.in, (E.COLS - 1 - Math.round((sp.x - L.board[0]) / (L.cell * CW))) * 0.025)));
    old.forEach((sp) => sp.kill());
  }
  grid = step.grid.map((col, c) => col.map((cell, r) => { const sp = makeSym(cell, c, r - E.ROWS - 0.3); return sp; }));
  // anticipation: once enough keys have landed, fire pillars rise over the remaining columns
  // and they crawl in one by one
  const need = free ? 2 : 3;
  let keys = 0, delay = 0, teaseAt = -1;
  const lands = [];
  for (let c = 0; c < E.COLS; c++) {
    const colDelay = delay, slow = teaseAt >= 0;
    lands.push(Promise.all(grid[c].map((sp, r) => tween(sp, { y: cellXY(c, r)[1] }, slow ? 0.5 : 0.36, ease.back, colDelay + (E.ROWS - 1 - r) * 0.035))).then(() => {
      SFX.land();
      grid[c].forEach((sp, r) => { if (sp.sym === E.KEY) { SFX.key(); ring(...cellXY(c, r), L.cell * 0.7, '#ffd774'); burst('magic', ...cellXY(c, r), L.cell * 1.3); tween(sp, { s: 1.3 }, 0.12).then(() => tween(sp, { s: 1 }, 0.25)); } });
    }));
    keys += step.grid[c].filter((x) => x.s === E.KEY).length;
    delay += 0.07;
    if (keys >= need && c < E.COLS - 1 && teaseAt < 0) { teaseAt = c; delay += 0.5; }
    else if (teaseAt >= 0) delay += 0.85;
  }
  if (teaseAt >= 0) {
    lands[teaseAt].then(() => {
      SFX.fire(); shake();
      $('banner').innerHTML = ''; banner(free ? 'One more key…' : 'The vault stirs…', 1.6);
      for (let c = teaseAt + 1; c < E.COLS; c++) {
        const [x] = cellXY(c, 2), y = L.board[1] + (L.cell * E.ROWS) / 2;
        const p = new Spr(A.pillar, 'pillar', { fit: 'h', size: L.cell * E.ROWS * 1.25, x, y }).desync();
        p.op = 0; tween(p, { op: 1 }, 0.25);
        cellsEl.forEach((el, i) => i % E.COLS === c && el.classList.add('hot'));
        lands[c].then(() => { tween(p, { op: 0, s: 1.3 }, 0.35).then(() => p.kill()); cellsEl.forEach((el, i) => i % E.COLS === c && el.classList.remove('hot')); });
      }
    });
  }
  await Promise.all(lands);
  cellsEl.forEach((el) => el.classList.remove('hot'));
}

async function showWin(step) {
  const cells = step.clusters.flatMap((cl) => cl.cells);
  const win = new Set(cells.map(([c, r]) => grid[c][r]));
  grid.flat().forEach((sp) => sp && !win.has(sp) && tween(sp, { op: 0.32 }, 0.2));
  cells.forEach(([c, r]) => cellsEl[r * E.COLS + c].classList.add('hot'));
  SFX.win(step.clusters.length);
  // a burning frame around every winning cell
  const frames = cells.map(([c, r]) => { const f = new Spr(A.wf, 'winframe', { size: L.cell * CW * 1.32 }).desync(); [f.x, f.y] = cellXY(c, r); f.op = 0; f.s = 0.7; tween(f, { op: 1, s: 1 }, 0.2, ease.back); return f; });
  for (const sp of win) tween(sp, { s: 1.16 }, 0.14).then(() => tween(sp, { s: 1 }, 0.18)).then(() => tween(sp, { s: 1.12 }, 0.14)).then(() => tween(sp, { s: 1 }, 0.18));
  for (const cl of step.clusters) {
    const cx = cl.cells.reduce((s, [c]) => s + c, 0) / cl.cells.length, cy = cl.cells.reduce((s, [, r]) => s + r, 0) / cl.cells.length;
    pop(fmt(cl.pay * bet()), ...cellXY(cx, cy));
  }
  setWin(S.spinBase + step.total, true);
  setWrath(step.wrath);
  await wait(0.75);
  SFX.shatter();
  frames.forEach((f) => tween(f, { op: 0, s: 1.25 }, 0.25).then(() => f.kill()));
  cells.forEach(([c, r], i) => {
    const sp = grid[c][r];
    if (!sp) return;
    grid[c][r] = null;
    const [x, y] = cellXY(c, r);
    if (i % 2 === 0 || cells.length < 14) burst('shatter', x, y, L.cell * 1.7, { speed: 1.4 });
    spark(x, y, 6, SYMCOL[sp.sym]);
    tween(sp, { s: 0.2, op: 0 }, 0.16, ease.in).then(() => sp.kill());
  });
  cellsEl.forEach((el) => el.classList.remove('hot'));
  grid.flat().forEach((sp) => sp && tween(sp, { op: 1 }, 0.2));
  await wait(0.3);
}

async function tumble(step) {
  const ng = step.from.map((col, c) => col.map((f, r) => (f >= 0 ? grid[c][f] : makeSym(step.grid[c][r], c, f - 0.3))));
  grid = ng;
  await Promise.all(grid.flatMap((col, c) => col.map((sp, r) => tween(sp, { y: cellXY(c, r)[1] }, 0.34, ease.back, c * 0.035))));
  SFX.land();
  await wait(0.1);
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
// Ashvane's fire breath is one generated clip: inhale, a fire stream out of his mouth, settle.
// The fire leaves the mouth at clip frame 12, reaches the canvas edge by 19 and dies by 46 (of 52),
// so burning cells are lit when the visible fire front passes them.
async function breathe(cells = []) {
  const b = scene.breath, d = scene.dragon;
  let done;
  breathing = new Promise((r) => (done = r));
  b.play('breath', 1 / Math.max(T, 0.6)); b.op = 1; d.op = 0;
  SFX.roar();
  const N = b.a.clips.breath.frames, [mx, my] = mouth();
  const frontX = (f) => dragonBox.left + dragonBox.w * clamp(DRAGON.mouth[0] + (f - 12) * 0.085, DRAGON.mouth[0], 1);
  const order = [...cells].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  let i = 0, last = 0, shook = false;
  while (!opal.done(b.id)) {
    await nextFrame();
    const f = opal.progress(b.id) * N;
    if (f > 13 && f < 44) {
      const fx = frontX(f);
      for (let k = 0; k < 3; k++) parts.push({ k: 'ember', x: rand(mx, fx), y: my + rand(-40, 40), vx: rand(60, 220), vy: rand(-60, 80), g: 0, life: rand(0.4, 0.9), t: 0, size: rand(2, 5), ph: 0 });
      if (!shook) { shook = true; shake(); SFX.fire(); }
    }
    if (i < order.length && f >= 15 && performance.now() - last > 110 * T) {
      const [c, r] = order[i], [x] = cellXY(c, r);
      if (frontX(f) >= x || f >= 21) { ignite(c, r, mx, my); i++; last = performance.now(); }
    }
  }
  while (i < order.length) { ignite(...order[i++], mx, my); await wait(0.1); }
  d.op = 1; b.op = 0;
  breathing = null; done();
}
function ignite(c, r, mx, my) {
  const [x, y] = cellXY(c, r);
  for (let k = 0; k < 8; k++) parts.push({ k: 'spark', x: x + rand(-30, 30), y: Math.min(y, my) + rand(-20, 20), vx: rand(-40, 40), vy: (y - my) * 3 + rand(80, 200), g: 0, life: 0.25, t: 0, size: 4, color: '#ff8a2a' });
  grid[c][r]?.kill();
  const sp = makeSym({ s: E.WILD, v: 0 }, c, r);
  sp.s = 0; grid[c][r] = sp;
  tween(sp, { s: 1 }, 0.35, ease.back);
  burst('magic', x, y, L.cell * 1.7);
  burst('smoke', x, y - L.cell * 0.25, L.cell * 1.5, { speed: 0.8 });
  spark(x, y, 10, '#ff6a1a'); SFX.boom();
}
async function dragonfire(step) {
  scrim(true, true);
  await dimGrid(0.65, 0.2);
  musicMood(true);
  banner('Ashvane wakes!<small>Dragonfire burns the reels</small>', 2.6);
  await breathe(step.cells);
  await wait(0.3);
  setWrath(0);
  scrim(false);
  await dimGrid(1, 0.2);
  musicMood(S.free);
}

async function multiply(step, free) {
  const target = centerOf(free ? $('orb') : $('winAmt'));
  for (const { c, r, v } of step.coins) {
    const sp = grid[c][r], [x, y] = cellXY(c, r);
    burst('magic', x, y, L.cell * 1.5);
    SFX.coin();
    if (sp) tween(sp, { s: 1.35 }, 0.15).then(() => tween(sp, { s: 1 }, 0.25));
    fly('×' + v, [x, y], target);
    await wait(0.22);
  }
  await wait(0.45);
  if (free) {
    S.gmult = step.gmult;
    $('orb').textContent = '×' + step.gmult;
    $('orb').classList.remove('pulse'); void $('orb').offsetWidth; $('orb').classList.add('pulse');
  }
  $('winAmt').textContent = `${fmt(step.before * bet())} × ${step.mult}`;
  const wp = centerOf($('winAmt'));
  SFX.boom(); ring(...wp, 200); spark(...wp, 30, '#ffd774', 600);
  await wait(0.8);
  setWin(S.spinBase + step.win, true);
  SFX.win(3);
  await wait(0.4);
}
async function coinsToOrb(gmult) {
  const target = centerOf($('orb'));
  for (const sp of grid.flat()) if (sp?.sym === E.COIN) { SFX.coin(); burst('magic', sp.x, sp.y, L.cell * 1.4); fly('×' + sp.v, [sp.x, sp.y], target); await wait(0.2); }
  await wait(0.4);
  $('orb').textContent = '×' + gmult;
  $('orb').classList.remove('pulse'); void $('orb').offsetWidth; $('orb').classList.add('pulse');
}
function centerOf(el) {
  const r = el.getBoundingClientRect();
  const wr = world.getBoundingClientRect();
  return [(r.left + r.width / 2 - wr.left) / view.k, (r.top + r.height / 2 - wr.top) / view.k];
}

async function keys(step, free) {
  SFX.key();
  for (const [c, r] of step.cells) {
    const sp = grid[c][r], [x, y] = cellXY(c, r);
    burst('coinburst', x, y, L.cell * 2.2);
    ring(x, y, L.cell, '#ffd774');
    if (sp) tween(sp, { s: 1.4 }, 0.2, ease.back).then(() => tween(sp, { s: 1.1 }, 0.4));
  }
  await wait(0.6);
  if (free) {
    S.fsLeft += step.spins; $('fsLeft').textContent = S.fsLeft;
    $('fsLeft').classList.remove('pulse'); void $('fsLeft').offsetWidth; $('fsLeft').classList.add('pulse');
    await banner(`+${step.spins} free spins`, 1.8);
  } else {
    setWin(S.units + step.pay, true);
    const bc = [L.board[0] + (L.cell * CW * E.COLS) / 2, L.board[1] + (L.cell * E.ROWS) / 2];
    burst('eruption', ...bc, L.cell * 7, { speed: 0.9 }); SFX.boom(); shake(); coins(50);
    await banner(`${step.n} vault keys<small>The Molten Treasury opens</small>`, 2.4);
  }
}

async function playSpin(spin, free = false) {
  const base0 = (S.spinBase = S.units);
  for (const step of spin.steps) {
    if (step.t === 'drop') await dropIn(step, free);
    else if (step.t === 'win') await showWin(step);
    else if (step.t === 'tumble') await tumble(step);
    else if (step.t === 'fire') await dragonfire(step);
    else if (step.t === 'mult') await multiply(step, free);
    else if (step.t === 'keys') await keys(step, free);
  }
  // coins still feed the hoard multiplier on free spins that won nothing
  if (free && spin.gmult > S.gmult && !spin.steps.some((s) => s.t === 'mult')) await coinsToOrb(spin.gmult);
  S.gmult = spin.gmult;
  setWin(base0 + spin.win);
}

// ---------------------------------------------------------------- cutscenes
async function vaultScene(spins) {
  const cine = $('cine'), vid = $('vault'), txt = $('cineText');
  cine.hidden = false; txt.classList.remove('on');
  vid.currentTime = 0; vid.playbackRate = S.turbo ? 1.8 : 1;
  SFX.roar();
  await vid.play().catch(() => {});
  let skip = false;
  cine.onclick = () => (skip = true);
  const t0 = performance.now(), len = (vid.duration || 6.4) / vid.playbackRate;
  while (!skip && !vid.ended && performance.now() - t0 < len * 1000 + 300) {
    if (!txt.classList.contains('on') && performance.now() - t0 > len * 450) {
      txt.innerHTML = `The Molten Treasury<small>${spins} free spins &nbsp;·&nbsp; Ember Coins build the hoard multiplier</small>`;
      txt.classList.add('on'); SFX.boom();
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  // swap the vault for the treasury behind a flash
  $('bgFree').style.opacity = 1;
  // the chest gives way to the hoard multiplier orb
  scene.chest.op = 0; scene.orb.op = 1; scene.orb.s = 0.3; tween(scene.orb, { s: 1 }, 0.6, ease.back);
  burst('eruption', L.chest[0], L.chest[1], L.chest[2] * 1.3);
  $('fsInfo').hidden = false; $('buy').hidden = true;
  cine.hidden = true; txt.classList.remove('on');
  ring(L.W / 2, L.H / 2, 900, '#fff2b0');
  coins(60);
  musicMood(true);
}
async function treasuryEnd(units) {
  scrim(true);
  await dimGrid(0.25);
  await banner(`Treasury looted<small>${fmt(units * bet())} carried out of the vault</small>`, 3);
  coins(80);
  await wait(1.2);
  $('bgFree').style.opacity = 0;
  $('fsInfo').hidden = true; $('buy').hidden = false;
  tween(scene.orb, { op: 0 }, 0.4); scene.chest.op = 0; tween(scene.chest, { op: 1 }, 0.6);
  scrim(false);
  await dimGrid(1);
  musicMood(false);
}

const TIERS = [[20, 'Big win'], [50, 'Mega win'], [150, 'Epic win'], [500, 'Legendary']];
async function celebrate(units, capped) {
  if (units < TIERS[0][0]) {
    if (units >= 5) { coins(Math.min(40, units * 4)); SFX.coin(); }
    return;
  }
  scrim(true);
  await dimGrid(0.15, 0.25);
  const bw = $('bigwin'), tier = $('bwTier'), amt = $('bwAmt');
  bw.classList.add('on');
  // the crew barges in to celebrate
  const row = crew.map((sp, i) => { const s = new Spr(A.crew, sp.clip, { size: L.crewSize * 1.05, x: L.W / 2 + (i - 1.5) * L.crewSize * 0.95, y: L.row + 400 }); return s; });
  row.forEach((s, i) => tween(s, { y: L.row }, 0.6, ease.back, 0.1 * i));
  let skip = false, level = -1;
  const onSkip = () => (skip = true);
  world.addEventListener('pointerdown', onSkip);
  const total = units * bet(), dur = (3 + TIERS.filter(([t]) => units >= t).length * 1.4) * T;
  let t = 0, burstT = 0;
  while (t < dur && !skip) {
    const t0 = performance.now();
    await new Promise((r) => requestAnimationFrame(r));
    const dt = Math.min(0.05, (performance.now() - t0) / 1000);
    t += dt; burstT -= dt;
    const v = units * (1 - (1 - t / dur) ** 2);
    amt.textContent = fmt(v * bet());
    if (Math.random() < 0.5) SFX.tick();
    const lv = TIERS.filter(([th]) => v >= th).length - 1;
    if (lv > level) {
      level = lv;
      tier.textContent = TIERS[lv][1];
      tier.classList.remove('slam'); void tier.offsetWidth; tier.classList.add('slam');
      SFX.boom(); shake(); ring(L.W / 2, L.bigwin + 80, 700);
      if (lv >= 2) roar();
      burst('eruption', L.W / 2, L.bigwin + 120, L.cell * (5 + lv));
      row.forEach((s) => tween(s, { s: 1.15 }, 0.12).then(() => tween(s, { s: 1 }, 0.3, ease.back)));
    }
    if (burstT <= 0) { burstT = 0.32; burst('coinburst', rand(L.W * 0.15, L.W * 0.85), rand(L.H * 0.15, L.H * 0.7), rand(200, 340)); fountain(rand(L.W * 0.3, L.W * 0.7), L.H, 6); }
    if (Math.random() < 0.3) coins(1);
  }
  world.removeEventListener('pointerdown', onSkip);
  amt.textContent = fmt(total);
  if (capped) { tier.textContent = "Ashvane's Ransom"; tier.classList.remove('slam'); void tier.offsetWidth; tier.classList.add('slam'); roar(); coins(150); }
  SFX.win(3); coins(60);
  await wait(capped ? 3 : 1.8);
  bw.classList.remove('on');
  await Promise.all(row.map((s, i) => tween(s, { y: L.row + 500 }, 0.35, ease.in, 0.05 * i)));
  row.forEach((s) => s.kill());
  scrim(false);
  await dimGrid(1);
}

async function intro() {
  let skipping = false;
  const skip = () => { if (!skipping) { skipping = true; T = 0.02; } };
  setTimeout(() => world.addEventListener('pointerdown', skip), 500); // not the tap that started it
  const story = $('story');
  const say = async (html, hold) => { story.style.opacity = 0; await wait(0.3); story.innerHTML = html; story.style.opacity = 1; await wait(hold); };
  // a clean stage for the story: only the dragon and the crew; the board is revealed at the end
  const stage = () => [scene.frame, scene.chest, scene.logo, ...scene.braziers, ...grid.flat()].filter(Boolean);
  stage().forEach((sp) => (sp.op = 0));
  $('under').style.opacity = 0; $('bar').style.opacity = 0; $('buy').style.opacity = 0;
  scrim(true);
  crew.forEach((sp) => { sp.op = 0; });
  await say('Beneath the volcano Kharros sleeps <b>Ashvane, the Ember King</b>', 1.6);
  roar(); coins(30);
  await wait(1.6);
  if (breathing) await breathing;
  await say('Four thieves have tunnelled into his vault', 0.6);
  for (const [i, sp] of crew.entries()) {
    Object.assign(sp, { x: (L.name === 'land' ? 1010 : L.W / 2) + (i - 1.5) * L.crewSize * 1.05, y: L.row - 130, size: L.crewSize * 1.1, s: 0.2, op: 1 });
    tween(sp, { s: 1 }, 0.45, ease.back);
    burst('magic', sp.x, sp.y, L.crewSize * 1.4);
    SFX.coin();
    const [n, role] = NAMES[sp.clip];
    const tag = pop(n, sp.x, sp.y + L.crewSize * 0.62);
    tag.innerHTML = `${n}<small style="display:block;font:700 22px/1.2 var(--ui);color:var(--ash)">${role}</small>`;
    tag.style.animationDuration = '3s';
    await wait(0.5);
  }
  await wait(0.8);
  await say('Every win makes noise. Fill his <b>wrath</b> and the reels burn', 2.2);
  await say('Find four <b>Vault Keys</b> to open the Molten Treasury', 2.2);
  story.style.opacity = 0;
  SFX.boom(); shake();
  await banner("Ashvane's Hoard<small>Steal up to 10,000× your bet</small>", 2.6);
  await Promise.all(crew.map((sp, i) => tween(sp, { y: sp.y + 600, op: 0 }, 0.5, ease.in, i * 0.06)));
  scrim(false);
  await reveal();
  world.removeEventListener('pointerdown', skip);
  T = S.turbo ? 0.55 : 1;
  story.innerHTML = '';
}

// the board assembles: frame slams in, props light up, the opening grid drops in column by column
async function reveal() {
  T = Math.min(T, 1);
  $('under').style.opacity = 1;
  const f = scene.frame;
  f.s = 1.12; tween(f, { op: 1, s: 1 }, 0.5, ease.back);
  SFX.boom(); shake();
  for (const sp of [scene.logo, scene.chest, ...scene.braziers]) { sp.s = 0.6; tween(sp, { op: 1, s: 1 }, 0.5, ease.back, 0.15); }
  await wait(0.3);
  await Promise.all(grid.flatMap((col, c) => col.map((sp, r) => {
    const y = sp.y; sp.y -= L.cell * (E.ROWS + 1); sp.op = 1;
    return tween(sp, { y }, 0.4, ease.back, c * 0.07 + (E.ROWS - 1 - r) * 0.03);
  })));
  SFX.land();
  $('bar').style.opacity = 1; $('buy').style.opacity = 1;
}

// ---------------------------------------------------------------- round flow
async function spinRound(buy = false) {
  if (S.busy) return;
  const cost = buy ? bet() * E.BUY_COST : bet();
  if (S.bal < cost) { S.auto = 0; hud(); banner('Not enough gold<small>Lower the bet to keep stealing</small>'); return; }
  S.busy = true; S.bal -= cost; hud(); SFX.click();
  const seed = FORCED.length ? FORCED.shift() : crypto.getRandomValues(new Uint32Array(1))[0];
  const out = E.round(E.rng(seed), { wrath: S.wrath, buy });
  window.__last = { seed, total: out.total, fs: out.fs.length };
  setWin(0);
  await playSpin(out.base);
  if (out.fs.length) {
    S.auto = 0;
    S.free = true; S.fsLeft = out.base.award; S.gmult = 0;
    $('fsLeft').textContent = S.fsLeft; $('orb').textContent = '×0';
    await vaultScene(out.base.award);
    for (const s of out.fs) {
      S.fsLeft--; $('fsLeft').textContent = S.fsLeft;
      await playSpin(s, true);
      await wait(0.35);
    }
    S.free = false;
    await treasuryEnd(out.fsWin);
  }
  S.wrath = out.wrath;
  setWin(out.total);
  await celebrate(out.total, out.capped);
  S.bal += out.total * bet();
  S.busy = false;
  if (S.auto > 0) S.auto--;
  hud();
  if (S.auto > 0) setTimeout(() => spinRound(), 250 * T);
}

// ---------------------------------------------------------------- controls
function modal(html, actions = [['Close']]) {
  const m = $('modal');
  m.innerHTML = `<div class="mbody">${html}</div><div class="mact">${actions.map(([t, cls], i) => `<button data-i="${i}" class="${cls ?? ''}">${t}</button>`).join('')}</div>`;
  m.showModal();
  return new Promise((res) => m.querySelectorAll('button').forEach((b) => (b.onclick = () => { m.close(); res(+b.dataset.i); })));
}
function paytable() {
  const b = bet(), row = (s, name) => `<div><img src="media/thumbs/${name}.png" alt=""><span><b>${name[0].toUpperCase() + name.slice(1)}</b><br>12+ ${fmt(E.payOf(s, 12) * b)}<br>10-11 ${fmt(E.payOf(s, 10) * b)}<br>8-9 ${fmt(E.payOf(s, 8) * b)}</span></div>`;
  const names = ['ruby', 'sapphire', 'amethyst', 'topaz', 'nib', 'morra', 'brakka', 'vex'];
  modal(`<h3>Ashvane's Hoard</h3>
    <p>8 or more of a symbol anywhere on the 6×5 grid wins. Winning symbols shatter and new ones tumble in, again and again.</p>
    <h4>Pays at a bet of ${fmt(b)}</h4><div class="ptable">${names.map((n, s) => row(s, n)).reverse().join('')}</div>
    <h4><img src="media/thumbs/egg.png" alt="" width="40" style="vertical-align:middle"> Dragon's wrath</h4>
    <p>Each tumble win adds a flame to Ashvane's wrath. At ${E.WRATH_MAX} flames he wakes and breathes fire, burning 3 to 8 symbols into Dragon Egg wilds. Wilds join the cluster they make worth the most.</p>
    <h4><img src="media/thumbs/coin.png" alt="" width="40" style="vertical-align:middle"> Ember Coins</h4>
    <p>Each coin carries ×2 to ×500. At the end of a tumble sequence, the coins on the grid are added together and multiply that spin's win.</p>
    <h4><img src="media/thumbs/key.png" alt="" width="40" style="vertical-align:middle"> The Molten Treasury</h4>
    <p>4, 5 or 6 Vault Keys pay 3×, 5× or 100× the bet and open ${E.FS_AWARD} free spins. In the Treasury every Ember Coin adds to the hoard multiplier, which multiplies every winning spin until the end. The dragon is restless there, so his wrath fills twice as fast. 3 keys add ${E.FS_RETRIGGER} spins. Buy your way in for ${E.BUY_COST}× the bet.</p>
    <h4>Maths</h4>
    <p>Simulated RTP about 96–97% (base game) and 95.7% (bonus buy) over millions of rounds, see <code>tools/sim.mjs</code>. Maximum win ${E.MAX_WIN.toLocaleString()}× the bet. Demo credits only.</p>
    <h4>Built with Opal</h4>
    <p>Every symbol, the dragon, the crew and every burst, flame and coin shower is a transparent video sprite generated with AI, keyed and packed by <a href="https://github.com/dilukangelosl/opal">Opal</a> and played by <a href="https://www.npmjs.com/package/opal-sprites">opal-sprites</a>: ${Object.values(A).reduce((s, a) => s + a.frames, 0)} video frames, ${(Object.values(A).reduce((s, a) => s + a.bytes, 0) / 1048576).toFixed(1)} MB of .opal files, one draw call per file.</p>`);
}
function bind() {
  $('spin').onclick = () => { if (S.busy && S.auto) { S.auto = 0; hud(); } else spinRound(); };
  $('betDown').onclick = () => { S.betI = Math.max(0, S.betI - 1); SFX.click(); hud(); setWin(0); };
  $('betUp').onclick = () => { S.betI = Math.min(BETS.length - 1, S.betI + 1); SFX.click(); hud(); setWin(0); };
  $('turbo').onclick = () => { S.turbo = !S.turbo; T = S.turbo ? 0.55 : 1; $('turbo').setAttribute('aria-pressed', S.turbo); SFX.click(); };
  $('auto').onclick = () => { const n = [0, 10, 25, 50, 100]; S.auto = n[(n.indexOf(S.auto) + 1) % n.length]; hud(); if (S.auto && !S.busy) spinRound(); };
  $('snd').onclick = () => { AU.on = !AU.on; $('snd').setAttribute('aria-pressed', AU.on); if (AU.c) AU.out.gain.value = AU.on ? 0.55 : 0; if (AU.on) music(); };
  $('info').onclick = paytable;
  $('buy').onclick = async () => {
    if (S.busy) return;
    const ok = await modal(`<h3>Raid the Treasury</h3><p>Buy ${E.FS_AWARD} free spins in the Molten Treasury for <b>${fmt(bet() * E.BUY_COST)}</b> (${E.BUY_COST}× your bet of ${fmt(bet())}).</p>`, [['Cancel'], ['Buy bonus', 'primary']]);
    if (ok === 1) spinRound(true);
  };
  addEventListener('keydown', (e) => { if (e.code === 'Space' && !$('modal').open && $('loader').hidden) { e.preventDefault(); $('spin').click(); } });
  addEventListener('resize', resize);
}

// ---------------------------------------------------------------- boot
let last = performance.now(), fpsT = 0, fpsN = 0, fps = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  stepTweens(dt);
  for (const sp of sprites) {
    if (sp.once && opal.done(sp.id)) { sp.kill(); continue; }
    sp.apply();
    if (sp.label) { place(sp.label, sp.x, sp.y + L.cell * 0.3); sp.label.style.opacity = clamp(sp.op * sp.fade()); sp.label.style.transform = `translate(-50%,-50%) scale(${sp.s})`; }
  }
  drawParts(dt);
  const warped = [];
  for (const sp of sprites) if (sp.warp) { opal.speed(sp.id, sp.warp / Math.max(dt, 1e-3)); warped.push(sp); sp.warp = 0; }
  opal.render(dt);
  for (const sp of warped) opal.speed(sp.id, 1);
  if ((fpsT += dt) > 0.5) { fps = fpsN / fpsT; fpsT = 0; fpsN = 0; if (stats) stats.textContent = `${fps.toFixed(0)} fps · ${sprites.size} video sprites · ${(Object.values(A).reduce((s, a) => s + a.vram, 0) / 1048576).toFixed(0)} MB VRAM`; }
  fpsN++;
  requestAnimationFrame(frame);
}
let stats = null;

async function boot() {
  buildDom(); resize(); bind(); hud(); setWrath(S.wrath);
  try {
    opal = await createOpal(cv);
  } catch (e) {
    $('loadMsg').textContent = `This browser can't run the game: ${e.message}. Try a current Chrome, Edge or Safari.`;
    return;
  }
  // load order is draw order: the frame over the symbols (it masks them as they fall in and out),
  // the dragon's fire over everything
  const files = [['brazier'], ['props'], ['logo'], ['crew'], ['sym', 'symbols'], ['board'], ['wf', 'winframe'], ['pillar'], ['dragon'], ['breath'], ['fx']];
  let done = 0;
  const scale = MOBILE ? 0.6 : 1;
  for (const [k, f = k] of files) {
    A[k] = await opal.load(`media/${f}.opal`, { scale });
    $('lfill').style.width = (++done / files.length) * 100 + '%';
  }
  window.__opal = { assets: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, { frames: a.frames, vram: a.vram, clips: Object.keys(a.clips) }])) };
  scene.braziers = [0, 1].map(() => new Spr(A.brazier, 'brazier', { fit: 'h', mode: 'feet' }).desync());
  scene.chest = new Spr(A.props, 'chest');
  scene.orb = new Spr(A.props, 'orb'); scene.orb.op = 0;
  scene.logo = new Spr(A.logo, 'logo');
  scene.frame = new Spr(A.board, 'frame');
  scene.dragon = new Spr(A.dragon, 'idle');
  scene.breath = new Spr(A.breath, 'breath'); scene.breath.op = 0;
  crew = ['vex', 'morra', 'brakka', 'nib'].map((n) => { const s = new Spr(A.crew, n, { size: L.crewSize }).desync(); s.op = 0; return s; });
  seat();
  // an opening grid so the board is never empty
  const first = E.spin(E.rng(7));
  grid = first.steps[0].grid.map((col, c) => col.map((cell, r) => makeSym(cell.s === E.WILD ? { s: 0, v: 0 } : cell, c, r)));
  const hit = document.createElement('button'); hit.id = 'buyHit'; hit.setAttribute('aria-label', 'Buy the Molten Treasury bonus'); $('top').append(hit);
  hit.onclick = () => $('buy').click();
  resize();
  if (QS.has('stats')) { stats = document.createElement('div'); stats.id = 'stats'; world.append(stats); }
  requestAnimationFrame(frame);
  $('loadMsg').textContent = 'The vault is open.';
  $('go').hidden = false;
  $('go').focus();
  await new Promise((r) => ($('go').onclick = r));
  ac(); music();
  $('loader').hidden = true;
  if (!QS.has('nointro')) await intro();
  window.__ready = true;
  if (QS.has('buy')) spinRound(true);
}
boot();
