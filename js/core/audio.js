// Audio de Asfalto Regio: todo sintetizado con WebAudio (sin archivos ni descargas).
// Un solo AudioContext compartido (audio.ctx) con buses por categoría: master, music, sfx, engine, voice.
// Presupuesto de CPU: voz de motor local ≤ 12 nodos, motor remoto ≤ 6; los efectos crean nodos
// temporales que se desconectan solos al terminar (ver stats.live).

import { rng } from './util.js';

const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const BUS_NAMES = ['master', 'music', 'sfx', 'engine', 'voice'];
const TAU = Math.PI * 2;

let ctx = null;
const buses = {};
let duckNode = null;
const vol = { master: 0.8, music: 0.45, sfx: 0.8, engine: 0.8, voice: 0.9 };

// ---------- Contadores (para vigilar el costo) ----------
export const stats = { live: 0, created: 0, freed: 0 };
export function nodeAlloc(n = 1) { stats.live += n; stats.created += n; }
export function nodeFree(n = 1) { stats.live -= n; stats.freed += n; }

function ensureCtx() {
  if (ctx) return ctx;
  if (!AC) return null;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch { try { ctx = new AC(); } catch { return null; } }
  // Limitador final para que nada sature.
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -8; lim.knee.value = 8; lim.ratio.value = 10; lim.attack.value = 0.003; lim.release.value = 0.2;
  for (const k of BUS_NAMES) { buses[k] = ctx.createGain(); buses[k].gain.value = vol[k]; }
  duckNode = ctx.createGain();
  buses.master.connect(lim); lim.connect(ctx.destination);
  buses.music.connect(duckNode); duckNode.connect(buses.master);
  buses.sfx.connect(buses.master); buses.engine.connect(buses.master); buses.voice.connect(buses.master);
  nodeAlloc(7);
  return ctx;
}
const running = () => ctx && ctx.state === 'running';

// Fija un parámetro con suavizado sin llenar la línea de tiempo de eventos casi iguales.
export function setP(p, v, tau, now) {
  const last = p._v;
  if (last !== undefined && Math.abs(last - v) <= Math.abs(v) * 0.003 + 1e-5) return;
  p._v = v;
  p.setTargetAtTime(v, now, tau);
}
function hardSet(p, v, now) { p._v = v; p.cancelScheduledValues(now); p.setTargetAtTime(v, now, 0.015); }

// ---------- Búferes generados (se guardan por frecuencia de muestreo) ----------
const bufCache = new Map();
function cached(c, key, make) {
  const k = key + '@' + c.sampleRate;
  let b = bufCache.get(k);
  if (!b) { b = make(c); bufCache.set(k, b); }
  return b;
}
const onePole = (fc, sr) => 1 - Math.exp(-TAU * fc / sr);

// Búfer en bucle sin chasquido: genera F muestras de más y las funde con el inicio.
function loopBuffer(c, seconds, channels, fill) {
  const sr = c.sampleRate, L = Math.round(seconds * sr), F = Math.min(Math.round(0.1 * sr), L >> 2);
  const buf = c.createBuffer(channels, L, sr);
  for (let ch = 0; ch < channels; ch++) {
    const d = new Float32Array(L + F);
    fill(d, ch, sr);
    for (let i = 0; i < F; i++) { const a = i / F; d[i] = d[i] * Math.sqrt(a) + d[L + i] * Math.sqrt(1 - a); }
    normalize(d, 0.3);
    buf.getChannelData(ch).set(d.subarray(0, L));
  }
  return buf;
}
function normalize(d, rmsTarget, peakMax = 0.97) {
  let s = 0, pk = 0;
  for (let i = 0; i < d.length; i++) { const v = d[i]; s += v * v; const a = v < 0 ? -v : v; if (a > pk) pk = a; }
  const rms = Math.sqrt(s / d.length) || 1;
  let g = rmsTarget / rms;
  if (pk * g > peakMax) g = peakMax / pk;
  for (let i = 0; i < d.length; i++) d[i] *= g;
}

export function noiseBuffer(c) {
  return cached(c, 'ruido', c => {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0), r = rng('ruido');
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    return b;
  });
}
const curveCache = new Map();
export function driveCurve(k) {
  const key = Math.round(k * 100);
  let cv = curveCache.get(key);
  if (!cv) {
    cv = new Float32Array(1024);
    const n = Math.tanh(k);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(k * x) / n; }
    curveCache.set(key, cv);
  }
  return cv;
}

// ---------- Perfiles de motor ----------
// pulses: pulsos por ciclo de 720°. base: rpm del búfer (playbackRate = rpm/base).
// amps/offs: patrón de amplitud y desfase por pulso (irregularidades de cada arquitectura).
// thump: ancho del golpe de presión (fracción del intervalo; menor = más armónicos).
// ring/ringMul/rTau: resonancia corta por pulso (múltiplo de la frecuencia de encendido).
// noise/nTau/nLP: aspereza. cycJ/ampJ/timeJ: variación aleatoria orgánica.
// drive: saturación. fHz/fQ/fDb: formante fijo del escape. lp: corte base. gain: volumen relativo. pops: petardeos.
const W16_AMPS = Array.from({ length: 16 }, (_, p) => [1, 0.78, 0.92, 0.72][p % 4] * (p < 8 ? 1 : 0.88));
const PROFILES = {
  I3: { pulses: 3, base: 3000, amps: [1, 0.86, 0.93], offs: [0, 0.025, -0.02], thump: 0.07, ring: 0.4, ringMul: 2.5, rTau: 0.18, noise: 0.3, nTau: 0.22, nLP: 3800, cycJ: 0.09, ampJ: 0.08, timeJ: 0.012, drive: 2.3, fHz: 380, fQ: 1.1, fDb: 6, lp: 2700, lpQ: 0.9, gain: 0.95, pops: 0.6 },
  I4: { pulses: 4, base: 3200, amps: [1, 0.96, 1, 0.94], offs: null, thump: 0.055, ring: 0.5, ringMul: 3, rTau: 0.16, noise: 0.25, nTau: 0.2, nLP: 4200, cycJ: 0.04, ampJ: 0.06, timeJ: 0.008, drive: 2.6, fHz: 480, fQ: 1.0, fDb: 4, lp: 3300, lpQ: 0.8, gain: 0.85, pops: 0.7 },
  I5: { pulses: 5, base: 3000, amps: [1, 0.82, 0.95, 0.78, 0.9], offs: [0, 0.03, -0.02, 0.04, -0.01], thump: 0.08, ring: 0.35, ringMul: 2, rTau: 0.2, noise: 0.55, nTau: 0.3, nLP: 3500, cycJ: 0.07, ampJ: 0.12, timeJ: 0.015, drive: 3.0, fHz: 330, fQ: 1.4, fDb: 6, lp: 3000, lpQ: 1.2, gain: 0.82, pops: 0.9 },
  I6: { pulses: 6, base: 3200, amps: null, offs: null, thump: 0.11, ring: 0.25, ringMul: 4, rTau: 0.15, noise: 0.12, nTau: 0.18, nLP: 3000, cycJ: 0.02, ampJ: 0.04, timeJ: 0.004, drive: 1.6, fHz: 700, fQ: 0.9, fDb: 4, lp: 3600, lpQ: 0.7, gain: 0.85, pops: 0.4 },
  V6: { pulses: 6, base: 3000, amps: [1, 0.78, 0.96, 0.8, 0.92, 0.75], offs: [0, 0.06, -0.03, 0.05, -0.02, 0.04], thump: 0.1, ring: 0.3, ringMul: 1.5, rTau: 0.22, noise: 0.45, nTau: 0.28, nLP: 2400, cycJ: 0.06, ampJ: 0.09, timeJ: 0.012, drive: 2.6, fHz: 240, fQ: 1.2, fDb: 7, lp: 2400, lpQ: 1.0, gain: 0.72, pops: 0.7 },
  V8: { pulses: 8, base: 2800, amps: [1, 0.72, 1, 1, 0.72, 1, 0.72, 0.72], offs: [0, 0.07, -0.04, 0.05, 0.08, -0.03, 0.06, 0.02], thump: 0.12, ring: 0.2, ringMul: 1.5, rTau: 0.25, noise: 0.35, nTau: 0.3, nLP: 1800, cycJ: 0.09, ampJ: 0.1, timeJ: 0.02, drive: 2.8, fHz: 150, fQ: 1.0, fDb: 9, lp: 1900, lpQ: 0.9, gain: 0.78, pops: 1.0 },
  V10: { pulses: 10, base: 4200, amps: [1, 0.9, 1, 0.92, 1, 0.88, 1, 0.9, 1, 0.93], offs: null, thump: 0.05, ring: 0.6, ringMul: 3.5, rTau: 0.14, noise: 0.2, nTau: 0.18, nLP: 5000, cycJ: 0.03, ampJ: 0.05, timeJ: 0.006, drive: 2.4, fHz: 1000, fQ: 1.1, fDb: 5, lp: 5200, lpQ: 1.0, gain: 0.9, pops: 0.6 },
  V12: { pulses: 12, base: 4400, amps: null, offs: null, thump: 0.05, ring: 0.7, ringMul: 4, rTau: 0.13, noise: 0.12, nTau: 0.15, nLP: 5000, cycJ: 0.02, ampJ: 0.04, timeJ: 0.004, drive: 2.0, fHz: 1250, fQ: 1.2, fDb: 6, lp: 6200, lpQ: 0.9, gain: 0.9, pops: 0.4 },
  F4: { pulses: 4, base: 3000, amps: [1, 0.62, 0.95, 0.66], offs: [0, 0.12, 0, -0.1], thump: 0.12, ring: 0.25, ringMul: 1.5, rTau: 0.22, noise: 0.35, nTau: 0.28, nLP: 2200, cycJ: 0.07, ampJ: 0.08, timeJ: 0.012, drive: 2.6, fHz: 170, fQ: 1.0, fDb: 8, lp: 2100, lpQ: 0.9, gain: 0.66, pops: 0.9 },
  F6: { pulses: 6, base: 3600, amps: [1, 0.86, 1, 0.86, 1, 0.86], offs: [0, 0.02, 0, 0.02, 0, 0.02], thump: 0.06, ring: 0.55, ringMul: 3, rTau: 0.15, noise: 0.25, nTau: 0.2, nLP: 5000, cycJ: 0.03, ampJ: 0.05, timeJ: 0.006, drive: 2.6, fHz: 820, fQ: 1.5, fDb: 6, lp: 4600, lpQ: 1.1, gain: 0.95, pops: 0.6 },
  W16: { pulses: 16, base: 2600, amps: W16_AMPS, offs: null, thump: 0.16, ring: 0.15, ringMul: 1.5, rTau: 0.25, noise: 0.4, nTau: 0.35, nLP: 1600, cycJ: 0.05, ampJ: 0.07, timeJ: 0.01, drive: 2.4, fHz: 110, fQ: 0.9, fDb: 10, lp: 1700, lpQ: 0.8, gain: 0.95, pops: 0.5 },
  R2: { pulses: 4, base: 3400, amps: [1, 0.8, 0.97, 0.82], offs: [0, 0.03, -0.02, 0.04], thump: 0.2, ring: 0.45, ringMul: 2.2, rTau: 0.2, noise: 0.75, nTau: 0.5, nLP: 4500, cycJ: 0.14, ampJ: 0.2, timeJ: 0.03, drive: 3.4, fHz: 560, fQ: 1.3, fDb: 7, lp: 4000, lpQ: 1.2, gain: 0.95, pops: 1.2 },
};
export const ENGINE_LAYOUTS = {
  I3: 'Tres en línea', I4: 'Cuatro en línea', I5: 'Cinco en línea', I6: 'Seis en línea', V6: 'V6', V8: 'V8',
  V10: 'V10', V12: 'V12', F4: 'Bóxer de 4', F6: 'Bóxer de 6', W16: 'W16', R2: 'Rotativo', EV: 'Eléctrico',
};

// Tren de pulsos de escape de varios ciclos (en bucle exacto) con las irregularidades del perfil.
function engineBuffer(c, layout) {
  return cached(c, 'motor-' + layout, c => {
    const P = PROFILES[layout], sr = c.sampleRate, cycles = 16;
    const cyc = 120 / P.base, N = Math.round(cyc * cycles * sr), cycLen = N / cycles;
    const d = new Float32Array(N), r = rng('motor-' + layout), n = P.pulses;
    const interval = cyc / n, tauT = interval * P.thump, tauN = interval * P.nTau, tauR = interval * P.rTau;
    const ringW = TAU * P.ringMul / interval, aN = onePole(P.nLP, sr);
    const plen = Math.min(Math.round(interval * 3.2 * sr), N);
    let lpS = 0;
    for (let ci = 0; ci < cycles; ci++) {
      const cAmp = 1 + (r() - 0.5) * 2 * P.cycJ;
      for (let p = 0; p < n; p++) {
        const off = P.offs ? P.offs[p % P.offs.length] : 0;
        const pos = ci * cycLen + (p + off + (r() - 0.5) * 2 * P.timeJ) * cycLen / n;
        const amp = cAmp * (P.amps ? P.amps[p] : 1) * (1 + (r() - 0.5) * 2 * P.ampJ);
        const nAmp = P.noise * amp * (0.7 + r() * 0.6) * 3;
        const start = Math.floor(pos);
        for (let i = 0; i < plen; i++) {
          const t = i / sr, x = t / tauT;
          lpS += aN * ((r() * 2 - 1) - lpS);
          const v = amp * x * Math.exp(1 - x) + amp * P.ring * Math.exp(-t / tauR) * Math.sin(ringW * t) + nAmp * Math.exp(-t / tauN) * lpS;
          d[(start + i) % N] += v;
        }
      }
    }
    // pasabajos suave (antialias al subir el tono) en dos pasadas para que el bucle no tenga salto
    const a = onePole(5000, sr);
    let y = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) { y += a * (d[i] - y); if (pass) d[i] = y; }
    let mean = 0; for (let i = 0; i < N; i++) mean += d[i]; mean /= N;
    for (let i = 0; i < N; i++) d[i] -= mean;
    normalize(d, 0.28, 0.95);
    const b = c.createBuffer(1, N, sr); b.getChannelData(0).set(d);
    return b;
  });
}

// ---------- Texturas de rodado por superficie ----------
const SURF = {
  asfalto: { level: 0.12 }, piano: { level: 0.42 }, pasto: { level: 0.3 }, tierra: { level: 0.34 }, grava: { level: 0.38 },
  arena: { level: 0.28 }, nieve: { level: 0.26 }, hielo: { level: 0.07 },
};
function roadBuffer(c, kind) {
  if (!SURF[kind]) kind = 'asfalto';
  return cached(c, 'rodado-' + kind, c => loopBuffer(c, 2, 1, (d, ch, sr) => {
    const r = rng('rodado-' + kind), N = d.length;
    const aLo = onePole(300, sr), aMid = onePole(1200, sr), aHi = onePole(kind === 'grava' ? 6500 : kind === 'nieve' ? 1800 : 3000, sr);
    let lo = 0, mid = 0, crack = 0, crackLP = 0, thump = 0, thumpPh = 0, env = 1, envT = 1;
    const dens = { tierra: 600, grava: 1300, arena: 120, nieve: 500, pasto: 60 }[kind] || 0;
    const pebble = { tierra: 20, grava: 45, nieve: 8 }[kind] || 0;
    const crackDecay = Math.exp(-1 / (0.0005 * sr));
    for (let i = 0; i < N; i++) {
      const w = r() * 2 - 1;
      lo += aLo * (w - lo); mid += aMid * (w - mid);
      let v = 0;
      if (kind === 'asfalto') v = lo * 3 + (mid - lo) * 0.5;
      else if (kind === 'hielo') v = (w - mid) * 0.25 + lo * 0.8;
      else if (kind === 'pasto') {
        if (i % 2000 === 0) envT = 0.3 + r() * 0.7;
        env += (envT - env) * 0.0008;
        v = (w - mid) * 0.5 * env + lo * 1.5;
      } else if (kind === 'arena') v = (w - mid) * 0.45 + lo * 2;
      else if (kind === 'piano') {
        // golpes periódicos del piano (bordillo): ~22 por segundo a velocidad base
        thumpPh += 22 / sr;
        if (thumpPh >= 1) { thumpPh -= 1; thump = 1; }
        thump *= Math.exp(-1 / (0.012 * sr));
        v = thump * Math.sin(TAU * 95 * (thumpPh / 22)) * 1.4 + lo * 2;
      } else v = lo * 2;
      if (dens) {
        if (r() < dens / sr) crack = (r() * r()) * (kind === 'grava' ? 1.6 : 1.1);
        if (pebble && r() < pebble / sr) crack = 1.8 + r();
        crack *= crackDecay;
        crackLP += aHi * (crack * w - crackLP);
        v += crackLP * 2.5;
      }
      d[i] = v;
    }
  }));
}

// ---------- Ambientes (estéreo, en bucle) ----------
function addTone(d, start, f, tau, amp, sr) {
  const n = Math.min(d.length - start, Math.round(tau * 5 * sr)), w = TAU * f / sr;
  for (let i = 0; i < n; i++) d[start + i] += amp * Math.exp(-i / (tau * sr)) * Math.sin(w * i);
}
const AMB = {
  lluvia: { secs: 6, level: 0.55, fill(d, ch, sr) {
    const r = rng('lluvia' + ch), N = d.length, aH = onePole(450, sr), aL = onePole(7000, sr), aB = onePole(220, sr);
    let h = 0, l = 0, b = 0;
    for (let i = 0; i < N; i++) { const w = r() * 2 - 1; h += aH * (w - h); l += aL * ((w - h) - l); b += aB * (w - b); d[i] = l * 0.35 + b * 0.9; }
    const drops = Math.round(N / sr * 230);
    for (let k = 0; k < drops; k++) addTone(d, Math.floor(r() * N), 2000 + r() * 4500, 0.002 + r() * 0.004, 0.04 + Math.pow(r(), 3) * 0.35, sr);
    const plinks = Math.round(N / sr * 3);
    for (let k = 0; k < plinks; k++) addTone(d, Math.floor(r() * N), 1200 + r() * 2300, 0.015 + r() * 0.025, 0.12, sr);
  } },
  viento: { secs: 8, level: 0.5, fill(d, ch, sr) {
    const r = rng('viento' + ch), N = d.length;
    let br = 0, lo = 0, ba = 0, lo2 = 0, ba2 = 0, fc = 500, fcT = 500, gust = 0.5, gustT = 0.6, fw = 1300, fwT = 1300;
    for (let i = 0; i < N; i++) {
      if (i % 4096 === 0) { fcT = 250 + r() * 650; gustT = 0.25 + r() * 0.75; fwT = 900 + r() * 900; }
      fc += (fcT - fc) * 0.00004; gust += (gustT - gust) * 0.00003; fw += (fwT - fw) * 0.00003;
      const w = r() * 2 - 1;
      br = (br + 0.02 * w) / 1.02;
      // filtro de estado variable (Chamberlin) pasabanda móvil
      const f1 = 2 * Math.sin(Math.PI * fc / sr), hi = br * 6 - lo - 0.7 * ba; ba += f1 * hi; lo += f1 * ba;
      const f2 = 2 * Math.sin(Math.PI * fw / sr), hi2 = w - lo2 - 0.12 * ba2; ba2 += f2 * hi2; lo2 += f2 * ba2;
      d[i] = ba * gust + ba2 * 0.012 * gust * gust + br * 0.4;
    }
  } },
  ciudad: { secs: 12, level: 0.42, fill(d, ch, sr) {
    const r = rng('ciudad' + ch), ev = rng('ciudad-ev'), N = d.length, aL = onePole(300, sr);
    let lo = 0, ba = 0, lp = 0, am = 1, amT = 1;
    for (let i = 0; i < N; i++) {
      if (i % 8192 === 0) amT = 0.7 + r() * 0.3;
      am += (amT - am) * 0.0002;
      const w = r() * 2 - 1; lo += aL * (w - lo);
      const f = 2 * Math.sin(Math.PI * 700 / sr), hi = w - lp - 1.2 * ba; ba += f * hi; lp += f * ba;
      d[i] = lo * 2.2 * am + ba * 0.08 * (0.5 + 0.5 * Math.sin(i / sr * TAU * 3.3 + ch));
    }
    // autos que pasan (paneados) y claxons lejanos
    const cars = 5;
    for (let k = 0; k < cars; k++) {
      const st = Math.floor(ev() * N), len = Math.round((2 + ev()) * sr), pan = ev(), g = ch === 0 ? 1 - pan * 0.7 : 0.3 + pan * 0.7;
      const fc = 500 + ev() * 700; let b2 = 0, l2 = 0;
      for (let i = 0; i < len; i++) {
        const e = Math.sin(Math.PI * i / len); const w = r() * 2 - 1;
        const f = 2 * Math.sin(Math.PI * fc / sr), hi = w - l2 - 0.9 * b2; b2 += f * hi; l2 += f * b2;
        d[(st + i) % N] += b2 * e * e * 0.35 * g;
      }
    }
    for (let k = 0; k < 2; k++) {
      const st = Math.floor(ev() * N), len = Math.round(0.28 * sr), f1 = 360 + ev() * 60;
      for (let i = 0; i < len; i++) {
        const t = i / sr, e = Math.min(1, i / 400) * Math.min(1, (len - i) / 800);
        d[(st + i) % N] += e * 0.03 * (Math.sin(TAU * f1 * t) + 0.33 * Math.sin(TAU * f1 * 3 * t) + Math.sin(TAU * f1 * 1.26 * t) * 0.8);
      }
    }
  } },
  gradas: { secs: 8, level: 0.42, fill(d, ch, sr) {
    const r = rng('gradas' + ch), ev = rng('gradas-ev'), N = d.length;
    const voices = Array.from({ length: 5 }, () => ({ fc: 400 + r() * 2000, lo: 0, ba: 0, env: 0, envT: 0 }));
    // ovaciones: 2 por bucle
    const swells = [ev() * 0.4, 0.5 + ev() * 0.4].map(x => Math.floor(x * N));
    const swellAt = i => { let s = 0; for (const st of swells) { const x = ((i - st + N) % N) / sr; if (x < 3.2) s += x < 0.8 ? x / 0.8 : Math.exp(-(x - 0.8) / 0.9); } return s; };
    for (let i = 0; i < N; i++) {
      const w = r() * 2 - 1;
      let v = 0;
      for (const vo of voices) {
        if (i % 2400 === 0) vo.envT = r() < 0.6 ? 0.2 + r() : 0.05;
        vo.env += (vo.envT - vo.env) * 0.002;
        const f = 2 * Math.sin(Math.PI * vo.fc / sr), hi = w - vo.lo - 0.35 * vo.ba; vo.ba += f * hi; vo.lo += f * vo.ba;
        v += vo.ba * vo.env;
      }
      const sw = swellAt(i);
      d[i] = v * (0.35 + sw * 0.6) * 0.5 + (sw > 0.2 && r() < 0.004 * sw ? (r() - 0.5) * 1.5 : 0);
    }
    for (let k = 0; k < 3; k++) {
      const st = Math.floor(ev() * N), len = Math.round(0.45 * sr), f0 = 1800 + ev() * 600;
      let ph = 0;
      for (let i = 0; i < len; i++) { const x = i / len; const f = f0 * (1 + 0.35 * Math.sin(Math.PI * x)); ph += TAU * f / sr; d[(st + i) % N] += 0.05 * Math.sin(Math.PI * x) * Math.sin(ph) * (ch ? 0.7 : 1); }
    }
  } },
  mar: { secs: 13, level: 0.55, fill(d, ch, sr) {
    const r = rng('mar' + ch), N = d.length, aB = onePole(180, sr);
    const waves = [{ at: 0.05, g: 1 }, { at: 0.55, g: 0.75 }];
    let lp = 0, b = 0, foam = 0;
    for (let i = 0; i < N; i++) {
      const w = r() * 2 - 1; b += aB * (w - b);
      let e = 0;
      for (const wv of waves) {
        const x = ((i - wv.at * N + N) % N) / sr;
        e += wv.g * (x < 2.6 ? Math.pow(x / 2.6, 2) : Math.exp(-(x - 2.6) / 1.6));
      }
      const a = onePole(300 + 3200 * Math.min(1, e), sr);
      lp += a * (w - lp);
      foam += 0.05 * ((w - lp) - foam);
      d[i] = lp * e * 0.9 + foam * e * 0.25 + b * 1.6;
    }
  } },
};
function ambBuffer(c, kind) { return cached(c, 'amb-' + kind, c => loopBuffer(c, AMB[kind].secs, 2, AMB[kind].fill)); }

// ---------- Posición del oyente y paneo ----------
const listener = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0 };
function makePanner(c) {
  const p = c.createPanner();
  p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
  p.refDistance = 7; p.rolloffFactor = 1.15; p.maxDistance = 800;
  return p;
}
function setPannerPos(p, v) {
  if (!v) return;
  if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; }
  else p.setPosition(v.x, v.y, v.z);
}

// ---------- Ayudas para disparos temporales ----------
function env(p, t, a, peak, d, floor = 0.0001) {
  p.setValueAtTime(floor, t); p.linearRampToValueAtTime(peak, t + a); p.exponentialRampToValueAtTime(floor, t + a + d);
}
function envHold(p, t, a, peak, hold, rel) {
  p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(peak, t + a); p.setValueAtTime(peak, t + a + hold); p.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
}
class Shot {
  constructor(c, dest) { this.c = c; this.dest = dest; this.nodes = []; this.last = null; this.lastEnd = -1; }
  add(n) { this.nodes.push(n); return n; }
  gain(v = 1, to = this.dest) { const g = this.add(this.c.createGain()); g.gain.value = v; if (to) g.connect(to); return g; }
  filt(type, f, q = 0.7, to = this.dest) { const b = this.add(this.c.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); return b; }
  osc(type, f, t0, t1, to) { const o = this.add(this.c.createOscillator()); o.type = type; o.frequency.value = f; if (to) o.connect(to); o.start(t0); o.stop(t1); this.src(o, t1); return o; }
  noise(t0, t1, to, rate = 1) {
    const s = this.add(this.c.createBufferSource()); s.buffer = noiseBuffer(this.c); s.loop = true; s.playbackRate.value = rate;
    if (to) s.connect(to); s.start(t0, Math.random() * 1.5); s.stop(t1); this.src(s, t1); return s;
  }
  buf(buffer, t0, t1, to, rate = 1) {
    const s = this.add(this.c.createBufferSource()); s.buffer = buffer; s.loop = true; s.playbackRate.value = rate;
    s.connect(to); s.start(t0, Math.random() * buffer.duration * 0.8); s.stop(t1); this.src(s, t1); return s;
  }
  src(n, t1) { if (t1 >= this.lastEnd) { this.lastEnd = t1; this.last = n; } }
  done() {
    const nodes = this.nodes; nodeAlloc(nodes.length);
    if (!this.last) return;
    this.last.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* ya */ } } nodeFree(nodes.length); };
  }
}
function shotOut(c, opts, base = 1, toBus = 'sfx') {
  const s = new Shot(c, null);
  const v = (opts && opts.volume != null ? +opts.volume : 1) * base;
  const g = s.gain(v, null);
  if (opts && opts.position) { const p = s.add(makePanner(c)); setPannerPos(p, opts.position); g.connect(p); p.connect(opts.dest || buses[toBus]); }
  else g.connect(opts && opts.dest ? opts.dest : buses[toBus]);
  s.dest = g;
  return s;
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// ---------- Efectos de sonido ----------
const SFX = {
  click(s, t) {
    const g = s.gain(0); env(g.gain, t, 0.002, 0.22, 0.07);
    const o = s.osc('sine', 1500, t, t + 0.09, g); o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.05);
    const g2 = s.gain(0); env(g2.gain, t, 0.001, 0.05, 0.015); s.osc('triangle', 3200, t, t + 0.03, g2);
  },
  hover(s, t) { const g = s.gain(0); env(g.gain, t, 0.004, 0.045, 0.035); s.osc('sine', 2300, t, t + 0.05, g); },
  compra(s, t) {
    [[1318.5, 0], [1975.5, 0.075], [2637, 0.15]].forEach(([f, dt]) => {
      const g = s.gain(0); env(g.gain, t + dt, 0.002, 0.16, 0.45);
      s.osc('sine', f, t + dt, t + dt + 0.5, g); s.osc('sine', f * 2.76, t + dt, t + dt + 0.25, g);
    });
    const hp = s.filt('highpass', 6000, 0.7); const gn = s.gain(0, hp); env(gn.gain, t, 0.001, 0.12, 0.08); s.noise(t, t + 0.1, gn);
  },
  error(s, t) {
    const lp = s.filt('lowpass', 900, 1);
    [[196, 0, 0.11], [147, 0.14, 0.2]].forEach(([f, dt, du]) => { const g = s.gain(0, lp); envHold(g.gain, t + dt, 0.005, 0.2, du, 0.04); s.osc('square', f, t + dt, t + dt + du + 0.06, g); });
  },
  cuenta(s, t) {
    const lp = s.filt('lowpass', 3500, 0.7); const g = s.gain(0, lp); envHold(g.gain, t, 0.004, 0.26, 0.16, 0.04);
    s.osc('square', 880, t, t + 0.22, g); s.osc('sine', 880, t, t + 0.22, g);
  },
  arranque(s, t) {
    const lp = s.filt('lowpass', 5000, 0.7); const g = s.gain(0, lp); envHold(g.gain, t, 0.004, 0.28, 0.62, 0.12);
    s.osc('square', 1760, t, t + 0.8, g); s.osc('sine', 1760, t, t + 0.8, g); s.osc('sine', 880, t, t + 0.8, g);
  },
  vuelta(s, t) {
    [[1046.5, 0], [1568, 0.09]].forEach(([f, dt]) => { const g = s.gain(0); env(g.gain, t + dt, 0.003, 0.2, 0.45); s.osc('triangle', f, t + dt, t + dt + 0.5, g); s.osc('sine', f * 2, t + dt, t + dt + 0.3, g); });
  },
  meta(s, t) {
    const lp = s.filt('lowpass', 2800, 0.8);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const dt = i * 0.09, hold = i === 3 ? 0.7 : 0.08;
      const g = s.gain(0, lp); envHold(g.gain, t + dt, 0.015, 0.13, hold, 0.25);
      s.osc('sawtooth', f, t + dt, t + dt + hold + 0.3, g); s.osc('sawtooth', f * 1.004, t + dt, t + dt + hold + 0.3, g);
    });
    const ch = [523.25, 659.25, 783.99];
    const g2 = s.gain(0, lp); envHold(g2.gain, t + 0.27, 0.02, 0.08, 0.7, 0.3); ch.forEach(f => s.osc('sawtooth', f / 2, t + 0.27, t + 1.3, g2));
    const hp = s.filt('highpass', 5000); const gc = s.gain(0, hp); env(gc.gain, t + 0.27, 0.002, 0.18, 1.3); s.noise(t + 0.27, t + 1.7, gc);
  },
  muro(s, t) {
    const g = s.gain(0); env(g.gain, t, 0.002, 0.9, 0.28);
    const o = s.osc('sine', 120, t, t + 0.32, g); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const lp = s.filt('lowpass', 1400, 0.8); const gn = s.gain(0, lp); env(gn.gain, t, 0.001, 0.7, 0.2); s.noise(t, t + 0.25, gn);
    const gm = s.gain(0); env(gm.gain, t + 0.005, 0.001, 0.12, 0.35);
    [420, 1130, 2480].forEach(f => s.osc('sine', f * (0.9 + Math.random() * 0.2), t, t + 0.4, gm));
  },
  alcance(s, t) {
    const g = s.gain(0); env(g.gain, t, 0.002, 0.55, 0.16);
    const o = s.osc('sine', 90, t, t + 0.2, g); o.frequency.exponentialRampToValueAtTime(48, t + 0.15);
    const bp = s.filt('bandpass', 800, 1); const gn = s.gain(0, bp); env(gn.gain, t, 0.002, 0.45, 0.1); s.noise(t, t + 0.14, gn);
    const bp2 = s.filt('bandpass', 2600, 2); const gs = s.gain(0, bp2); envHold(gs.gain, t + 0.02, 0.02, 0.18, 0.15, 0.08); s.noise(t, t + 0.3, gs);
  },
  nitro(s, t) {
    const bp = s.filt('bandpass', 300, 1.2); bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3500, t + 0.6);
    const g = s.gain(0, bp); envHold(g.gain, t, 0.06, 0.55, 0.35, 0.5); s.noise(t, t + 1.0, g);
    const hp = s.filt('highpass', 2500); const g2 = s.gain(0, hp); env(g2.gain, t, 0.003, 0.25, 0.12); s.noise(t, t + 0.16, g2);
    const g3 = s.gain(0); envHold(g3.gain, t, 0.05, 0.25, 0.3, 0.4); s.osc('sine', 55, t, t + 0.8, g3);
  },
  cambio(s, t) {
    const bp = s.filt('bandpass', 1800, 1.5); const g = s.gain(0, bp); env(g.gain, t, 0.001, 0.35, 0.025); s.noise(t, t + 0.04, g);
    const g2 = s.gain(0); env(g2.gain, t + 0.008, 0.002, 0.3, 0.06); const o = s.osc('sine', 140, t, t + 0.09, g2); o.frequency.exponentialRampToValueAtTime(85, t + 0.07);
  },
  claxon(s, t, dur = 0.42) {
    const lp = s.filt('lowpass', 3000, 0.7); const bp = s.filt('peaking', 1200, 0.8, lp); bp.gain.value = 6;
    const sh = s.add(s.c.createWaveShaper()); sh.curve = driveCurve(2); sh.connect(bp);
    const g = s.gain(0, sh); envHold(g.gain, t, 0.012, 0.3, dur, 0.05);
    s.osc('sawtooth', 370, t, t + dur + 0.08, g); s.osc('sawtooth', 466, t, t + dur + 0.08, g);
  },
  eliminado(s, t) {
    const lp = s.filt('lowpass', 900, 3);
    const g = s.gain(0, lp);
    const notes = [196, 185, 174.6, 164.8], durs = [0.28, 0.28, 0.28, 0.8];
    const o = s.osc('sawtooth', 196, t, t + 1.8, g);
    let tt = t;
    notes.forEach((f, i) => {
      o.frequency.setValueAtTime(f, tt);
      g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.22, tt + 0.03); g.gain.setValueAtTime(0.22, tt + durs[i] - 0.05); g.gain.linearRampToValueAtTime(0.0001, tt + durs[i]);
      lp.frequency.setValueAtTime(400, tt); lp.frequency.linearRampToValueAtTime(1500, tt + 0.1); lp.frequency.linearRampToValueAtTime(600, tt + durs[i]);
      tt += durs[i];
    });
    const lfo = s.osc('sine', 6, t + 0.84, t + 1.7, null); const lg = s.gain(8, o.frequency); lfo.connect(lg);
  },
  punto(s, t) {
    const lp = s.filt('lowpass', 4500, 0.7);
    [[988, 0, 0.05], [1319, 0.055, 0.14]].forEach(([f, dt, du]) => { const g = s.gain(0, lp); envHold(g.gain, t + dt, 0.002, 0.16, du, 0.05); s.osc('square', f, t + dt, t + dt + du + 0.07, g); });
  },
  cono(s, t) {
    const g = s.gain(0); env(g.gain, t, 0.001, 0.4, 0.09); const o = s.osc('sine', 520, t, t + 0.12, g); o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
    const bp = s.filt('bandpass', 900, 2); const gn = s.gain(0, bp); env(gn.gain, t, 0.001, 0.5, 0.05); s.noise(t, t + 0.07, gn);
    const g2 = s.gain(0); env(g2.gain, t + 0.01, 0.002, 0.2, 0.12); s.osc('sine', 230, t, t + 0.16, g2);
  },
  sirena(s, t, dur = 2.6) {
    const lp = s.filt('lowpass', 2600, 0.7);
    const g = s.gain(0, lp); envHold(g.gain, t, 0.05, 0.16, dur, 0.15);
    const o = s.osc('sawtooth', 950, t, t + dur + 0.25, g); const o2 = s.osc('square', 950, t, t + dur + 0.25, null);
    const g2 = s.gain(0.35, g); o2.connect(g2);
    const lfo = s.osc('triangle', 0.42, t, t + dur + 0.25, null); const lg = s.gain(340, null); lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  },
};

function playSfx(name, opts = {}) {
  const c = ctx;
  if (!running() || !SFX[name]) return;
  const s = shotOut(c, opts);
  SFX[name](s, c.currentTime + 0.005);
  s.done();
}

// Sonido sostenido ('sirena' o 'claxon') → { setPosition(v3), setVolume(v), stop() }
function loopSfx(name, opts = {}) {
  const c = ctx;
  const nil = { setPosition() {}, setVolume() {}, stop() {} };
  if (!running() || (name !== 'sirena' && name !== 'claxon')) return nil;
  const s = new Shot(c, null);
  const out = s.gain(opts.volume != null ? +opts.volume : 1, null);
  let pan = null;
  if (opts.position) { pan = s.add(makePanner(c)); setPannerPos(pan, opts.position); out.connect(pan); pan.connect(buses.sfx); } else out.connect(buses.sfx);
  s.dest = out;
  SFX[name](s, c.currentTime + 0.005, 3600);
  const srcs = s.nodes.filter(n => n instanceof AudioScheduledSourceNode);
  s.done();
  let stopped = false;
  return {
    setPosition(v) { if (pan) setPannerPos(pan, v); },
    setVolume(v) { setP(out.gain, clamp(+v || 0, 0, 2), 0.05, c.currentTime); },
    stop() {
      if (stopped) return; stopped = true;
      const t = c.currentTime; hardSet(out.gain, 0, t);
      for (const n of srcs) { try { n.stop(t + 0.12); } catch { /* ya */ } }
    },
  };
}

// ---------- Voces de motor ----------
const LOCAL_LEVEL = 0.55, REMOTE_LEVEL = 0.7;
class EngineVoice {
  constructor(c, def, opts) {
    this.c = c; this.local = !!opts.local; this.dest = opts.destination || buses.engine;
    const lay = String(def.layout || 'I4').toUpperCase();
    this.ev = lay === 'EV';
    this.layout = this.ev ? 'EV' : (PROFILES[lay] ? lay : 'I4');
    this.P = this.ev ? null : PROFILES[this.layout];
    this.turbo = !!def.turbo && !this.ev && this.local;
    this.userGain = 1; this.load = 0; this.gear = null; this.shiftT = 0; this.limPh = 0; this.limOn = false;
    this.thrPeak = 0; this.prevThr = 0; this.popWin = 0; this.boost = 0; this.bovLatch = false; this.nitroOn = false;
    this.doppler = 1; this.lastT = c.currentTime; this.dead = false; this.far = 1;
    this.pos = null; this.vel = { x: 0, y: 0, z: 0 }; this.posT = 0;
    this.nodes = [];
    const t0 = c.currentTime, mk = n => { this.nodes.push(n); return n; };
    this.out = mk(c.createGain()); this.out.gain.value = 0;
    if (this.local) this.out.connect(this.dest);
    else { this.pan = mk(makePanner(c)); this.out.connect(this.pan); this.pan.connect(this.dest); }
    this.lp = mk(c.createBiquadFilter()); this.lp.type = 'lowpass'; this.lp.connect(this.out);
    if (this.ev) {
      this.o1 = mk(c.createOscillator()); this.o1.type = 'triangle'; this.o1.frequency.value = 70;
      this.o2 = mk(c.createOscillator()); this.o2.type = 'sine'; this.o2.frequency.value = 400;
      this.g2 = mk(c.createGain()); this.g2.gain.value = 0.2;
      this.o1.connect(this.lp); this.o2.connect(this.g2); this.g2.connect(this.lp);
      this.lp.frequency.value = 1200; this.lp.Q.value = 0.7;
      this.o1.start(t0); this.o2.start(t0); this.srcs = [this.o1, this.o2];
    } else {
      const P = this.P;
      this.src = mk(c.createBufferSource()); this.src.buffer = engineBuffer(c, this.layout); this.src.loop = true;
      this.src.playbackRate.value = 0.3;
      this.shaper = mk(c.createWaveShaper()); this.shaper.curve = driveCurve(P.drive); this.shaper.oversample = 'none';
      this.form = mk(c.createBiquadFilter()); this.form.type = 'peaking';
      this.form.frequency.value = P.fHz; this.form.Q.value = P.fQ; this.form.gain.value = P.fDb;
      this.lp.frequency.value = P.lp * 0.4; this.lp.Q.value = P.lpQ;
      this.src.connect(this.shaper); this.shaper.connect(this.form); this.form.connect(this.lp);
      this.src.start(t0, Math.random() * this.src.buffer.duration); this.srcs = [this.src];
    }
    if (this.local) {
      // viento (ruido en pasabanda) y rodado (textura por superficie)
      this.nSrc = mk(c.createBufferSource()); this.nSrc.buffer = noiseBuffer(c); this.nSrc.loop = true;
      this.wF = mk(c.createBiquadFilter()); this.wF.type = 'bandpass'; this.wF.frequency.value = 400; this.wF.Q.value = 0.5;
      this.wG = mk(c.createGain()); this.wG.gain.value = 0;
      this.nSrc.connect(this.wF); this.wF.connect(this.wG); this.wG.connect(this.dest); this.nSrc.start(t0, Math.random());
      this.rG = mk(c.createGain()); this.rG.gain.value = 0; this.rG.connect(this.dest);
      this.surf = 'asfalto'; this.rSrc = mk(this._roadSrc('asfalto', t0));
      this.srcs.push(this.nSrc);
      if (this.turbo) {
        this.tOsc = mk(c.createOscillator()); this.tOsc.type = 'sine'; this.tOsc.frequency.value = 1600;
        this.tG = mk(c.createGain()); this.tG.gain.value = 0;
        this.tOsc.connect(this.tG); this.tG.connect(this.dest); this.tOsc.start(t0); this.srcs.push(this.tOsc);
      }
    }
    nodeAlloc(this.nodes.length);
    this.nodeCount = this.nodes.length;
  }

  _roadSrc(surf, t) {
    const s = this.c.createBufferSource(); s.buffer = roadBuffer(this.c, surf); s.loop = true;
    s.connect(this.rG); s.start(t, Math.random() * s.buffer.duration); return s;
  }
  _setSurface(surf, now) {
    const old = this.rSrc;
    this.surf = surf;
    this.rSrc = this._roadSrc(surf, now + 0.01);
    const i = this.nodes.indexOf(old); if (i >= 0) this.nodes[i] = this.rSrc;
    nodeAlloc(1);
    old.onended = () => { try { old.disconnect(); } catch { /* ya */ } nodeFree(1); };
    old.stop(now + 0.01);
  }

  setGain(g) {
    this.userGain = clamp(+g || 0, 0, 2);
    if (this.userGain === 0 && !this.dead) {
      // la voz deja de recibir update(): silenciar ya
      const now = this.c.currentTime;
      hardSet(this.out.gain, 0, now);
      if (this.local) { hardSet(this.wG.gain, 0, now); hardSet(this.rG.gain, 0, now); if (this.tG) hardSet(this.tG.gain, 0, now); }
    }
  }

  setPosition(v) {
    if (!v || this.dead) return;
    const now = this.c.currentTime;
    if (this.pos) {
      const dt = now - this.posT;
      if (dt > 0.004) {
        const k = 0.35;
        this.vel.x += ((v.x - this.pos.x) / dt - this.vel.x) * k;
        this.vel.y += ((v.y - this.pos.y) / dt - this.vel.y) * k;
        this.vel.z += ((v.z - this.pos.z) / dt - this.vel.z) * k;
        this.pos.x = v.x; this.pos.y = v.y; this.pos.z = v.z; this.posT = now;
      }
    } else { this.pos = { x: v.x, y: v.y, z: v.z }; this.posT = now; }
    if (this.pan) setPannerPos(this.pan, v);
  }

  update(s) {
    if (this.dead || !s) return;
    const c = this.c, now = c.currentTime;
    const dt = clamp(now - this.lastT, 0.001, 0.1); this.lastT = now;
    const thr = clamp(+s.throttle || 0, 0, 1);
    const nitro = s.nitroActive ? 1 : 0;
    const speed = Math.abs(+s.speed || 0);
    this.load += (thr - this.load) * (1 - Math.exp(-(thr > this.load ? 14 : 7) * dt));

    // efecto Doppler y distancia (solo remotos)
    if (!this.local && this.pos) {
      const dx = this.pos.x - listener.x, dy = this.pos.y - listener.y, dz = this.pos.z - listener.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 1) {
        const ux = dx / dist, uy = dy / dist, uz = dz / dist;
        const vs = this.vel.x * ux + this.vel.y * uy + this.vel.z * uz;
        const vl = listener.vx * ux + listener.vy * uy + listener.vz * uz;
        const f = clamp((343 + vl) / (343 + vs), 0.8, 1.25);
        this.doppler += (f - this.doppler) * (1 - Math.exp(-6 * dt));
      }
      this.far = dist > 500 ? 0 : 1;
    }

    if (this.ev) return this._updateEV(s, thr, speed, nitro, dt, now);

    const P = this.P;
    const idle = s.idleRpm > 0 ? s.idleRpm : 850;
    const red = s.redlineRpm > idle + 500 ? s.redlineRpm : Math.max(idle + 2000, 7000);
    const rpm = clamp(+s.rpm || idle, idle * 0.6, red * 1.1);
    const rN = clamp((rpm - idle) / (red - idle), 0, 1);

    // cambio de marcha: caída breve + clic
    const gear = s.gear | 0;
    if (this.gear !== null && gear !== this.gear && gear !== 0 && this.gear !== 0) {
      this.shiftT = 0.085;
      if (this.local) {
        this._click();
        if (this.turbo && gear > this.gear && this.boost > 0.5) this._blowoff(this.boost * 0.5);
      }
    }
    this.gear = gear;
    this.shiftT = Math.max(0, this.shiftT - dt);

    // corte de inyección tartamudeado
    let cut = 1;
    if (rpm >= red * 0.975 && thr > 0.5) {
      const prev = this.limPh % 1;
      this.limPh += dt * (12 + Math.random() * 7);
      const f = this.limPh % 1;
      cut = f < 0.45 ? 0.25 : 1;
      if (this.local && f < prev && Math.random() < 0.18 * P.pops) this._pop(0.45);
    } else this.limPh = 0;

    if (this.local) {
      // petardeos al soltar a rpm altas
      this.thrPeak = Math.max(thr, this.thrPeak - dt * 1.5);
      if (thr < 0.12 && this.prevThr >= 0.4 && rN > 0.4) this.popWin = 0.4 + rN * 1.1;
      if (this.popWin > 0) {
        this.popWin -= dt;
        if (thr < 0.15 && Math.random() < P.pops * 7 * dt * (0.3 + rN)) this._pop(0.4 + Math.random() * 0.6 * rN);
      }
      // turbo: silbido y alivio
      if (this.turbo) {
        const target = thr * clamp((rpm - idle * 1.5) / (red * 0.55), 0, 1);
        this.boost += (target - this.boost) * (1 - Math.exp(-(target > this.boost ? 1.8 : 5) * dt));
        if (thr > 0.5) this.bovLatch = false;
        if (!this.bovLatch && thr < 0.2 && this.thrPeak > 0.6 && this.boost > 0.35) { this.bovLatch = true; this._blowoff(this.boost); }
        setP(this.tOsc.frequency, 1500 + 5600 * this.boost + rN * 500, 0.05, now);
        setP(this.tG.gain, 0.05 * this.boost * (0.25 + 0.75 * thr) * this.userGain * LOCAL_LEVEL, 0.05, now);
      }
      if (nitro && !this.nitroOn) playSfx('nitro', { volume: 0.55 });
      this.nitroOn = !!nitro;
      this._updateBody(s, speed, nitro, now);
    }
    this.prevThr = thr;

    const level = (this.local ? LOCAL_LEVEL : REMOTE_LEVEL) * this.userGain * this.far;
    setP(this.src.playbackRate, (rpm / P.base) * this.doppler, 0.02, now);
    const load = Math.min(1, this.load + nitro * 0.2);
    const fc = P.lp * (0.3 + 0.7 * Math.pow(load, 0.8) + nitro * 0.25) * (0.7 + 0.6 * rN);
    setP(this.lp.frequency, clamp(fc, 180, 16000), 0.03, now);
    const dip = this.shiftT > 0 ? 0.45 : 1;
    const g = P.gain * (0.3 + 0.7 * load) * (0.6 + 0.4 * rN) * (1 + nitro * 0.12) * dip * cut * level;
    setP(this.out.gain, g, cut < 1 || this.shiftT > 0 ? 0.006 : 0.03, now);
  }

  _updateEV(s, thr, speed, nitro, dt, now) {
    const level = (this.local ? LOCAL_LEVEL : REMOTE_LEVEL) * this.userGain * this.far;
    const f = (70 + speed * 19 + this.load * 25) * this.doppler;
    setP(this.o1.frequency, f, 0.03, now);
    setP(this.o2.frequency, f * 2.98 + 300, 0.03, now);
    setP(this.g2.gain, 0.12 + 0.3 * this.load, 0.05, now);
    setP(this.lp.frequency, 700 + 2600 * this.load + speed * 25 + nitro * 1500, 0.05, now);
    const regen = thr < 0.05 && speed > 3 ? 0.06 : 0;
    const g = (0.05 + 0.22 * this.load + 0.12 * clamp(speed / 50, 0, 1) + regen) * (1 + nitro * 0.2) * level * 1.6;
    setP(this.out.gain, g, 0.04, now);
    if (this.local) {
      if (nitro && !this.nitroOn) playSfx('nitro', { volume: 0.55 });
      this.nitroOn = !!nitro;
      this._updateBody(s, speed, nitro, now);
    }
    this.prevThr = thr;
  }

  // viento y rodado del auto local
  _updateBody(s, speed, nitro, now) {
    const wind = clamp(speed / 75, 0, 1.3);
    setP(this.wF.frequency, 350 + speed * 14 + nitro * 1500, 0.1, now);
    setP(this.wG.gain, (0.2 * wind * wind + nitro * 0.06) * this.userGain, 0.08, now);
    const surf = SURF[s.surface] ? s.surface : 'asfalto';
    lastSurface = surf;
    if (surf !== this.surf) this._setSurface(surf, now);
    const onG = s.onGround === false ? 0 : 1;
    setP(this.rSrc.playbackRate, clamp(0.45 + speed / 30, 0.45, 3), 0.08, now);
    const lvl = SURF[surf].level * clamp(speed / 25, 0, 1) * (0.8 + 0.2 * clamp(speed / 60, 0, 1)) * onG * (s.drifting ? 1.25 : 1);
    setP(this.rG.gain, lvl * this.userGain, 0.06, now);
  }

  _click() {
    if (!running()) return;
    const s = shotOut(this.c, { volume: 0.5 * this.userGain, dest: this.dest });
    SFX.cambio(s, this.c.currentTime + 0.003); s.done();
  }
  _pop(k) {
    if (!running()) return;
    const c = this.c, t = c.currentTime + Math.random() * 0.03;
    const s = shotOut(c, { volume: k * this.userGain * LOCAL_LEVEL * 1.6, dest: this.dest });
    const bp = s.filt('bandpass', 400 + Math.random() * 900, 1.4);
    const g = s.gain(0, bp); env(g.gain, t, 0.001, 1, 0.03 + Math.random() * 0.04);
    s.noise(t, t + 0.1, g);
    if (Math.random() < 0.35) { const g2 = s.gain(0, bp); env(g2.gain, t + 0.05, 0.001, 0.7, 0.03); s.noise(t + 0.05, t + 0.12, g2); }
    s.done();
  }
  _blowoff(b) {
    if (!running()) return;
    const c = this.c, t = c.currentTime + 0.01;
    const s = shotOut(c, { volume: clamp(b, 0, 1) * this.userGain * 0.5, dest: this.dest });
    const bp = s.filt('bandpass', 2200 + Math.random() * 900, 0.9);
    const g = s.gain(0, bp);
    if (Math.random() < 0.4) { // «stututu» (flutter)
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 7; i++) { const tt = t + i * 0.05; g.gain.linearRampToValueAtTime(0.5 * (1 - i / 8), tt + 0.012); g.gain.linearRampToValueAtTime(0.05, tt + 0.045); }
      g.gain.linearRampToValueAtTime(0.0001, t + 0.4);
    } else env(g.gain, t, 0.008, 0.6, 0.38);
    s.noise(t, t + 0.45, g, 1.2);
    s.done();
  }

  stop() {
    if (this.dead) return;
    this.dead = true;
    const c = this.c, now = c.currentTime;
    hardSet(this.out.gain, 0, now);
    if (this.local) { hardSet(this.wG.gain, 0, now); hardSet(this.rG.gain, 0, now); if (this.tG) hardSet(this.tG.gain, 0, now); }
    const all = [...this.srcs]; if (this.rSrc) all.push(this.rSrc);
    for (const n of all) { try { n.stop(now + 0.12); } catch { /* ya */ } }
    const nodes = this.nodes.slice();
    setTimeout(() => { for (const n of nodes) { try { n.disconnect(); } catch { /* ya */ } } nodeFree(nodes.length); }, 300);
  }
}
const NULL_ENGINE = { update() {}, setPosition() {}, setGain() {}, stop() {}, nodeCount: 0 };

// ---------- Derrape (auto local) ----------
let skidV = null, lastSurface = 'asfalto', skidTimer = null;
const DIRT = { tierra: 1, grava: 1, arena: 1, pasto: 1, nieve: 1 };
function buildSkid(c) {
  const v = { nodes: [], quiet: 0, last: performance.now() };
  const mk = n => { v.nodes.push(n); return n; }, t = c.currentTime;
  v.out = mk(c.createGain()); v.out.gain.value = 1; v.out.connect(buses.sfx);
  v.bp = mk(c.createBiquadFilter()); v.bp.type = 'bandpass'; v.bp.frequency.value = 1200; v.bp.Q.value = 3;
  v.sqG = mk(c.createGain()); v.sqG.gain.value = 0; v.bp.connect(v.sqG); v.sqG.connect(v.out);
  v.osc = mk(c.createOscillator()); v.osc.type = 'sawtooth'; v.osc.frequency.value = 1100; v.osc.connect(v.bp);
  v.lfo = mk(c.createOscillator()); v.lfo.frequency.value = 7;
  v.lfoG = mk(c.createGain()); v.lfoG.gain.value = 45; v.lfo.connect(v.lfoG); v.lfoG.connect(v.osc.frequency);
  v.nSrc = mk(c.createBufferSource()); v.nSrc.buffer = noiseBuffer(c); v.nSrc.loop = true;
  v.nG = mk(c.createGain()); v.nG.gain.value = 2.5; v.nSrc.connect(v.nG); v.nG.connect(v.bp);
  v.dSrc = mk(c.createBufferSource()); v.dSrc.buffer = roadBuffer(c, 'grava'); v.dSrc.loop = true;
  v.dG = mk(c.createGain()); v.dG.gain.value = 0; v.dSrc.connect(v.dG); v.dG.connect(v.out);
  v.srcs = [v.osc, v.lfo, v.nSrc, v.dSrc];
  for (const s of v.srcs) s.start(t, s.buffer ? Math.random() : undefined);
  nodeAlloc(v.nodes.length);
  return v;
}
function killSkid() {
  if (!skidV) return;
  const v = skidV, now = ctx.currentTime; skidV = null;
  hardSet(v.out.gain, 0, now);
  for (const s of v.srcs) { try { s.stop(now + 0.1); } catch { /* ya */ } }
  setTimeout(() => { for (const n of v.nodes) { try { n.disconnect(); } catch { /* ya */ } } nodeFree(v.nodes.length); }, 250);
  if (skidTimer) { clearInterval(skidTimer); skidTimer = null; }
}
function skid(intensity, surface) {
  if (!running()) return;
  const x = clamp(+intensity || 0, 0, 1);
  if (!skidV) {
    if (x < 0.03) return;
    skidV = buildSkid(ctx);
    // si dejan de llamar a skid(), se apaga solo
    skidTimer = setInterval(() => { if (skidV && performance.now() - skidV.last > 350) killSkid(); }, 200);
  }
  const v = skidV, now = ctx.currentTime, surf = surface || lastSurface;
  v.last = performance.now();
  if (x < 0.03) { v.quiet += 1; if (v.quiet > 45) { killSkid(); return; } } else v.quiet = 0;
  const dirt = !!DIRT[surf], ice = surf === 'hielo';
  const sq = dirt ? x * 0.06 : Math.pow(x, 1.2) * (ice ? 0.1 : 0.3);
  const dg = dirt ? x * 0.6 : (surf === 'piano' ? x * 0.15 : 0);
  const f = 950 + 450 * x + (Math.random() - 0.5) * 120;
  setP(v.osc.frequency, f, 0.05, now); setP(v.bp.frequency, f * 1.05, 0.05, now);
  setP(v.sqG.gain, sq, 0.04, now); setP(v.dG.gain, dg, 0.05, now);
  setP(v.dSrc.playbackRate, 0.7 + x * 0.8, 0.1, now);
  if (Math.random() < 0.05) setP(v.lfo.frequency, 5 + Math.random() * 5, 0.2, now);
}

// ---------- Ambiente ----------
let amb = null;
function ambience(kind) {
  const c = ensureCtx();
  if (!c) return;
  if (kind && !AMB[kind]) kind = null;
  if ((amb ? amb.kind : null) === kind) return;
  const now = c.currentTime;
  if (amb) {
    const o = amb; o.g.gain.cancelScheduledValues(now); o.g.gain.setValueAtTime(o.g.gain.value, now); o.g.gain.setTargetAtTime(0, now, 0.4);
    try { o.src.stop(now + 2); } catch { /* ya */ }
    o.src.onended = () => { o.src.disconnect(); o.g.disconnect(); nodeFree(2); };
  }
  amb = null;
  if (!kind) return;
  const g = c.createGain(); g.gain.value = 0; g.connect(buses.sfx);
  const src = c.createBufferSource(); src.buffer = ambBuffer(c, kind); src.loop = true; src.connect(g);
  src.start(now, Math.random() * src.buffer.duration);
  g.gain.setTargetAtTime(AMB[kind].level, now, 0.6);
  nodeAlloc(2);
  amb = { kind, g, src };
}

// ---------- API pública ----------
export const audio = {
  get ctx() { return ensureCtx(); },
  stats,
  ENGINE_LAYOUTS,

  // En el primer clic/tecla: crea o reanuda el contexto (idempotente).
  unlock() {
    const c = ensureCtx();
    if (!c) return Promise.resolve(false);
    if (c.state === 'running') return Promise.resolve(true);
    return c.resume().then(() => true, () => false);
  },

  setVolumes(v = {}) {
    for (const k of BUS_NAMES) {
      if (v[k] == null || !isFinite(+v[k])) continue;
      vol[k] = clamp(+v[k], 0, 1);
      if (ctx) setP(buses[k].gain, vol[k], 0.03, ctx.currentTime);
    }
  },
  getVolumes() { return { ...vol }; },
  bus(name) { ensureCtx(); return buses[name] || null; },
  // Volumen efectivo de la voz (speechSynthesis no pasa por WebAudio).
  voiceVolume() { return clamp(vol.master * vol.voice, 0, 1); },
  // Baja la música (p. ej. mientras habla el narrador). 1 = normal.
  duckMusic(level = 1) { if (ctx && duckNode) setP(duckNode.gain, clamp(level, 0, 1), level < 1 ? 0.08 : 0.35, ctx.currentTime); },

  // engineDef = { layout, cylinders, turbo }. opts = { local, ctx?, destination? } (ctx/destination solo para pruebas).
  createEngine(engineDef, opts = {}) {
    const c = opts.ctx || ensureCtx();
    if (!c) return NULL_ENGINE;
    if (!opts.destination && !buses.engine) return NULL_ENGINE;
    return new EngineVoice(c, engineDef || {}, opts);
  },

  // Toma posición y orientación de la cámara (THREE.Camera o cualquier objeto con matrixWorld.elements).
  updateListener(camera) {
    if (!ctx || !camera || !camera.matrixWorld) return;
    const e = camera.matrixWorld.elements, L = ctx.listener, now = ctx.currentTime;
    const px = e[12], py = e[13], pz = e[14];
    let fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    const fl = Math.hypot(fx, fy, fz) || 1, ul = Math.hypot(ux, uy, uz) || 1;
    fx /= fl; fy /= fl; fz /= fl; ux /= ul; uy /= ul; uz /= ul;
    const dt = now - listener.t;
    if (dt > 0.004 && dt < 0.5) {
      const k = 0.3;
      listener.vx += ((px - listener.x) / dt - listener.vx) * k;
      listener.vy += ((py - listener.y) / dt - listener.vy) * k;
      listener.vz += ((pz - listener.z) / dt - listener.vz) * k;
    }
    if (dt > 0.004 || dt < 0) { listener.x = px; listener.y = py; listener.z = pz; listener.t = now; }
    if (L.positionX) {
      L.positionX.value = px; L.positionY.value = py; L.positionZ.value = pz;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
      L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
    } else { L.setPosition(px, py, pz); L.setOrientation(fx, fy, fz, ux, uy, uz); }
  },

  // name: 'click','hover','compra','error','cuenta','arranque','vuelta','meta','muro','alcance','nitro',
  //       'cambio','claxon','eliminado','punto','cono','sirena'. opts = { volume, position }
  sfx(name, opts) { try { playSfx(name, opts || {}); } catch (e) { console.warn('sfx', name, e); } },
  // Extra opcional: sonido sostenido 'sirena' | 'claxon' → { setPosition, setVolume, stop }
  loop(name, opts) { return loopSfx(name, opts || {}); },

  skid(intensity, surface) { skid(intensity, surface); },
  ambience(kind) { ambience(kind || null); },

  // Para pruebas/medición
  noiseBuffer(c) { return noiseBuffer(c || ensureCtx()); },
};

// Reanuda el contexto en el primer gesto aunque nadie llame a unlock().
if (typeof window !== 'undefined' && AC) {
  const evs = ['pointerdown', 'keydown', 'touchstart'];
  const h = () => { audio.unlock().then(ok => { if (ok) evs.forEach(e => window.removeEventListener(e, h, true)); }); };
  evs.forEach(e => window.addEventListener(e, h, true));
}
