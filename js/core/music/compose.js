// Teoría y composición: acordes por grados, voicings, melodías con motivos (gancho) y patrones por compás.
// Todo con semilla: la misma canción suena igual para todos y cada estilo conserva su coro.
import { rng } from '../util.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10], harmMinor: [0, 2, 3, 5, 7, 8, 11], phrygDom: [0, 1, 4, 5, 7, 8, 10],
  majPent: [0, 2, 4, 7, 9], minPent: [0, 3, 5, 7, 10],
};
const NUM = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };

// 'bVI', 'iv', 'Imaj7', 'vi7', 'V', 'sus4'… → { root (semitonos desde la tónica), ivs, tok }
const chordCache = new Map();
export function parseChord(tok) {
  let ch = chordCache.get(tok);
  if (ch) return ch;
  const m = /^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/.exec(tok);
  if (!m) throw new Error('acorde inválido: ' + tok);
  const upper = m[2] === m[2].toUpperCase();
  let root = NUM[m[2].toUpperCase()] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
  root = (root + 12) % 12;
  let ivs = upper ? [0, 4, 7] : [0, 3, 7];
  const suf = m[3];
  if (suf.includes('°')) ivs = [0, 3, 6];
  if (suf.includes('sus2')) ivs = [0, 2, 7];
  if (suf.includes('sus4')) ivs = [0, 5, 7];
  if (suf === '5') ivs = [0, 7];
  if (suf.includes('maj7')) ivs = [...ivs, 11];
  else if (/7|9/.test(suf) && !suf.includes('add')) ivs = [...ivs, 10];
  if (suf.includes('9')) ivs = [...ivs, 14];
  ch = { root, ivs, tok };
  chordCache.set(tok, ch);
  return ch;
}
export const chordPcs = (ch, key) => ch.ivs.map(iv => (key + ch.root + iv) % 12);
// Escala ajustada al acorde (p. ej. V mayor en menor → sensible).
export function chordScale(scale, ch, key) {
  const pcs = new Set(scale.map(s => (key + s) % 12));
  for (const pc of chordPcs(ch, key)) {
    if (!pcs.has(pc)) { pcs.delete((pc + 1) % 12); pcs.delete((pc + 11) % 12); pcs.add(pc); }
  }
  return [...pcs];
}
export function pitchesIn(pcs, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(((m % 12) + 12) % 12)) out.push(m);
  return out;
}
function nearest(list, x) { let b = list[0], bd = Infinity; for (const p of list) { const d = Math.abs(p - x); if (d < bd) { bd = d; b = p; } } return b; }
// Voicing cerrado alrededor de un centro (conducción de voces suave sin calcular inversiones).
export function voice(ch, key, center, maxNotes = 4) {
  const out = [];
  for (const iv of ch.ivs.slice(0, maxNotes)) {
    const pc = (key + ch.root + iv) % 12;
    let m = center - 6 + ((pc - (center - 6)) % 12 + 12) % 12;
    out.push(m);
  }
  return out.sort((a, b) => a - b);
}
export function bassRoot(ch, key, lo) { return lo + (((key + ch.root - lo) % 12) + 12) % 12; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// ---------- Melodía ----------
function genRhythm(r, bars, L, densMul = 1) {
  const steps = bars * 16, minD = L.minDur || 1, onsets = [];
  const dens = clamp((L.density || 0.4) * densMul, 0.05, 0.95), sync = L.syncop ?? 0.3;
  const restEnd = Math.max(2, minD * 2);
  for (let i = 0; i < steps - restEnd; i += minD) {
    const w = i % 16 === 0 ? 1 : i % 8 === 0 ? 0.85 : i % 4 === 0 ? 0.65 : i % 2 === 0 ? 0.3 + sync * 0.35 : 0.08 + sync * 0.4;
    const p = i === 0 ? 0.9 : clamp(w * dens * 1.5, 0, 0.96);
    if (r() < p) onsets.push(i);
  }
  if (onsets.length < 2) { onsets.length = 0; onsets.push(0, Math.min(steps - restEnd - minD, 8)); }
  const maxD = L.maxDur || 8;
  return onsets.map((s, k) => {
    const next = k + 1 < onsets.length ? onsets[k + 1] : steps - 1;
    return { s, d: Math.max(1, Math.min(next - s, maxD)) };
  });
}
function genPitches(r, rhythm, chordAt, key, scale, L, center) {
  const lo = L.lo, hi = L.hi, n = rhythm.length, out = [];
  const peakAt = 0.45 + r() * 0.3;
  let prev = center;
  for (let i = 0; i < n; i++) {
    const { s, d } = rhythm[i];
    const ch = chordAt(s), cp = chordPcs(ch, key);
    const strong = s % 4 === 0 || d >= 4 || i === 0;
    const dir = i / Math.max(1, n - 1) < peakAt ? 1 : -1;
    let p;
    if (strong) {
      const opts = pitchesIn(cp, lo, hi);
      let tot = 0;
      const ws = opts.map(q => {
        const iv = q - prev;
        let w = Math.exp(-Math.abs(iv) / (L.leap || 4));
        if (Math.sign(iv) === dir) w *= 1.7;
        if (iv === 0) w *= i === 0 ? 3 : 0.5;
        tot += w; return w;
      });
      let x = r() * tot; p = opts[0];
      for (let k = 0; k < opts.length; k++) { x -= ws[k]; if (x <= 0) { p = opts[k]; break; } }
    } else {
      const sc = pitchesIn(chordScale(scale, ch, key), lo, hi);
      let idx = sc.indexOf(nearest(sc, prev));
      const step = r() < 0.72 ? 1 : 2, sgn = r() < 0.7 ? dir : -dir;
      idx = clamp(idx + step * sgn, 0, sc.length - 1);
      p = sc[idx];
    }
    out.push({ s, d, m: p, ct: strong });
    prev = p;
  }
  return out;
}
// Reacomoda un motivo sobre otros acordes conservando ritmo y contorno (secuencia).
function resnap(motif, chordAtNew, key, scale, L, rootOld, rootNew) {
  let shift = ((rootNew - rootOld) % 12 + 12) % 12; if (shift > 6) shift -= 12;
  let out = motif.map(n => {
    const ch = chordAtNew(n.s), target = n.m + shift;
    const pool = n.ct ? pitchesIn(chordPcs(ch, key), L.lo - 12, L.hi + 12) : pitchesIn(chordScale(scale, ch, key), L.lo - 12, L.hi + 12);
    return { s: n.s, d: n.d, m: nearest(pool, target), ct: n.ct };
  });
  const mx = Math.max(...out.map(n => n.m)), mn = Math.min(...out.map(n => n.m));
  const adj = mx > L.hi + 2 ? -12 : mn < L.lo - 2 ? 12 : 0;
  if (adj) out = out.map(n => ({ ...n, m: n.m + adj }));
  return out;
}
const PLAN8 = ['A', 'A2', 'B', 'B2', 'A', 'A2', 'C', 'E'];
function phrasePlan(n) {
  if (n <= 1) return ['A'];
  if (n === 2) return ['A', 'E'];
  if (n === 3) return ['A', 'B', 'E'];
  if (n === 4) return ['A', 'A2', 'B', 'E'];
  const out = [];
  for (let i = 0; i < n; i++) out.push(PLAN8[i % 8]);
  out[n - 1] = 'E';
  return out;
}
// chords: un acorde por compás. Devuelve [{s (paso absoluto en la sección), d, m, v}]
export function genMelody(r, chords, key, scale, L) {
  const pb = L.phraseBars || 2, nPh = Math.max(1, Math.floor(chords.length / pb));
  const plan = phrasePlan(nPh), motifs = {}, notes = [];
  const center = Math.round((L.lo + L.hi) / 2);
  for (let p = 0; p < nPh; p++) {
    const kind = plan[p], letter = kind === 'E' ? 'A' : kind[0];
    const chordAt = s => chords[Math.min(chords.length - 1, p * pb + Math.floor(s / 16))];
    let ph;
    if (!motifs[letter]) {
      const dm = letter === 'B' ? 1.15 : letter === 'C' ? 0.85 : 1;
      const rhythm = genRhythm(r, pb, L, dm);
      const c0 = letter === 'B' ? center + 3 : letter === 'C' ? center - 2 : center;
      ph = genPitches(r, rhythm, chordAt, key, scale, L, c0);
      motifs[letter] = { notes: ph, root: chordAt(0).root };
    } else {
      ph = resnap(motifs[letter].notes, chordAt, key, scale, L, motifs[letter].root, chordAt(0).root);
    }
    if (kind === 'E' && ph.length) {
      // final: resolver a la tónica (o raíz del acorde) y alargar
      const last = ph[ph.length - 1], ch = chordAt(last.s);
      const tonicOk = chordPcs(ch, key).includes(key % 12);
      const pool = pitchesIn(tonicOk ? [key % 12] : [(key + ch.root) % 12], L.lo, L.hi);
      ph = ph.slice(0, -1).concat([{ ...last, m: nearest(pool, last.m), d: Math.max(last.d, Math.min(8, pb * 16 - last.s - 1)) }]);
    }
    for (const n of ph) notes.push({ s: p * pb * 16 + n.s, d: n.d, m: n.m, v: 0.72 + (n.s % 4 === 0 ? 0.2 : 0) + r() * 0.06 });
  }
  return notes;
}

// ---------- Patrones por compás ----------
// Bajo: devuelve [{s, d, m, v, glide?}] (d en pasos de 16avo)
export const BASS = {
  pulse8(ch, nx, key, lo, r, bar) { const R = bassRoot(ch, key, lo); return Array.from({ length: 8 }, (_, i) => ({ s: i * 2, d: 2, m: i === 7 && bar % 2 ? R + 12 : R, v: i % 2 ? 0.7 : 0.9 })); },
  roll16(ch, nx, key, lo) { const R = bassRoot(ch, key, lo); return Array.from({ length: 16 }, (_, i) => ({ s: i, d: 1, m: i % 4 === 2 ? R + 12 : R, v: [0.95, 0.6, 0.8, 0.6][i % 4] })); },
  octave8(ch, nx, key, lo) { const R = bassRoot(ch, key, lo); return Array.from({ length: 8 }, (_, i) => ({ s: i * 2, d: 2, m: i % 2 ? R + 12 : R, v: i % 2 ? 0.85 : 0.95 })); },
  rock8(ch, nx, key, lo) {
    const R = bassRoot(ch, key, lo), N = nx ? bassRoot(nx, key, lo) : R;
    const ev = Array.from({ length: 8 }, (_, i) => ({ s: i * 2, d: 2, m: R, v: i % 2 ? 0.75 : 0.95 }));
    if (N !== R) { ev[6].m = R + 7; ev[7].m = N + (N > R ? -1 : 1); }
    return ev;
  },
  reese(ch, nx, key, lo, r, bar) { const R = bassRoot(ch, key, lo); return bar % 2 ? [{ s: 0, d: 10, m: R, v: 0.9 }, { s: 10, d: 6, m: R + (r() < 0.5 ? 7 : 12), v: 0.8 }] : [{ s: 0, d: 16, m: R, v: 0.95 }]; },
  sub(ch, nx, key, lo) { return [{ s: 0, d: 16, m: bassRoot(ch, key, lo), v: 0.9 }]; },
  tumbao(ch, nx, key, lo) {
    const R = bassRoot(ch, key, lo), F = R + 7 > lo + 11 ? R - 5 : R + 7;
    return [{ s: 0, d: 4, m: R, v: 0.95 }, { s: 6, d: 2, m: R, v: 0.6 }, { s: 8, d: 4, m: F, v: 0.9 }, { s: 14, d: 2, m: F, v: 0.6 }];
  },
  house(ch, nx, key, lo) { const R = bassRoot(ch, key, lo); return [{ s: 0, d: 3, m: R, v: 0.95 }, { s: 3, d: 1, m: R + 12, v: 0.55 }, { s: 6, d: 2, m: R, v: 0.85 }, { s: 10, d: 2, m: R + 7, v: 0.8 }, { s: 12, d: 3, m: R, v: 0.9 }, { s: 15, d: 1, m: R + 12, v: 0.5 }]; },
  808(ch, nx, key, lo, r, bar) {
    const R = bassRoot(ch, key, lo);
    if (bar % 2) return [{ s: 0, d: 10, m: R, v: 0.95 }, { s: 10, d: 6, m: R + (r() < 0.5 ? 12 : 7), v: 0.9, glide: true }];
    return [{ s: 0, d: 6, m: R, v: 0.95 }, { s: 6, d: 4, m: R, v: 0.8 }, { s: 10, d: 6, m: R, v: 0.85 }];
  },
  boogie(ch, nx, key, lo) {
    const R = bassRoot(ch, key, lo), minor = ch.ivs[1] === 3;
    const ivs = minor ? [0, 3, 7, 9, 10, 9, 7, 3] : [0, 4, 7, 9, 10, 9, 7, 4];
    return ivs.map((iv, i) => ({ s: i * 2, d: 2, m: R + iv, v: i % 2 ? 0.75 : 0.95 }));
  },
  tuba(ch, nx, key, lo) { const R = bassRoot(ch, key, lo); return [{ s: 0, d: 7, m: R, v: 0.95 }, { s: 8, d: 7, m: R + 7 > lo + 11 ? R - 5 : R + 7, v: 0.85 }]; },
};
// Acompañamiento: [{s, d, v}] (el voicing lo pone el reproductor)
export const COMP = {
  stab: () => [[0, 2, 1], [3, 2, 0.8], [6, 2, 0.9], [10, 2, 0.85], [13, 2, 0.8]],
  chug: () => [0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, 2, s === 0 || s === 6 || s === 10 ? 1 : 0.75]),
  power: () => [[0, 6, 1], [6, 4, 0.9], [10, 2, 0.85], [12, 4, 0.9]],
  power8: () => [0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, 2, s % 4 === 0 ? 1 : 0.8]),
  crunch: () => [[0, 3, 1], [3, 3, 0.8], [6, 2, 0.85], [8, 3, 0.95], [11, 3, 0.8], [14, 2, 0.75]],
  skank: () => [2, 6, 10, 14].map(s => [s, 1.5, 0.85]),
  pluckpat: () => [[0, 2, 1], [3, 2, 0.8], [6, 2, 0.9], [10, 2, 0.85], [13, 2, 0.75]],
  epiano: () => [[0, 10, 0.9], [10, 6, 0.6]],
  brass: () => [[0, 5, 1], [6, 1.5, 0.8], [8, 8, 0.95]],
  stabM: (r) => (r() < 0.5 ? [[6, 1, 0.9], [14, 1, 0.8]] : [[6, 1, 0.9], [11, 1, 0.7], [14, 1, 0.8]]),
};
// Arpegios: [{s, d, m, v}]
export const ARP = {
  up16(ch, key, center) {
    const v = voice(ch, key, center, 3), seq = [...v, ...v.map(m => m + 12)];
    return Array.from({ length: 16 }, (_, i) => ({ s: i, d: 1, m: seq[i % seq.length], v: i % 4 === 0 ? 0.9 : 0.65 }));
  },
  updown8(ch, key, center) {
    const v = voice(ch, key, center, 3), seq = [v[0], v[1], v[2], v[0] + 12, v[1] + 12, v[2], v[1], v[0]];
    return seq.map((m, i) => ({ s: i * 2, d: 2, m, v: i % 2 ? 0.6 : 0.8 }));
  },
  bells(ch, key, center, r) {
    const v = voice(ch, key, center + 12, 4);
    return [0, 4, 8, 12].map((s, i) => ({ s, d: 4, m: v[Math.floor(r() * v.length)] + (i === 2 && r() < 0.4 ? 12 : 0), v: 0.55 + r() * 0.2 }));
  },
};

// ---------- Canción ----------
// Genera la lista de secciones con acordes y melodías. idx = número de vuelta (la 0 lleva intro).
export function buildSong(st, idx) {
  const form = idx === 0 ? st.form : (st.loopForm || st.form.filter(n => n !== 'intro'));
  const scale = SCALES[st.scale] || SCALES.minor;
  return form.map((name, i) => {
    const cfg = st.sections[name];
    const seed = cfg.fixed ? `${st.id}:${name}` : `${st.id}:${idx}:${i}:${name}`;
    const r = rng(seed);
    const prog = pick(r, cfg.prog).map(parseChord);
    const cb = cfg.chordBars || st.chordBars || 1;
    const chords = Array.from({ length: cfg.bars }, (_, b) => prog[Math.floor(b / cb) % prog.length]);
    let melody = null;
    if (cfg.lead) {
      const L = { ...st.lead, ...(cfg.leadOpts || {}) };
      const mr = rng(cfg.lead === 'hook' ? `${st.id}:gancho` : `${seed}:mel`);
      melody = genMelody(mr, chords, st.key, scale, L);
    }
    return { name, cfg, bars: cfg.bars, chords, melody, seed };
  });
}
