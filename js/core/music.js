// Música original generada en el navegador: un estilo por tema de pista + 'menu' y 'resultados'.
// Planificador con anticipación (setInterval de 25 ms, programa ~0.12 s adelante) y fundido cruzado entre estilos.
// Usa el bus 'music' de audio.js (y su contexto compartido).
import { audio, nodeAlloc, nodeFree } from './audio.js';
import { rng } from './util.js';
import { Kit } from './music/kit.js';
import { STYLES, STYLE_IDS } from './music/styles.js';
import { buildSong, BASS, COMP, ARP, voice, bassRoot } from './music/compose.js';

const LOOKAHEAD = 0.12, TICK_MS = 25;

// ---------- Reverberación compartida (una por contexto) ----------
const revCache = new WeakMap();
function makeIR(c, secs) {
  const sr = c.sampleRate, n = Math.round(secs * sr), b = c.createBuffer(2, n, sr), r = rng('reverb');
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, a = 0.6 - 0.5 * (t / secs); // más oscuro hacia la cola
      lp += a * ((r() * 2 - 1) - lp);
      d[i] = t < 0.012 ? 0 : lp * Math.exp(-t / (secs / 6.9)) * (t < 0.08 ? 1.3 : 1);
    }
  }
  return b;
}
function getReverb(c, dest) {
  let rv = revCache.get(c);
  if (!rv) {
    const conv = c.createConvolver(); conv.buffer = makeIR(c, 2.2);
    const input = c.createGain(), out = c.createGain(); out.gain.value = 0.7;
    input.connect(conv); conv.connect(out); out.connect(dest);
    rv = { input }; revCache.set(c, rv); nodeAlloc(3);
  }
  return rv;
}

// Rellenos de batería para los pasos 8..15 del último compás de cada sección.
const FILLS = {
  rock: { s: 'x.xx....', t: '....1233', k: 'x.......', h: '........', y: '........' },
  roll: { s: 'xxxxXXXX', h: '........' },
  soft: { s: 'g.g.gxgx' },
  dnb: { s: 'x.xx.xXX', k: 'x...x...', h: 'x.x.x.x.', m: '........' },
  trap: { h: 'xrxrrrrr', c: '......xx' },
  march: { s: 'xxxxxxXX', T: '.......x' },
};

class Player {
  constructor(id, c, dest, t0, fadeIn = 1) {
    const st = this.st = STYLES[id];
    this.id = id; this.c = c; this.endAt = 0;
    this.stepDur = 60 / st.bpm / 4;
    const nodes = this.nodes = [];
    const mk = n => { nodes.push(n); return n; };
    const G = (v, to) => { const g = mk(c.createGain()); g.gain.value = v; if (to) g.connect(to); return g; };
    this.out = G(0, dest);
    this.mixLP = mk(c.createBiquadFilter()); this.mixLP.type = 'lowpass'; this.mixLP.frequency.value = 18000; this.mixLP.Q.value = 0.7;
    this.mixLP.connect(this.out);
    const rv = getReverb(c, dest);
    this.revSend = G(0, rv.input);
    this.drums = G(st.mix.drums, this.out);
    this.pump = G(1, this.mixLP);
    this.bass = G(st.mix.bass, this.pump);
    this.comp = G(st.mix.comp, this.pump);
    this.arp = G(st.mix.arp, this.mixLP);
    this.lead = G(st.mix.lead, this.mixLP);
    const snSend = G(st.rev.snare, this.revSend);
    this.comp.connect(G(st.rev.comp, this.revSend));
    this.lead.connect(G(st.rev.lead, this.revSend));
    this.arp.connect(G(st.rev.arp, this.revSend));
    // eco sincronizado (corchea con puntillo)
    this.dly = mk(c.createDelay(2)); this.dly.delayTime.value = this.stepDur * (st.dlySteps || 3);
    const fb = G(0.36, null), fbLP = mk(c.createBiquadFilter()); fbLP.type = 'lowpass'; fbLP.frequency.value = 2800;
    this.dly.connect(fbLP); fbLP.connect(fb); fb.connect(this.dly);
    this.dly.connect(G(0.55, this.mixLP));
    this.lead.connect(G(st.dly.lead, this.dly));
    this.arp.connect(G(st.dly.arp, this.dly));
    // vibrato compartido (en cents)
    this.lfo = mk(c.createOscillator()); this.lfo.frequency.value = 5.4;
    this.vib = G(14, null); this.lfo.connect(this.vib); this.lfo.start(t0);
    nodeAlloc(nodes.length);
    this.kit = new Kit(c, { drums: this.drums, bass: this.bass, comp: this.comp, arp: this.arp, lead: this.lead, snSend, vib: this.vib }, st.kit);
    // fundido de entrada
    for (const [p, v] of [[this.out.gain, st.gain], [this.revSend.gain, 1]]) { p.setValueAtTime(0, t0); p.linearRampToValueAtTime(v, t0 + fadeIn); }
    this.r = rng(id + ':humano');
    this.songIdx = 0; this.song = buildSong(st, 0); this.si = 0; this.bar = 0; this.step = 0; this.next = t0;
    this.ev = null; this.prevBass = null; this.prevLead = null; this.prevLeadEnd = 0;
  }

  schedule(until) {
    const now = this.c.currentTime;
    let guard = 0;
    while (this.next < until && guard++ < 512) {
      if (this.step === 0) this._planBar();
      if (this.next >= now - 0.01) this._playStep(this.step, this.next); // si se atrasó (pestaña congelada) se salta
      this.next += this.stepDur;
      if (++this.step >= 16) { this.step = 0; this._nextBar(); }
    }
  }
  _nextBar() {
    if (++this.bar >= this.song[this.si].bars) {
      this.bar = 0;
      if (++this.si >= this.song.length) { this.songIdx++; this.song = buildSong(this.st, this.songIdx); this.si = 0; }
    }
  }
  _planBar() {
    const st = this.st, sec = this.song[this.si], cfg = sec.cfg, bar = this.bar, key = st.key;
    const ev = this.ev = Array.from({ length: 16 }, () => []);
    const ch = sec.chords[bar], isLast = bar === sec.bars - 1;
    const nextSec = this.song[this.si + 1] || null;
    const nx = !isLast ? sec.chords[bar + 1] : (nextSec || this.song[0]).chords[0];
    // batería del compás (con relleno al final de la sección)
    const row = {};
    for (const k in (cfg.drums || {})) { const line = cfg.drums[k]; const o = (bar * 16) % line.length; row[k] = line.slice(o, o + 16); }
    let fill = false;
    if (isLast && st.fill && cfg.fill !== false && Object.keys(row).length) {
      fill = true;
      const F = FILLS[st.fill] || FILLS.roll;
      for (const k in F) row[k] = (row[k] || '................').slice(0, 8) + F[k];
    }
    for (const k in row) for (let s = 0; s < 16; s++) { const c = row[k][s]; if (c && c !== '.') ev[s].push({ t: 'd', k, c, fill: fill && s >= 8 }); }
    if (bar === 0) {
      if (cfg.crash) { ev[0].push({ t: 'd', k: 'C', c: 'x' }); if (!row.k || row.k[0] === '.') ev[0].push({ t: 'd', k: 'k', c: 'X' }); }
      ev[0].push({ t: 'sweep', mode: cfg.sweep || 'open', bars: sec.bars });
    }
    if (st.riser && nextSec && nextSec.cfg.crash && bar === Math.max(0, sec.bars - 2)) ev[0].push({ t: 'riser', bars: sec.bars - bar });
    // bajo
    if (cfg.bass && BASS[cfg.bass]) {
      const inst = cfg.bassInst || st.bass.inst;
      for (const n of BASS[cfg.bass](ch, nx, key, st.bass.lo, this.r, bar)) ev[n.s].push({ t: 'b', m: n.m, d: n.d, v: n.v, glide: n.glide, inst });
    }
    // acompañamiento
    for (const type of cfg.comp || []) {
      if (type === 'pad' || type === 'organ') {
        if (bar === 0 || sec.chords[bar - 1] !== ch) {
          let nb = 1; while (bar + nb < sec.bars && sec.chords[bar + nb] === ch) nb++;
          ev[0].push({ t: 'c', type, d: nb * 16, v: 0.9, chord: ch });
        }
      } else if (COMP[type]) for (const [s, d, v] of COMP[type](this.r)) ev[s].push({ t: 'c', type, d, v, chord: ch });
    }
    // arpegio
    if (cfg.arp && ARP[cfg.arp]) for (const n of ARP[cfg.arp](ch, key, st.arpCenter || 70, this.r)) ev[n.s].push({ t: 'a', m: n.m, d: n.d, v: n.v, bell: cfg.arp === 'bells' });
    // melodía
    if (sec.melody) {
      const inst = (cfg.leadOpts && cfg.leadOpts.inst) || st.lead.inst;
      for (const n of sec.melody) if ((n.s >> 4) === bar) ev[n.s & 15].push({ t: 'l', m: n.m, d: n.d, v: n.v, inst });
    }
  }
  _playStep(s, t0) {
    const st = this.st, kit = this.kit, sd = this.stepDur, now = this.c.currentTime;
    const t = t0 + (s % 2 ? (st.swing || 0) * sd : 0);
    for (const e of this.ev[s]) {
      const tt = Math.max(now, t + (st.human ? (this.r() - 0.5) * 2 * st.human : 0));
      if (e.t === 'd') this._drum(e, s, tt);
      else if (e.t === 'b') {
        kit.bass(tt, e.m, e.d * sd * 0.95, e.v, e.inst, { cut: st.bass.cut, glideFrom: e.glide ? this.prevBass : null });
        this.prevBass = e.m;
      } else if (e.t === 'c') this._comp(e, tt, e.d * sd);
      else if (e.t === 'a') {
        if (e.bell) kit.bell(tt, e.m, e.d * sd, e.v * 0.6, 3.5, this.arp, 1.8);
        else kit.pluck(tt, e.m, e.d * sd * 0.7, e.v, {}, this.arp);
      } else if (e.t === 'l') {
        const L = st.lead, dur = e.d * sd * (L.gate || 0.9);
        const legato = L.glide && this.prevLead != null && Math.abs(tt - this.prevLeadEnd) < sd * 1.1;
        kit.lead(tt, e.m, dur, e.v, e.inst, { glideFrom: legato ? this.prevLead : null, glide: L.glide });
        this.prevLead = e.m; this.prevLeadEnd = tt + e.d * sd;
      } else if (e.t === 'sweep') {
        const f = this.mixLP.frequency;
        f.cancelScheduledValues(tt);
        if (e.mode === true) { f.setValueAtTime(260, tt); f.exponentialRampToValueAtTime(18000, tt + e.bars * 16 * sd); }
        else if (e.mode === 'dip') f.setTargetAtTime(1500, tt, 0.6);
        else f.setTargetAtTime(18000, tt, 0.15);
      } else if (e.t === 'riser') kit.riser(tt, e.bars * 16 * sd, 0.8);
    }
  }
  _drum(e, s, t) {
    const kit = this.kit, c = e.c, k = e.k, st = this.st;
    let vel = c === 'X' ? 1 : c === 'g' ? 0.3 : 0.8;
    if (e.fill && (st.fill === 'roll' || st.fill === 'march') && k === 's') vel = 0.35 + (s - 8) / 7 * 0.6;
    switch (k) {
      case 'k': kit.kick(t, vel); if (st.pump) this._pump(t); break;
      case 's': kit.snare(t, vel); break;
      case 'c': kit.clap(t, vel); break;
      case 'h':
        if (c === 'o') kit.hat(t, 0.7, true);
        else if (c === 'r') for (let i = 0; i < 3; i++) kit.hat(t + i * this.stepDur / 3, 0.45 + i * 0.12);
        else kit.hat(t, c === 'X' ? 0.85 : c === 'g' ? 0.35 : 0.6);
        break;
      case 'y': kit.ride(t, vel); break;
      case 'g': kit.shaker(t, c === 'X' ? 0.95 : 0.6, c === 'l'); break;
      case 't': if (c === 'h' || c === 'l') kit.conga(t, 0.8, c === 'h'); else kit.tom(t, 0.9, c === '1' ? 200 : c === '2' ? 150 : 110); break;
      case 'm': kit.metal(t, 0.8, st.key + 25); break;
      case 'p': kit.rim(t, vel); break;
      case 'T': kit.timpani(t, 0.9, st.key - 12 + (c === '5' ? 7 : 0)); break;
      case 'C': kit.crash(t, 0.9); break;
    }
  }
  _comp(e, t, dur) {
    const kit = this.kit, st = this.st, ch = e.chord, key = st.key;
    switch (e.type) {
      case 'pad': kit.pad(t, voice(ch, key, st.pad.center, 4), dur, e.v, st.pad); break;
      case 'organ': kit.organ(t, voice(ch, key, st.organCenter || 60, 4), dur, e.v); break;
      case 'stab': kit.stab(t, voice(ch, key, st.stabCenter || 64, 3), dur * 0.8, e.v); break;
      case 'chug': kit.guitar(t, bassRoot(ch, key, st.guitarLo || 40), dur, e.v, { mute: true }); break;
      case 'power': case 'power8': kit.guitar(t, bassRoot(ch, key, st.guitarLo || 40), dur, e.v, {}); break;
      case 'crunch': kit.guitar(t, bassRoot(ch, key, st.guitarLo || 43), dur, e.v, { crunch: true, triad: [0, ch.ivs[1], 7, 12] }); break;
      case 'skank': kit.keys(t, voice(ch, key, st.keysCenter || 64, 3), dur, e.v); break;
      case 'pluckpat': kit.marimba(t, voice(ch, key, st.marimbaCenter || 69, 3), dur, e.v); break;
      case 'epiano': kit.epiano(t, voice(ch, key, st.epCenter || 60, 4), dur, e.v); break;
      case 'brass': kit.brass(t, voice(ch, key, st.brassCenter || 62, 3), dur, e.v); break;
      case 'stabM': for (const m of voice(ch, key, st.stabCenter || 60, 2)) kit.metal(t, e.v * 0.9, m, 0.25, this.comp); break;
    }
  }
  _pump(t) {
    const p = this.pump.gain, d = this.st.pump;
    p.setTargetAtTime(1 - d, t, 0.006);
    p.setTargetAtTime(1, t + 0.04, this.stepDur * 1.1);
  }
  fadeOut(dur) {
    const now = this.c.currentTime;
    for (const p of [this.out.gain, this.revSend.gain]) { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(0, now + dur); }
    this.endAt = now + dur + 0.05;
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    try { this.lfo.stop(); } catch { /* ya */ }
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* ya */ } }
    nodeFree(this.nodes.length);
    this.kit.dispose();
  }
}

// ---------- Planificador global ----------
const players = new Set();
let current = null, timer = null;
function tick() {
  const c = audio.ctx;
  if (!c) return;
  const look = typeof document !== 'undefined' && document.hidden ? 1.5 : LOOKAHEAD;
  for (const p of players) {
    if (p.endAt && c.currentTime > p.endAt) { players.delete(p); setTimeout(() => p.dispose(), 4000); continue; }
    try { p.schedule(c.currentTime + look); } catch (e) { console.warn('música', e); players.delete(p); }
  }
  if (!players.size && timer) { clearInterval(timer); timer = null; }
}

export const music = {
  // style: tema de pista ('autodromo','neon','puerto','montana','desierto','aerodromo','ovalo','costa','nieve') o 'menu'/'resultados'
  play(style) {
    if (!STYLES[style]) style = 'menu';
    const c = audio.ctx;
    if (!c) return;
    if (current && current.id === style && !current.endAt) return;
    const fade = current ? 1.6 : 0.8;
    if (current) current.fadeOut(fade);
    const t0 = c.currentTime + 0.06;
    current = new Player(style, c, audio.bus('music'), t0, style === 'resultados' ? 0.3 : fade);
    players.add(current);
    if (!timer) timer = setInterval(tick, TICK_MS);
    tick();
  },
  stop() { if (current) { current.fadeOut(1.0); current = null; } },
  setVolume(v) { audio.setVolumes({ music: v }); },

  // Extras (opcionales)
  get current() { return current ? current.id : null; },
  styles: STYLE_IDS.map(id => ({ id, name: STYLES[id].name, bpm: STYLES[id].bpm })),
  // Mide el costo: renderiza `seconds` del estilo en un OfflineAudioContext. → { ms, ratio, rms, peak }
  async renderOffline(style, seconds = 8, sampleRate = 44100, extra = null) {
    const off = new OfflineAudioContext(2, Math.round(seconds * sampleRate), sampleRate);
    const p = new Player(style, off, off.destination, 0.02, 0.01);
    const win = 0.25;
    for (let t = win; t < seconds - 0.01; t += win) {
      const tt = t;
      off.suspend(tt).then(() => { p.schedule(tt + win + LOOKAHEAD); if (extra) extra(off, tt); off.resume(); });
    }
    p.schedule(win + LOOKAHEAD);
    if (extra) extra(off, 0);
    const t0 = performance.now();
    const buf = await off.startRendering();
    const ms = performance.now() - t0;
    let s = 0, pk = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { const v = d[i]; s += v * v; const a = Math.abs(v); if (a > pk) pk = a; } }
    p.dispose();
    return { ms, seconds, ratio: ms / (seconds * 1000), rms: Math.sqrt(s / (buf.length * buf.numberOfChannels)), peak: pk, buffer: buf };
  },
};
