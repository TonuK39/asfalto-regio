// Instrumentos sintetizados de la música. Cada nota crea pocos nodos temporales que se liberan solos al
// terminar; los filtros compartidos (platillos, tarola, palmas…) son persistentes por reproductor.
import { nodeAlloc, nodeFree, noiseBuffer, driveCurve } from '../audio.js';

export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function finish(nodes, last, onEnd) {
  nodeAlloc(nodes.length);
  last.onended = () => {
    for (const n of nodes) { try { n.disconnect(); } catch { /* ya */ } }
    if (onEnd) { try { onEnd(); } catch { /* ya */ } }
    nodeFree(nodes.length);
  };
}
// Envolvente ataque-sostén-relajación sobre un AudioParam de ganancia.
function asr(p, t, a, peak, hold, rel, sus = 1) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (sus < 1) p.setTargetAtTime(peak * sus, t + a, Math.max(0.02, hold * 0.35));
  else p.setValueAtTime(peak, t + a + Math.max(0, hold));
  p.setTargetAtTime(0.0001, t + a + Math.max(0, hold), rel / 4);
}
function perc(p, t, a, peak, dec) {
  p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(peak, t + a); p.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

const KICKS = {
  punch: { f0: 190, f1: 48, sw: 0.045, dec: 0.32, amp: 1 },
  synth: { f0: 150, f1: 42, sw: 0.06, dec: 0.45, amp: 1 },
  house: { f0: 120, f1: 45, sw: 0.05, dec: 0.38, amp: 0.95 },
  trap: { f0: 170, f1: 52, sw: 0.035, dec: 0.22, amp: 0.85 },
  soft: { f0: 105, f1: 50, sw: 0.05, dec: 0.26, amp: 0.7 },
};
const SNARES = {
  rock: { bp: 1900, q: 0.6, dec: 0.17, body: 185, bodyDec: 0.08, amp: 0.55 },
  gated: { bp: 1500, q: 0.5, dec: 0.3, body: 170, bodyDec: 0.1, amp: 0.5 },
  dnb: { bp: 2500, q: 0.5, dec: 0.12, body: 220, bodyDec: 0.06, amp: 0.55 },
  brush: { bp: 3500, q: 0.4, dec: 0.14, body: 0, bodyDec: 0, amp: 0.32 },
  clap: { bp: 1300, q: 0.9, dec: 0.16, body: 0, bodyDec: 0, amp: 0.5 },
  rim: { bp: 2200, q: 0.8, dec: 0.05, body: 820, bodyDec: 0.03, amp: 0.35 },
  clapsn: { bp: 1800, q: 0.6, dec: 0.16, body: 190, bodyDec: 0.07, amp: 0.5 },
};
const pwCache = new WeakMap();
function organWave(c) {
  let w = pwCache.get(c);
  if (!w) {
    // registros tipo órgano de tubos de tono: fundamental, octava, quinta, doble octava
    const re = new Float32Array(9), im = new Float32Array(9);
    im[1] = 1; im[2] = 0.7; im[3] = 0.45; im[4] = 0.35; im[6] = 0.2; im[8] = 0.15;
    w = c.createPeriodicWave(re, im);
    pwCache.set(c, w);
  }
  return w;
}

export class Kit {
  // bus = { drums, bass, comp, arp, lead, snSend, vib }; cfg = style.kit
  constructor(c, bus, cfg) {
    this.c = c; this.b = bus; this.cfg = cfg;
    this.nodes = [];
    const mk = n => { this.nodes.push(n); return n; };
    const flt = (type, f, q, to) => { const b = mk(c.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(to); return b; };
    this.hatHP = flt('highpass', cfg.hatHz || 7200, 0.8, bus.drums);
    this.cymHP = flt('highpass', 4200, 0.6, bus.drums);
    this.shkBP = flt('bandpass', 6200, 1.1, bus.drums);
    const sn = SNARES[cfg.snare] || SNARES.rock;
    this.sn = sn;
    this.snBP = flt('bandpass', sn.bp, sn.q, bus.drums); this.snBP.connect(bus.snSend);
    this.clapBP = flt('bandpass', 1250, 1.0, bus.drums); this.clapBP.connect(bus.snSend);
    this.K = KICKS[cfg.kick] || KICKS.punch;
    nodeAlloc(this.nodes.length);
  }
  dispose() { for (const n of this.nodes) { try { n.disconnect(); } catch { /* ya */ } } nodeFree(this.nodes.length); this.nodes = []; }

  _noise(t, t1, to, rate = 1) {
    const s = this.c.createBufferSource(); s.buffer = noiseBuffer(this.c); s.loop = true; s.playbackRate.value = rate;
    s.connect(to); s.start(t, Math.random() * 1.8); s.stop(t1); return s;
  }
  _osc(type, f, t, t1, to) { const o = this.c.createOscillator(); o.type = type; o.frequency.value = f; if (to) o.connect(to); o.start(t); o.stop(t1); return o; }
  _gain(v, to) { const g = this.c.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  _filt(type, f, q, to) { const b = this.c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); return b; }

  // ---------- Batería ----------
  kick(t, v) {
    const K = this.K, g = this._gain(0, this.b.drums), o = this._osc('sine', K.f0, t, t + K.dec + 0.03, g);
    o.frequency.setValueAtTime(K.f0, t); o.frequency.exponentialRampToValueAtTime(K.f1, t + K.sw);
    perc(g.gain, t, 0.003, v * K.amp, K.dec);
    finish([o, g], o);
  }
  snare(t, v) {
    const sn = this.sn, g = this._gain(0, this.snBP);
    const dec = sn.dec * (this.cfg.snare === 'gated' ? 1 : 0.9 + v * 0.2);
    if (this.cfg.snare === 'gated') { asr(g.gain, t, 0.002, v * sn.amp, 0.16, 0.05); }
    else perc(g.gain, t, 0.002, v * sn.amp, dec);
    const s = this._noise(t, t + dec + 0.1, g);
    const nodes = [s, g];
    if (sn.body) {
      const g2 = this._gain(0, this.b.drums), o = this._osc('triangle', sn.body, t, t + sn.bodyDec + 0.05, g2);
      perc(g2.gain, t, 0.002, v * 0.4, sn.bodyDec);
      nodes.push(g2, o);
    }
    if (this.cfg.snare === 'clapsn') { this.clap(t, v * 0.7); }
    finish(nodes, s);
  }
  clap(t, v) {
    const g = this._gain(0, this.clapBP), p = g.gain;
    p.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) { const tt = t + i * 0.011; p.linearRampToValueAtTime(v * 0.6, tt + 0.001); p.exponentialRampToValueAtTime(v * 0.08, tt + 0.01); }
    p.linearRampToValueAtTime(v * 0.45, t + 0.035); p.exponentialRampToValueAtTime(0.0001, t + 0.2);
    const s = this._noise(t, t + 0.24, g);
    finish([s, g], s);
  }
  hat(t, v, open = false) {
    const g = this._gain(0, this.hatHP), dec = open ? 0.28 : 0.04 + v * 0.015;
    perc(g.gain, t, 0.001, v * (open ? 0.2 : 0.24), dec);
    const s = this._noise(t, t + dec + 0.03, g);
    finish([s, g], s);
  }
  ride(t, v) {
    const g = this._gain(0, this.hatHP); perc(g.gain, t, 0.001, v * 0.12, 0.45);
    const s = this._noise(t, t + 0.5, g, 0.8);
    const g2 = this._gain(0, this.b.drums), o = this._osc('sine', 3150, t, t + 0.4, g2); perc(g2.gain, t, 0.001, v * 0.025, 0.35);
    finish([s, g, o, g2], s);
  }
  crash(t, v) {
    const g = this._gain(0, this.cymHP); perc(g.gain, t, 0.002, v * 0.2, 1.7);
    const s = this._noise(t, t + 1.8, g, 0.9);
    finish([s, g], s);
  }
  shaker(t, v, long = false) {
    const g = this._gain(0, this.shkBP), dec = long ? 0.14 : 0.05;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.22, t + (long ? 0.03 : 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t + dec + 0.02);
    const s = this._noise(t, t + dec + 0.05, g);
    finish([s, g], s);
  }
  tom(t, v, f) {
    const g = this._gain(0, this.b.drums), o = this._osc('sine', f * 1.5, t, t + 0.4, g);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08); perc(g.gain, t, 0.002, v * 0.6, 0.32);
    finish([o, g], o);
  }
  conga(t, v, hi) {
    const f = hi ? 370 : 250, g = this._gain(0, this.b.drums), o = this._osc('sine', f * 1.12, t, t + 0.22, g);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03); perc(g.gain, t, 0.002, v * 0.38, 0.17);
    finish([o, g], o);
  }
  rim(t, v) {
    const g = this._gain(0, this.b.drums);
    const o1 = this._osc('triangle', 820, t, t + 0.06, g), o2 = this._osc('sine', 1650, t, t + 0.06, g);
    perc(g.gain, t, 0.001, v * 0.28, 0.035);
    finish([o1, o2, g], o2);
  }
  timpani(t, v, m) {
    const f = mtof(m), g = this._gain(0, this.b.drums);
    const o = this._osc('sine', f * 1.03, t, t + 1.3, g), o2 = this._osc('triangle', f * 1.5, t, t + 0.5, null);
    const g2 = this._gain(0.2, g); o2.connect(g2);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
    perc(g.gain, t, 0.004, v * 0.6, 1.1);
    finish([o, o2, g2, g], o);
  }
  // golpe metálico FM (industrial)
  metal(t, v, m, dur = 0.35, to = this.b.drums) {
    const f = mtof(m), g = this._gain(0, to);
    const car = this._osc('sine', f, t, t + dur + 0.1, g), mod = this._osc('sine', f * 1.41, t, t + dur + 0.1, null);
    const mg = this._gain(0, car.frequency); mod.connect(mg);
    mg.gain.setValueAtTime(f * 4, t); mg.gain.exponentialRampToValueAtTime(f * 0.2, t + dur);
    perc(g.gain, t, 0.002, v * 0.22, dur);
    finish([car, mod, mg, g], car);
  }
  riser(t, dur, v) {
    const bp = this._filt('bandpass', 300, 1.4, this.b.lead), g = this._gain(0, bp);
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.35, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    const s = this._noise(t, t + dur + 0.08, g);
    finish([s, g, bp], s);
  }

  // ---------- Bajo ----------
  bass(t, m, dur, v, inst, o = {}) {
    const c = this.c, f = mtof(m), end = t + dur, nodes = [];
    const out = this._gain(0, this.b.bass); nodes.push(out);
    let last;
    if (inst === '808') {
      const sh = c.createWaveShaper(); sh.curve = driveCurve(2.2); sh.connect(out); nodes.push(sh);
      const os = this._osc('sine', f, t, end + 0.15, sh); nodes.push(os); last = os;
      if (o.glideFrom) { os.frequency.setValueAtTime(mtof(o.glideFrom), t); os.frequency.exponentialRampToValueAtTime(f, t + 0.09); }
      else { os.frequency.setValueAtTime(f * 2.4, t); os.frequency.exponentialRampToValueAtTime(f, t + 0.04); }
      out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(v * 0.6, t + 0.005);
      out.gain.setTargetAtTime(v * 0.25, t + 0.05, Math.max(0.15, dur * 0.6)); out.gain.setTargetAtTime(0.0001, end, 0.04);
    } else if (inst === 'reese') {
      const lp = this._filt('lowpass', 500, 2, out); nodes.push(lp);
      lp.frequency.setValueAtTime(420, t); lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(450, end);
      const a = this._osc('sawtooth', f, t, end + 0.12, lp), b = this._osc('sawtooth', f, t, end + 0.12, lp);
      a.detune.value = -14; b.detune.value = 14;
      const sub = this._osc('sine', f, t, end + 0.12, out);
      nodes.push(a, b, sub); last = sub;
      asr(out.gain, t, 0.01, v * 0.3, dur - 0.01, 0.1);
    } else if (inst === 'sub') {
      const os = this._osc('sine', f, t, end + 0.25, out); nodes.push(os); last = os;
      asr(out.gain, t, 0.02, v * 0.5, dur - 0.02, 0.2);
    } else if (inst === 'round') {
      const lp = this._filt('lowpass', 900, 0.8, out), os = this._osc('triangle', f, t, end + 0.12, lp);
      const s2 = this._osc('sine', f, t, end + 0.12, out);
      nodes.push(lp, os, s2); last = s2;
      asr(out.gain, t, 0.005, v * 0.42, dur * 0.85, 0.08, 0.7);
    } else if (inst === 'tuba') {
      const lp = this._filt('lowpass', 400, 1, out), os = this._osc('sawtooth', f, t, end + 0.15, lp);
      lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(900, t + 0.06); lp.frequency.setTargetAtTime(500, t + 0.06, 0.1);
      nodes.push(lp, os); last = os;
      asr(out.gain, t, 0.035, v * 0.4, dur * 0.85, 0.1);
    } else if (inst === 'pick') {
      const sh = c.createWaveShaper(); sh.curve = driveCurve(1.5);
      const lp = this._filt('lowpass', o.cut || 1000, 0.9, out); sh.connect(lp);
      lp.frequency.setValueAtTime((o.cut || 1000) * 2.2, t); lp.frequency.setTargetAtTime(o.cut || 1000, t, 0.05);
      const os = this._osc('sawtooth', f, t, end + 0.08, sh);
      nodes.push(sh, lp, os); last = os;
      asr(out.gain, t, 0.004, v * 0.4, dur * 0.9, 0.05, 0.8);
    } else { // 'saw'
      const cut = o.cut || 600, lp = this._filt('lowpass', cut, 1.2, out), os = this._osc('sawtooth', f, t, end + 0.08, lp);
      lp.frequency.setValueAtTime(cut * 2.6, t); lp.frequency.setTargetAtTime(cut, t, 0.05);
      nodes.push(lp, os); last = os;
      asr(out.gain, t, 0.004, v * 0.4, dur * 0.9, 0.05, 0.85);
    }
    finish(nodes, last);
  }

  // ---------- Acordes ----------
  pad(t, notes, dur, v, o = {}) {
    const end = t + dur, rel = o.release || 0.6, att = Math.min(o.attack || 0.3, dur * 0.6);
    const g = this._gain(0, this.b.comp), lp = this._filt('lowpass', o.cut || 1500, 0.6, g), nodes = [g, lp];
    let last;
    const k = 1 / Math.sqrt(notes.length);
    for (const m of notes) for (const dt of [-8, 8]) { const os = this._osc('sawtooth', mtof(m), t, end + rel + 0.1, lp); os.detune.value = dt; nodes.push(os); last = os; }
    asr(g.gain, t, att, v * 0.13 * k * 2, dur - att, rel);
    finish(nodes, last);
  }
  stab(t, notes, dur, v) {
    const end = t + dur, g = this._gain(0, this.b.comp), lp = this._filt('lowpass', 1200, 1.5, g), nodes = [g, lp];
    lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(1100, t + 0.14);
    let last;
    for (const m of notes) for (const dt of [-10, 10]) { const os = this._osc('sawtooth', mtof(m), t, end + 0.08, lp); os.detune.value = dt; nodes.push(os); last = os; }
    asr(g.gain, t, 0.004, v * 0.32 / Math.sqrt(notes.length), dur * 0.7, 0.06, 0.5);
    finish(nodes, last);
  }
  // guitarra distorsionada: power chord (raíz, quinta, octava) o tríada con «crunch»
  guitar(t, root, dur, v, o = {}) {
    const c = this.c, end = t + dur, g = this._gain(0, this.b.comp);
    const lp = this._filt('lowpass', o.mute ? 1100 : 3200, 0.9, g);
    const sh = c.createWaveShaper(); sh.curve = driveCurve(o.crunch ? 3 : 7); sh.connect(lp);
    const pre = this._gain(o.crunch ? 0.9 : 1.4, sh);
    const ivs = o.triad ? o.triad : [0, 7, 12];
    const nodes = [g, lp, sh, pre];
    let last;
    ivs.forEach((iv, i) => { const os = this._osc('sawtooth', mtof(root + iv), t, end + 0.1, pre); os.detune.value = (i - 1) * 6; nodes.push(os); last = os; });
    if (o.mute) perc(g.gain, t, 0.003, v * 0.3, Math.min(dur, 0.14));
    else asr(g.gain, t, 0.004, v * 0.26, dur * 0.9, 0.08, 0.75);
    finish(nodes, last);
  }
  organ(t, notes, dur, v) {
    const end = t + dur, g = this._gain(0, this.b.comp), nodes = [g], w = organWave(this.c), vib = this.b.vib;
    const oscs = [];
    for (const m of notes) { const os = this._osc('sine', mtof(m), t, end + 0.12, g); os.setPeriodicWave(w); if (vib) vib.connect(os.detune); nodes.push(os); oscs.push(os); }
    asr(g.gain, t, 0.02, v * 0.12 / Math.sqrt(notes.length) * 1.7, dur - 0.02, 0.08);
    finish(nodes, oscs[oscs.length - 1], () => { if (vib) for (const os of oscs) { try { vib.disconnect(os.detune); } catch { /* ya */ } } });
  }
  keys(t, notes, dur, v) {
    const end = t + dur, g = this._gain(0, this.b.comp), lp = this._filt('lowpass', 2600, 0.7, g), nodes = [g, lp];
    let last;
    for (const m of notes) { const os = this._osc('triangle', mtof(m), t, end + 0.2, lp); const sq = this._osc('square', mtof(m), t, end + 0.2, null); const sg = this._gain(0.12, lp); sq.connect(sg); nodes.push(os, sq, sg); last = os; }
    perc(g.gain, t, 0.003, v * 0.3 / Math.sqrt(notes.length), Math.max(0.12, dur));
    finish(nodes, last);
  }
  marimba(t, notes, dur, v, to = this.b.comp) {
    const g1 = this._gain(0, to), g2 = this._gain(0, to), nodes = [g1, g2];
    let last;
    const k = 1 / Math.sqrt(notes.length);
    for (const m of notes) { const f = mtof(m); const a = this._osc('sine', f, t, t + 0.6, g1), b = this._osc('sine', f * 4, t, t + 0.2, g2); nodes.push(a, b); last = a; }
    perc(g1.gain, t, 0.002, v * 0.32 * k, 0.45); perc(g2.gain, t, 0.001, v * 0.08 * k, 0.07);
    finish(nodes, last);
  }
  epiano(t, notes, dur, v) {
    const end = t + dur, g = this._gain(0, this.b.comp), nodes = [g];
    let last;
    for (const m of notes) {
      const f = mtof(m), car = this._osc('sine', f, t, end + 0.5, g), mod = this._osc('sine', f, t, end + 0.5, null);
      const mg = this._gain(0, car.frequency); mod.connect(mg);
      mg.gain.setValueAtTime(f * 1.4, t); mg.gain.setTargetAtTime(f * 0.15, t, 0.25);
      nodes.push(car, mod, mg); last = car;
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.2 / Math.sqrt(notes.length), t + 0.004);
    g.gain.setTargetAtTime(v * 0.06 / Math.sqrt(notes.length), t + 0.01, 0.6); g.gain.setTargetAtTime(0.0001, end, 0.12);
    finish(nodes, last);
  }
  brass(t, notes, dur, v) {
    const end = t + dur, g = this._gain(0, this.b.comp), lp = this._filt('lowpass', 600, 1.2, g), nodes = [g, lp];
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(3200, t + 0.06); lp.frequency.setTargetAtTime(1800, t + 0.06, 0.15);
    let last;
    for (const m of notes) for (const dt of [-6, 6]) { const os = this._osc('sawtooth', mtof(m), t, end + 0.15, lp); os.detune.value = dt; nodes.push(os); last = os; }
    asr(g.gain, t, 0.025, v * 0.26 / Math.sqrt(notes.length), dur * 0.85, 0.1, 0.8);
    finish(nodes, last);
  }
  pluck(t, m, dur, v, o = {}, to = this.b.arp) {
    const f = mtof(m), g = this._gain(0, to), cut = o.cut || 2800;
    const lp = this._filt('lowpass', cut, 2, g), os = this._osc(o.wave || 'sawtooth', f, t, t + dur + 0.3, lp);
    lp.frequency.setValueAtTime(cut, t); lp.frequency.exponentialRampToValueAtTime(380, t + 0.2);
    perc(g.gain, t, 0.002, v * 0.22, Math.max(0.15, dur + 0.1));
    finish([g, lp, os], os);
  }
  bell(t, m, dur, v, ratio = 3.5, to = this.b.lead, decay = 2.2) {
    const f = mtof(m), g = this._gain(0, to);
    const car = this._osc('sine', f, t, t + decay + 0.2, g), mod = this._osc('sine', f * ratio, t, t + decay + 0.2, null);
    const mg = this._gain(0, car.frequency); mod.connect(mg);
    mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + decay * 0.6);
    perc(g.gain, t, 0.003, v * 0.22, decay);
    finish([g, car, mod, mg], car);
  }

  // ---------- Melodía ----------
  lead(t, m, dur, v, inst, o = {}) {
    const c = this.c, f = mtof(m), end = t + dur, to = this.b.lead, vib = this.b.vib;
    if (inst === 'bell') return this.bell(t, m, dur, v, 2, to, 0.7);
    if (inst === 'fmbell') return this.bell(t, m, dur, v * 1.1, 3.5, to, 2.6);
    if (inst === 'metal') return this.metal(t, v * 1.6, m, Math.max(0.18, dur), to);
    if (inst === 'marimba') return this.marimba(t, [m], dur, v * 1.3, to);
    if (inst === 'pluck') return this.pluck(t, m, dur, v * 1.4, {}, to);
    const g = this._gain(0, to), nodes = [g], oscs = [];
    const osc = (type, det = 0, gainTo = null, mult = 1) => {
      const os = this._osc(type, f * mult, t, end + 0.3, gainTo); os.detune.value = det;
      if (o.glideFrom && o.glideFrom !== m) { os.frequency.setValueAtTime(mtof(o.glideFrom) * mult, t); os.frequency.exponentialRampToValueAtTime(f * mult, t + (o.glide || 0.06)); }
      if (vib) vib.connect(os.detune);
      nodes.push(os); oscs.push(os); return os;
    };
    let peak = 0.17, att = 0.01, rel = 0.12;
    if (inst === 'saw') { const lp = this._filt('lowpass', 2600, 1, g); nodes.push(lp); osc('sawtooth', -7, lp); osc('sawtooth', 7, lp); peak = 0.12; }
    else if (inst === 'square') { const lp = this._filt('lowpass', 3000, 0.8, g); nodes.push(lp); osc('square', 0, lp); peak = 0.1; }
    else if (inst === 'super') { const lp = this._filt('lowpass', 4500, 0.7, g); nodes.push(lp); osc('sawtooth', -12, lp); osc('sawtooth', 0, lp); osc('sawtooth', 12, lp); peak = 0.1; att = 0.005; }
    else if (inst === 'accordion') {
      const bp = this._filt('bandpass', 1400, 0.6, g), lp = this._filt('lowpass', 3500, 0.7, g); nodes.push(bp, lp);
      osc('sawtooth', -11, bp); osc('square', 11, lp); peak = 0.2; att = 0.03; rel = 0.08;
    } else if (inst === 'slide' || inst === 'guitar') {
      const lp = this._filt('lowpass', inst === 'slide' ? 2300 : 3300, 1, g), sh = c.createWaveShaper(); sh.curve = driveCurve(inst === 'slide' ? 3 : 6); sh.connect(lp);
      const pre = this._gain(1.2, sh); nodes.push(lp, sh, pre);
      osc('sawtooth', 0, pre); if (inst === 'guitar') osc('square', 8, pre);
      peak = 0.12; att = 0.006; rel = 0.15;
    } else if (inst === 'flute') {
      osc('sine', 0, g); const g2 = this._gain(0.12, g); nodes.push(g2); osc('triangle', 0, g2, 2);
      const bp = this._filt('bandpass', 2200, 1.2, g), ng = this._gain(0, bp); nodes.push(bp, ng);
      const ns = this._noise(t, t + 0.2, ng); nodes.push(ns); perc(ng.gain, t, 0.01, v * 0.5, 0.12);
      peak = 0.22; att = 0.045; rel = 0.12;
    } else if (inst === 'brass') {
      const lp = this._filt('lowpass', 700, 1.2, g); nodes.push(lp);
      lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(3400, t + 0.07); lp.frequency.setTargetAtTime(2200, t + 0.07, 0.2);
      osc('sawtooth', -5, lp); osc('sawtooth', 5, lp); peak = 0.13; att = 0.03;
    } else { const lp = this._filt('lowpass', 2500, 1, g); nodes.push(lp); osc('sawtooth', 0, lp); peak = 0.13; }
    asr(g.gain, t, att, v * peak, Math.max(0.01, dur - att), rel, 0.85);
    const last = oscs[0];
    finish(nodes, last, () => { if (vib) for (const os of oscs) { try { vib.disconnect(os.detune); } catch { /* ya */ } } });
  }
}
