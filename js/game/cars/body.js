// Carrocerías procedurales: perfil lateral por tipo + secciones transversales unidas (loft) con arcos de
// rueda, más luces, alerones, bodykit, rasgos de cada modelo, interior y el monoplaza de Fórmula.
import * as THREE from 'three';
import { GeoBuf, hexa, box, beam, cyl, fromGeometry } from './geom.js';
import { ATLAS, PAL, palUV } from './textures.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// Fracciones del largo (ws parabrisas, rf techo adelante, rb techo atrás, rw fin del medallón) y de la altura.
export const TYPES = {
  sedan: { foh: 0.47, nose: 0.5, hood: 0.64, ws: 0.32, rf: 0.45, rb: 0.67, rw: 0.79, deck: 0.66, tail: 0.63, roofW: 0.8, clear: 0.15, noseCurve: 1.6, sw: 'rb', bp: true },
  hatch: { foh: 0.52, nose: 0.5, hood: 0.63, ws: 0.3, rf: 0.43, rb: 0.8, rw: 0.95, deck: 0.7, tail: 0.68, roofW: 0.82, clear: 0.14, noseCurve: 1.5, sw: 'rb', rwCurve: 1, tailW: 0.93 },
  coupe: { foh: 0.5, nose: 0.47, hood: 0.6, ws: 0.35, rf: 0.5, rb: 0.64, rw: 0.82, deck: 0.64, tail: 0.62, roofW: 0.76, clear: 0.13, sw: 0.35 },
  fastback: { foh: 0.48, nose: 0.47, hood: 0.6, ws: 0.33, rf: 0.47, rb: 0.6, rw: 0.88, deck: 0.66, tail: 0.64, roofW: 0.76, clear: 0.14, sw: 0.4 },
  muscle: { foh: 0.48, nose: 0.6, hood: 0.66, ws: 0.41, rf: 0.53, rb: 0.65, rw: 0.85, deck: 0.68, tail: 0.66, roofW: 0.74, clear: 0.14, noseCurve: 1.2, hoodCrown: 0.02, sw: 0.25 },
  gt: { foh: 0.45, nose: 0.44, hood: 0.6, ws: 0.45, rf: 0.57, rb: 0.69, rw: 0.88, deck: 0.62, tail: 0.6, roofW: 0.72, clear: 0.12, noseCurve: 2, sw: 0.3 },
  medio: { foh: 0.5, nose: 0.38, hood: 0.54, ws: 0.28, rf: 0.44, rb: 0.58, rw: 0.74, deck: 0.66, tail: 0.63, roofW: 0.7, hoodCrown: -0.02, clear: 0.11, noseCurve: 1.8, waist: 0.95, sw: 0.1 },
  cuna: { foh: 0.5, nose: 0.3, hood: 0.5, ws: 0.25, rf: 0.45, rb: 0.58, rw: 0.73, deck: 0.64, tail: 0.62, roofW: 0.68, hoodCrown: -0.03, clear: 0.1, noseCurve: 1.1, waist: 0.95, sw: 0.1 },
  hiper: { foh: 0.5, nose: 0.33, hood: 0.52, ws: 0.27, rf: 0.45, rb: 0.58, rw: 0.75, deck: 0.64, tail: 0.6, roofW: 0.68, hoodCrown: -0.03, clear: 0.1, noseCurve: 1.6, waist: 0.94, sw: 0.1 },
  pickup: { foh: 0.4, nose: 0.6, hood: 0.64, ws: 0.27, rf: 0.33, rb: 0.53, rw: 0.545, deck: 0.64, tail: 0.64, roofW: 0.86, clear: 0.24, noseCurve: 1, hoodCrown: 0.01, deckCrown: 0, noseW: 0.95, tailW: 0.98, waist: 1, sw: 'rb', bp: true, tailCurve: 6 },
  vocho: { foh: 0.52, nose: 0.42, hood: 0.6, ws: 0.36, rf: 0.45, rb: 0.6, rw: 0.84, deck: 0.5, tail: 0.38, roofW: 0.76, clear: 0.17, noseCurve: 2.5, hoodCrown: 0.04, roofArc: 0.03, narrow: 0.84, rwCurve: 1.8, sw: 0.15 },
  mini: { foh: 0.48, nose: 0.52, hood: 0.6, ws: 0.27, rf: 0.33, rb: 0.86, rw: 0.93, deck: 0.6, tail: 0.6, roofW: 0.88, clear: 0.13, noseCurve: 1.4, hoodCrown: 0.02, sw: 'rb', rwCurve: 1, tailCurve: 4 },
  p911: { foh: 0.42, nose: 0.42, hood: 0.56, ws: 0.33, rf: 0.47, rb: 0.6, rw: 0.88, deck: 0.62, tail: 0.55, roofW: 0.72, hoodCrown: -0.035, clear: 0.12, noseCurve: 2.2, rwCurve: 1.6, sw: 0.4 },
};
const DEF = { noseW: 0.86, tailW: 0.9, waist: 0.985, hoodCrown: 0.015, deckCrown: 0.012, roofDrop: 0.02, roofArc: 0, rwCurve: 1.2, tailCurve: 2, noseCurve: 1.5, narrow: 1 };

export class Profile {
  constructor(def, cu) {
    const b = def.body;
    this.def = def; this.type = b.type;
    const P = this.P = { ...DEF, ...(TYPES[b.type] || TYPES.coupe), ...(b.prof || {}) };
    this.traits = new Set(b.traits || []);
    this.L = b.length; this.W = b.width; this.H = b.height; this.wb = b.wheelbase;
    this.R = b.wheelRadius; this.Rr = b.rearRadius || b.wheelRadius;
    this.hw = this.W / 2 * P.narrow;
    const oh = this.L - this.wb;
    this.zF = -this.wb / 2 - oh * P.foh; this.zR = this.zF + this.L;
    this.c = P.clear - (cu.ride || 0) * 0;   // la altura (ride) baja la carrocería completa, no el perfil
    this.Hmax = this.H + 0.05;
    const H = this.H;
    this.yNose = H * P.nose; this.yHood = H * P.hood; this.yDeck = H * P.deck; this.yTail = H * P.tail; this.yRoof = H;
    this.fFA = this.f(-this.wb / 2); this.fRA = this.f(this.wb / 2);
    const wide = this.traits.has('wideHips');
    this.wpts = [[0, P.noseW], [0.05, 0.95], [this.fFA, wide ? 0.9 : 0.99], [(this.fFA + this.fRA) / 2, wide ? 0.88 : P.waist], [this.fRA, 1], [0.95, 0.97], [1, P.tailW]];
    // B-pilar y fin de ventanas laterales
    this.swEnd = P.sw === 'rb' ? P.rb - 0.008 : P.rb + (P.rw - P.rb) * P.sw;
    const doors = b.doors || 2;
    this.doors = doors;
    this.bp = null;
    if (doors === 4) this.bp = P.ws + (this.swEnd - P.ws) * 0.52;
    else if (P.bp || ['coupe', 'fastback', 'muscle', 'hatch', 'gt', 'mini', 'p911'].includes(b.type)) this.bp = P.ws + (this.swEnd - P.ws) * 0.7;
    this.bpw = 0.045 / this.L;
    this.doorEnd = doors === 4 ? Math.min(this.swEnd, P.rb + 0.01) : (this.bp || P.rb);
    // llantas y ejes
    const tier = def.tier || 2, pos = def.engine.pos;
    let tw = clamp(0.155 + 0.02 * tier, 0.15, 0.27);
    if (b.type === 'vocho') tw = 0.15; if (b.type === 'mini') tw = 0.14; if (b.type === 'pickup') tw = 0.27;
    let twR = tw * (pos === 'M' || pos === 'R' || tier >= 4 ? 1.18 : 1.0);
    if (b.type === 'monoplaza') { tw = 0.3; twR = 0.4; }
    const kit = cu.bodykit || 0;
    const stance = (kit >= 2 ? 0.035 : 0) + (this.traits.has('flares') ? 0.02 : 0);
    this.axles = [
      this.axle(-this.wb / 2, this.R, tw, true, stance),
      this.axle(this.wb / 2, this.Rr, twR, false, stance),
    ];
  }
  axle(z, R, tw, front, stance) {
    const f = this.f(z);
    const hwA = this.type === 'vocho' ? this.W / 2 : this.HW(f);
    const halfTrack = hwA - tw / 2 - (this.type === 'vocho' ? 0.035 : 0.012) + stance;
    return { z, f, R, tw, front, yc: R, Ra: R + 0.055, halfTrack, innerX: Math.min(halfTrack - tw / 2 - 0.03, this.HW(f) * 0.8) };
  }
  z(f) { return this.zF + f * this.L; }
  f(z) { return (z - this.zF) / this.L; }
  HW(f) {
    const p = this.wpts;
    for (let i = 1; i < p.length; i++) if (f <= p[i][0]) { const t = (f - p[i - 1][0]) / Math.max(1e-6, p[i][0] - p[i - 1][0]); return this.hw * lerp(p[i - 1][1], p[i][1], clamp(t, 0, 1)); }
    return this.hw * p[p.length - 1][1];
  }
  E(f) {
    const P = this.P;
    if (f <= P.ws) return this.yNose + (this.yHood - this.yNose) * (1 - Math.pow(1 - clamp(f / P.ws, 0, 1), P.noseCurve));
    if (f <= P.rw) return lerp(this.yHood, this.yDeck, (f - P.ws) / (P.rw - P.ws));
    return this.yDeck + (this.yTail - this.yDeck) * Math.pow(clamp((f - P.rw) / (1 - P.rw), 0, 1), P.tailCurve);
  }
  T(f) {
    const P = this.P, H = this.H;
    const crownF = P.hoodCrown * H * (f < 0.03 ? f / 0.03 * 0.5 + 0.5 : 1);
    if (f <= P.ws) return this.E(f) + crownF;
    if (f <= P.rf) { const a = this.E(P.ws) + P.hoodCrown * H; return lerp(a, this.yRoof, (f - P.ws) / (P.rf - P.ws)); }
    const roofAt = ff => { const t = clamp((ff - P.rf) / (P.rb - P.rf), 0, 1); return this.yRoof - P.roofDrop * H * t + P.roofArc * H * Math.sin(Math.PI * t); };
    if (f <= P.rb) return roofAt(f);
    if (f <= P.rw) { const b = roofAt(P.rb), d = this.E(P.rw) + P.deckCrown * H; return b + (d - b) * Math.pow((f - P.rb) / (P.rw - P.rb), P.rwCurve); }
    return this.E(f) + P.deckCrown * H;
  }
  K(f) {
    const P = this.P;
    if (f <= P.ws || f >= P.rw) return 0;
    if (f < P.rf) return (f - P.ws) / (P.rf - P.ws);
    if (f <= P.rb) return 1;
    return (P.rw - f) / (P.rw - P.rb);
  }
  archAt(z) {
    let y = -1, inX = 1e9;
    for (const a of this.axles) {
      const dz = z - a.z;
      if (Math.abs(dz) <= a.Ra + 0.001) { const yy = a.yc + Math.sqrt(Math.max(0, a.Ra * a.Ra - dz * dz)); if (yy > y) { y = yy; inX = a.innerX; } }
    }
    return { y, inX };
  }
  // Media sección (x ≥ 0) en f: 9 puntos de abajo al centro de arriba.
  section(f) {
    const z = this.z(f), c = this.c, hw = this.HW(f), e = this.E(f), t = this.T(f), k = this.K(f);
    const arch = this.archAt(z);
    const pts = [];
    pts[0] = [0, c];
    if (arch.y > 0) { pts[1] = [Math.min(hw * 0.72, arch.inX), arch.y]; pts[2] = [hw * 0.985, arch.y]; }
    else { pts[1] = [hw * 0.72, c]; pts[2] = [hw * 0.97, c + 0.06]; }
    let ey = e, p3y = c + (e - c) * 0.45;
    if (arch.y > 0) { p3y = Math.max(p3y, arch.y + 0.025); ey = Math.max(e, arch.y + 0.05); }
    pts[3] = [hw, p3y];
    pts[4] = [hw * 0.975, ey];
    const hy = xf => ey + (t - ey) * (1 - xf * xf);
    const H5 = [hw * 0.93, hy(0.93)], H6 = [hw * 0.72, hy(0.72)], H7 = [hw * 0.4, hy(0.4)];
    const bw = hw * 0.945, rw = this.HW(f) * this.P.roofW;
    const C5 = [bw, ey + 0.015], C6 = [rw + (bw - rw) * 0.08, Math.max(ey + 0.03, t - 0.05)], C7 = [rw * 0.84, t - 0.012];
    pts[5] = [lerp(H5[0], C5[0], k), lerp(H5[1], C5[1], k)];
    pts[6] = [lerp(H6[0], C6[0], k), lerp(H6[1], C6[1], k)];
    pts[7] = [lerp(H7[0], C7[0], k), lerp(H7[1], C7[1], k)];
    pts[8] = [0, t];
    if (f <= 0 || f >= 1) {
      const ym = (c + t) / 2, sx = f <= 0 ? 0.86 : 0.9;
      for (const p of pts) { p[0] *= sx; p[1] += (ym - p[1]) * 0.12; }
    }
    return pts;
  }
  // Altura de la superficie superior en (f, x).
  topY(f, x) {
    const p = this.section(f);
    x = Math.abs(x);
    for (let i = 4; i < 8; i++) {
      const a = p[i], b = p[i + 1];
      if (x <= a[0] && x >= b[0]) return lerp(b[1], a[1], (x - b[0]) / Math.max(1e-6, a[0] - b[0]));
    }
    return x > p[4][0] ? p[4][1] : p[8][1];
  }
  stations() {
    const P = this.P, out = [];
    const add = f => { if (f >= 0 && f <= 1) out.push(f); };
    [0, 0.012, 0.05, 0.95, 0.988, 1].forEach(add);
    [P.ws, (P.ws + P.rf) / 2, P.rf, (P.rf + P.rb) / 2, P.rb, (P.rb + P.rw) / 2, P.rw, this.swEnd].forEach(add);
    if (P.roofArc) for (const t of [0.25, 0.75]) { add(lerp(P.rf, P.rb, t)); add(lerp(P.rb, P.rw, t)); add(lerp(P.ws, P.rf, t)); }
    if (P.rwCurve > 1.3) for (const t of [0.25, 0.75]) add(lerp(P.rb, P.rw, t));
    if (P.noseCurve > 1.9) for (const t of [0.3, 0.6]) add(P.ws * t);
    if (this.bp) { add(this.bp - this.bpw); add(this.bp + this.bpw); }
    for (const a of this.axles) {
      for (let d = 0; d <= 180; d += 45) add(this.f(a.z + a.Ra * Math.cos(d * Math.PI / 180)));
      add(this.f(a.z - a.Ra - 0.01)); add(this.f(a.z + a.Ra + 0.01));
    }
    out.sort((a, b) => a - b);
    const res = [];
    for (const f of out) if (!res.length || f - res[res.length - 1] > 0.0006) res.push(f);
    for (let i = 1; i < res.length; i++) if (res[i] - res[i - 1] > 0.12) { res.splice(i, 0, (res[i] + res[i - 1]) / 2); i--; }
    return res;
  }
}

// ───────────────────────── Construcción de la carrocería ─────────────────────────
const C = {
  under: '#121214', black: '#16171a', chrome: '#d6dbe0', rubber: '#1a1a1a', carbon: '#232529', grey: '#6b7078',
};

export function buildBody(ctx) {
  const { Pf, bufs, cu } = ctx;
  const P = Pf.P, tr = Pf.traits;
  const { paint, trim, glass, lights } = bufs;
  const st = Pf.stations();
  const rings = st.map(f => ({ f, z: Pf.z(f), k: Pf.K(f), p: Pf.section(f), t: Pf.T(f) }));
  const tintSide = cu.tint || 0;
  const sideRGBA = [1 - 0.8 * tintSide, 1 - 0.8 * tintSide, 1 - 0.75 * tintSide, 0.42 + 0.5 * tintSide];
  const frontRGBA = [1, 1, 1, 0.16];
  const soft = tr.has('softTop');
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    const fm = (A.f + B.f) / 2, kA = (A.k + B.k) / 2;
    const ref = [0, (Pf.c + (A.t + B.t) / 2) / 2, (A.z + B.z) / 2];
    for (let j = 0; j < 8; j++) {
      let buf = paint;
      if (j <= 1) { buf = trim; trim.setColor(C.under); }
      else if (j === 5 && kA > 0.02 && fm > P.ws && fm < Pf.swEnd) {
        if (Pf.bp && Math.abs(fm - Pf.bp) < Pf.bpw) { buf = trim; trim.setColor(C.black); }
        else { buf = glass; glass.setColor(sideRGBA); }
      } else if (j === 7 && kA > 0 && A.f >= P.ws - 1e-9 && B.f <= P.rf + 1e-9) { buf = glass; glass.setColor(frontRGBA); }
      else if (j === 7 && kA > 0 && A.f >= P.rb - 1e-9 && B.f <= P.rw + 1e-9) { buf = glass; glass.setColor(sideRGBA); }
      else if (soft && (j === 6 || j === 7) && fm > P.rf && fm < P.rb) { buf = trim; trim.setColor(C.black); }
      const a0 = A.p[j], a1 = A.p[j + 1], b0 = B.p[j], b1 = B.p[j + 1];
      for (const s of [1, -1]) {
        buf.quad([s * a0[0], a0[1], A.z], [s * a1[0], a1[1], A.z], [s * b1[0], b1[1], B.z], [s * b0[0], b0[1], B.z], ref);
      }
    }
  }
  // tapas delantera y trasera
  for (const R of [rings[0], rings[rings.length - 1]]) {
    const cy = (Pf.c + R.t) / 2, ctr = [0, cy, R.z], ref = [0, cy, R.z + (R === rings[0] ? 1 : -1)];
    for (let j = 0; j < 8; j++) for (const s of [1, -1]) paint.tri(ctr, [s * R.p[j][0], R.p[j][1], R.z], [s * R.p[j + 1][0], R.p[j + 1][1], R.z], ref);
  }
  if (Pf.type === 'vocho') vochoExtras(ctx);
  addLights(ctx);
  addTrimDetails(ctx);
  addTraits(ctx);
  addSpoiler(ctx, cu.spoiler);
  addBodykit(ctx, cu.bodykit || 0);
}

function slopeAt(Pf, f, d = 0.03) { return Math.atan2(Pf.E(Math.min(1, f + d)) - Pf.E(f), d * Pf.L); }

function vochoExtras(ctx) {
  const { Pf, bufs } = ctx, { paint, trim } = bufs;
  const xIn = Pf.HW(0.5) * 0.97, xOut = Pf.W / 2;
  for (const a of Pf.axles) {
    const z0 = a.z - a.Ra - (a.front ? 0.28 : 0.12), z1 = a.z + a.Ra + (a.front ? 0.1 : 0.3);
    const yTop = a.yc + a.Ra + 0.07, rings = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n, z = lerp(z0, z1, t), q = Math.pow(Math.sin(Math.PI * t), 0.55);
      const dz = z - a.z;
      const yb = Math.abs(dz) <= a.Ra ? a.yc + Math.sqrt(a.Ra * a.Ra - dz * dz) : a.yc * 0.8;
      const yt = Math.max(yb + 0.01, lerp(yb, yTop, q));
      rings.push([[xIn, yb, z], [xOut, yb + 0.01, z], [xOut - 0.01, lerp(yb, yt, 0.7), z], [(xIn + xOut) / 2 + 0.02, yt, z], [xIn, yt * 0.98 + yb * 0.02, z]]);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) for (const s of [1, -1]) {
      const A = rings[i], B = rings[i + 1];
      const ref = [s * xIn, a.yc, (A[0][2] + B[0][2]) / 2];
      paint.quad([s * A[j][0], A[j][1], A[j][2]], [s * A[j + 1][0], A[j + 1][1], A[j + 1][2]], [s * B[j + 1][0], B[j + 1][1], B[j + 1][2]], [s * B[j][0], B[j][1], B[j][2]], ref);
    }
    a.pod = { xMid: (xIn + xOut) / 2, yTop, z0, z1 };
  }
  // estribos
  trim.setColor(C.rubber);
  const zA = Pf.axles[0].z + Pf.axles[0].Ra + 0.08, zB = Pf.axles[1].z - Pf.axles[1].Ra - 0.1;
  for (const s of [1, -1]) box(trim, s * (xIn + xOut) / 2, Pf.c + 0.12, (zA + zB) / 2, xOut - xIn, 0.04, zB - zA);
}

function addLights(ctx) {
  const { Pf, bufs, cu, out } = ctx, { lights, trim, paint } = bufs;
  const [fs, rs] = Pf.def.body.lights || ['rect', 'rect'];
  const hw0 = Pf.HW(0.02), zf = Pf.zF + 0.022;
  const yF = Pf.E(0.02) - 0.075;
  const ang = slopeAt(Pf, 0.0, 0.05);
  const L = (i) => lights.setUV(...palUV(i));
  out.headPos = [];
  L(PAL.head);
  if (Pf.type === 'vocho') {
    const a = Pf.axles[0], pod = a.pod;
    for (const s of [1, -1]) {
      const z = a.z - a.Ra * 0.75, y = a.yc + a.Ra * 0.8;
      cyl(lights, s * pod.xMid, y, z - 0.02, 'z', 0.085, 0.08, 10, { rx: -0.25 });
      trim.setColor(C.chrome); cyl(trim, s * pod.xMid, y, z + 0.015, 'z', 0.095, 0.06, 10, { rx: -0.25 });
      out.headPos.push([s * pod.xMid, y, z - 0.08]);
    }
  } else if (fs === 'popup') {
    const f0 = 0.035, len = 0.24, x = hw0 * 0.6, w = hw0 * 0.38;
    const zh = Pf.zF + f0 * Pf.L + len;
    const yh = Pf.topY(Pf.f(zh), x);
    const pb = new GeoBuf({ uv: true, project: paint.project }), pl = new GeoBuf({ uv: true });
    pl.setUV(...palUV(PAL.head));
    const a2 = Math.atan2(yh - Pf.topY(f0, x), len);
    for (const s of [1, -1]) {
      const cz = zh - len / 2, cy = yh - 0.05 - Math.sin(a2) * len / 2;
      box(pb, s * x, cy, cz, w, 0.1, len, a2, 0, 0);
      const by = cy - 0.05 * Math.cos(a2) - 0.003;
      const q = [[s * x - w / 2, by, cz - len / 2], [s * x + w / 2, by, cz - len / 2], [s * x + w / 2, by + Math.sin(a2) * len, cz + len / 2], [s * x - w / 2, by + Math.sin(a2) * len, cz + len / 2]];
      pl.quad(q[0], q[1], q[2], q[3], [s * x, by + 1, cz]);
      out.headPos.push([s * x, yh + 0.1, zh - len - 0.05]);
    }
    out.popup = { paint: pb, lights: pl, hinge: [0, yh, zh], rest: 0, open: 1.15 };
  } else if (fs === 'fenderRound') {
    const f = 0.075, x = hw0 * 0.68, z = Pf.z(f), y = Pf.topY(f, x) - 0.02;
    for (const s of [1, -1]) {
      cyl(lights, s * x, y, z, 'z', 0.085, 0.1, 10, { rx: -1.0 });
      trim.setColor(C.black); cyl(trim, s * x, y - 0.01, z + 0.02, 'z', 0.095, 0.1, 10, { rx: -1.0 });
      out.headPos.push([s * x, y, z - 0.1]);
    }
  } else if (fs === 'round' || fs === 'quad') {
    const xs = fs === 'quad' ? [0.5, 0.75] : [0.64];
    const r = fs === 'quad' ? 0.06 : (Pf.type === 'mini' ? 0.075 : 0.085);
    const yy = fs === 'quad' ? Math.max(Pf.c + 0.18, yF + 0.01) : Math.max(Pf.c + 0.2, Pf.E(0.02) - r - 0.03);
    for (const s of [1, -1]) for (const xf of xs) {
      cyl(lights, s * hw0 * xf, yy, zf, 'z', r, 0.07, 10, { rx: -ang * 0.6 });
      trim.setColor(C.chrome); cyl(trim, s * hw0 * xf, yy, zf + 0.025, 'z', r + 0.012, 0.06, 10, { rx: -ang * 0.6 });
      out.headPos.push([s * hw0 * xf, yy, zf - 0.05]);
    }
  } else if (fs === 'slim') {
    const f = 0.03, z = Pf.z(f), y = Pf.E(f) - 0.035, a = slopeAt(Pf, f);
    for (const s of [1, -1]) { box(lights, s * hw0 * 0.6, y, z, hw0 * 0.5, 0.045, 0.16, -a, 0, 0); out.headPos.push([s * hw0 * 0.6, y, z - 0.1]); }
  } else if (fs !== 'none') {
    for (const s of [1, -1]) { box(lights, s * hw0 * 0.6, yF, zf, hw0 * 0.42, 0.1, 0.07, -ang * 0.5, 0, 0); out.headPos.push([s * hw0 * 0.6, yF, zf - 0.05]); }
  }
  // calaveras y reversa
  const hwR = Pf.HW(0.985), zr = Pf.zR - 0.024, yR = Pf.E(0.985) - 0.085, angR = -slopeAt(Pf, 0.95, 0.04);
  L(PAL.tail);
  out.tailPos = [];
  if (Pf.type === 'vocho') {
    const a = Pf.axles[1], pod = a.pod;
    for (const s of [1, -1]) box(lights, s * pod.xMid, a.yc + a.Ra * 0.7, a.z + a.Ra + 0.12, 0.08, 0.13, 0.08, 0.5, 0, 0);
  } else if (rs === 'bar') box(lights, 0, yR, zr, hwR * 1.7, 0.065, 0.06, angR * 0.5, 0, 0);
  else if (rs === 'round2' || rs === 'round4') {
    const xs = rs === 'round4' ? [0.42, 0.68] : [0.62];
    for (const s of [1, -1]) for (const xf of xs) cyl(lights, s * hwR * xf, yR, zr, 'z', 0.068, 0.07, 10);
  } else if (rs === 'slim') { for (const s of [1, -1]) box(lights, s * hwR * 0.55, yR + 0.02, zr, hwR * 0.6, 0.035, 0.06, angR * 0.5, 0, 0); }
  else if (rs === 'tri') { for (const s of [1, -1]) for (let k = 0; k < 3; k++) box(lights, s * hwR * (0.48 + k * 0.1), yR, zr, 0.05, 0.13, 0.06); }
  else if (rs === 'tall') { for (const s of [1, -1]) box(lights, s * hwR * 0.95, (Pf.c + 0.45 + Pf.E(0.985)) / 2, zr, 0.09, Pf.E(0.985) - Pf.c - 0.5, 0.06); }
  else if (rs === 'classic') { for (const s of [1, -1]) box(lights, s * hwR * 0.72, yR - 0.03, zr, 0.07, 0.14, 0.06); }
  else if (rs !== 'rain') { for (const s of [1, -1]) box(lights, s * hwR * 0.62, yR, zr, hwR * 0.42, 0.11, 0.06, angR * 0.5, 0, 0); }
  for (const s of [1, -1]) out.tailPos.push([s * hwR * 0.6, yR, zr + 0.04]);
  L(PAL.rev);
  if (rs !== 'rain') for (const s of [1, -1]) box(lights, s * hwR * 0.3, Pf.c + 0.24, Pf.zR - 0.02, 0.09, 0.04, 0.05);
  lights.setUV(null);
}

function addTrimDetails(ctx) {
  const { Pf, bufs, cu, out } = ctx, { paint, trim } = bufs;
  const tr = Pf.traits, P = Pf.P;
  // espejos laterales
  const fm = P.ws + 0.025, zm = Pf.z(fm), ym = Pf.E(fm) + 0.1, xm = Pf.HW(fm) * 0.95;
  for (const s of [1, -1]) {
    box(paint, s * (xm + 0.1), ym, zm + 0.02, 0.15, 0.085, 0.09);
    trim.setColor(C.black); box(trim, s * (xm + 0.035), ym - 0.03, zm + 0.04, 0.07, 0.025, 0.05);
  }
  // placas (UV explícitas a la región de la placa)
  const pu = ATLAS.plate, pw = 0.32, ph = 0.16;
  const plate = (z, y, dir) => {
    const x0 = -pw / 2, x1 = pw / 2;
    const uvL = dir > 0 ? pu[0] : pu[2], uvR = dir > 0 ? pu[2] : pu[0];
    const a = [x0, y - ph / 2, z], b = [x1, y - ph / 2, z], c = [x1, y + ph / 2, z], d = [x0, y + ph / 2, z];
    const ref = [0, y, z - dir];
    paint.tri(a, b, c, ref, [uvL, pu[1]], [uvR, pu[1]], [uvR, pu[3]]);
    paint.tri(a, c, d, ref, [uvL, pu[1]], [uvR, pu[3]], [uvL, pu[3]]);
  };
  if (Pf.type !== 'monoplaza') {
    plate(Pf.zR + 0.004, Pf.c + 0.26, 1);
    plate(Pf.zF - 0.006, Pf.c + 0.13, -1);
  }
  // escapes
  const ex = [];
  const yE = Pf.c + 0.09, zE = Pf.zR - 0.04;
  const hwE = Pf.HW(0.98);
  if (tr.has('quadExhaust')) for (const s of [1, -1]) { ex.push([s * hwE * 0.48, yE, zE, 0.038]); ex.push([s * hwE * 0.62, yE, zE, 0.038]); }
  else if (tr.has('twinExhaust')) for (const s of [1, -1]) ex.push([s * hwE * 0.55, yE, zE, 0.045]);
  else if (tr.has('centerExhaust')) for (const s of [1, -1]) ex.push([s * 0.08, yE + 0.04, zE, 0.05]);
  else if (tr.has('zondaExhaust')) { const yz = Pf.c + 0.36; ex.push([0, yz + 0.07, zE, 0.045], [0, yz - 0.07, zE, 0.045], [0.07, yz, zE, 0.045], [-0.07, yz, zE, 0.045]); }
  else if (!tr.has('topExhaust') && Pf.def.engine.layout !== 'EV') ex.push([hwE * 0.55, yE, zE, 0.035]);
  out.exhausts = [];
  for (const e of ex) {
    trim.setColor(C.chrome); cyl(trim, e[0], e[1], e[2], 'z', e[3], 0.14, 8, { caps: false });
    trim.setColor('#050505'); cyl(trim, e[0], e[1], e[2] + 0.05, 'z', e[3] * 0.8, 0.02, 8);
    out.exhausts.push({ pos: [e[0], e[1], e[2] + 0.08], dir: [0, 0, 1], r: e[3] });
  }
  if (tr.has('topExhaust')) {
    const f = P.rw + 0.03, y = Pf.T(f);
    for (const s of [1, -1]) {
      trim.setColor(C.chrome); cyl(trim, s * 0.22, y + 0.02, Pf.z(f), 'y', 0.05, 0.1, 8, { caps: false });
      out.exhausts.push({ pos: [s * 0.22, y + 0.08, Pf.z(f)], dir: [0, 1, 0], r: 0.05 });
    }
  }
}

function addTraits(ctx) {
  const { Pf, bufs, cu, out } = ctx, { paint, trim, lights } = bufs;
  const tr = Pf.traits, P = Pf.P;
  if (tr.has('hoodScoop')) {
    const f1 = P.ws - 0.03, f0 = f1 - 0.36 / Pf.L, z0 = Pf.z(f0), z1 = Pf.z(f1);
    const y0 = Pf.T(f0), y1 = Pf.T(f1), w = 0.22;
    hexa(paint, [[-w, y0 - 0.02, z0], [w, y0 - 0.02, z0], [w, y1 - 0.02, z1], [-w, y1 - 0.02, z1], [-w * 0.8, y0 + 0.06, z0 + 0.04], [w * 0.8, y0 + 0.06, z0 + 0.04], [w * 0.85, y1 + 0.03, z1], [-w * 0.85, y1 + 0.03, z1]]);
    trim.setColor('#050506'); trim.quad([-w * 0.75, y0 + 0.0, z0 + 0.015], [w * 0.75, y0 + 0.0, z0 + 0.015], [w * 0.75, y0 + 0.05, z0 + 0.035], [-w * 0.75, y0 + 0.05, z0 + 0.035], [0, y0, z0 + 1]);
  }
  if (tr.has('bulgeHood')) {
    const f0 = 0.1, f1 = P.ws - 0.01, z0 = Pf.z(f0), z1 = Pf.z(f1), y0 = Pf.T(f0), y1 = Pf.T(f1), w = Pf.HW(0.2) * 0.32;
    hexa(paint, [[-w, y0 - 0.02, z0], [w, y0 - 0.02, z0], [w, y1 - 0.02, z1], [-w, y1 - 0.02, z1], [-w * 0.85, y0 + 0.012, z0 + 0.05], [w * 0.85, y0 + 0.012, z0 + 0.05], [w * 0.85, y1 + 0.03, z1], [-w * 0.85, y1 + 0.03, z1]]);
  }
  if (tr.has('snorkel')) {
    const f0 = P.rf + 0.02, f1 = P.rb + 0.04, z0 = Pf.z(f0), z1 = Pf.z(f1), y0 = Pf.T(f0), y1 = Pf.T(f1), w = 0.13;
    hexa(paint, [[-w, y0 - 0.01, z0], [w, y0 - 0.01, z0], [w, y1 - 0.01, z1], [-w, y1 - 0.01, z1], [-w, y0 + 0.08, z0], [w, y0 + 0.08, z0], [w * 0.8, y1 + 0.03, z1], [-w * 0.8, y1 + 0.03, z1]]);
    trim.setColor('#050506'); trim.quad([-w * 0.85, y0 + 0.005, z0 - 0.003], [w * 0.85, y0 + 0.005, z0 - 0.003], [w * 0.85, y0 + 0.07, z0 - 0.003], [-w * 0.85, y0 + 0.07, z0 - 0.003], [0, y0, z0 + 1]);
  }
  if (tr.has('buttress')) {
    for (const s of [1, -1]) {
      const fa = P.rb - 0.02, fb = 0.93, xa = Pf.HW(fa) * P.roofW * 0.95, xb = Pf.HW(fb) * 0.9;
      beam(paint, [s * xa, Pf.T(fa) - 0.03, Pf.z(fa)], [s * xb, Pf.E(fb) + 0.01, Pf.z(fb)], 0.07, 0.16);
    }
  }
  if (tr.has('turret')) {
    const f = (P.rf + P.rb) / 2 - 0.02, z = Pf.z(f), y = Pf.T(f), w = Pf.HW(f) * P.roofW * 1.7;
    trim.setColor(C.black); box(trim, 0, y + 0.04, z, w, 0.06, 0.26);
    lights.setUV(...palUV(PAL.red)); box(lights, -w / 4, y + 0.1, z, w / 2 - 0.04, 0.07, 0.22);
    lights.setUV(...palUV(PAL.blue)); box(lights, w / 4, y + 0.1, z, w / 2 - 0.04, 0.07, 0.22);
    lights.setUV(null);
    trim.setColor(C.black); beam(trim, [Pf.HW(0.85) * 0.6, Pf.T(0.9), Pf.z(0.9)], [Pf.HW(0.85) * 0.6, Pf.T(0.9) + 0.7, Pf.z(0.9) + 0.06], 0.012, 0.012);
    out.siren = true;
  }
  if (tr.has('pushbar')) {
    trim.setColor(C.black);
    const z = Pf.zF - 0.09, y0 = Pf.c + 0.1, y1 = Pf.E(0.02) + 0.05;
    for (const s of [1, -1]) box(trim, s * 0.28, (y0 + y1) / 2, z, 0.06, y1 - y0, 0.06);
    box(trim, 0, y0 + 0.12, z, 0.75, 0.07, 0.07); box(trim, 0, y1 - 0.06, z, 0.62, 0.06, 0.06);
  }
  if (tr.has('bed')) {
    trim.setColor('#1b1c1e');
    const f0 = P.rw + 0.012, f1 = 0.982, x = Pf.HW(0.8) * 0.88, y = Pf.E(0.8) + 0.004;
    trim.quad([-x, y, Pf.z(f0)], [x, y, Pf.z(f0)], [x, y, Pf.z(f1)], [-x, y, Pf.z(f1)], [0, y - 1, 0]);
  }
  if (tr.has('flares')) flares(ctx, 0.05);
}

function flares(ctx, out = 0.05) {
  const { Pf, bufs } = ctx, { paint } = bufs;
  for (const a of Pf.axles) {
    const hw = Pf.HW(a.f);
    const segs = [[160, 112], [112, 68], [68, 20]];
    for (const s of [1, -1]) for (const [d0, d1] of segs) {
      const p = d => { const r = d * Math.PI / 180; return [a.z + Math.cos(r) * (a.Ra + 0.005), a.yc + Math.sin(r) * (a.Ra + 0.005)]; };
      const q = d => { const r = d * Math.PI / 180; return [a.z + Math.cos(r) * (a.Ra + 0.08), a.yc + Math.sin(r) * (a.Ra + 0.08)]; };
      const A0 = p(d0), A1 = p(d1), B0 = q(d0), B1 = q(d1), xi = s * (hw - 0.04), xo = s * (hw + out);
      hexa(paint, [[xi, A0[1], A0[0]], [xo, A0[1], A0[0]], [xo, A1[1], A1[0]], [xi, A1[1], A1[0]], [xi, B0[1], B0[0]], [xi + s * 0.02, B0[1], B0[0]], [xi + s * 0.02, B1[1], B1[0]], [xi, B1[1], B1[0]]]);
    }
  }
}

export function addSpoiler(ctx, style) {
  const { Pf, bufs } = ctx, { paint, trim } = bufs;
  if (!style || style === 'ninguno' || Pf.type === 'monoplaza') return;
  const P = Pf.P, hatchy = ['hatch', 'mini', 'vocho'].includes(Pf.type);
  const hwS = Pf.HW(0.95);
  if (style === 'labio' && hatchy) {
    const z0 = Pf.z(P.rb) - 0.04, y = Pf.T(P.rb) + 0.005, w = Pf.HW(P.rb) * P.roofW * 0.95;
    hexa(paint, [[-w, y - 0.02, z0], [w, y - 0.02, z0], [w, y - 0.05, z0 + 0.24], [-w, y - 0.05, z0 + 0.24], [-w, y + 0.015, z0], [w, y + 0.015, z0], [w, y - 0.02, z0 + 0.25], [-w, y - 0.02, z0 + 0.25]]);
    return;
  }
  let fS = hatchy ? Math.min(0.97, P.rw + 0.01) : 1 - 0.3 / Pf.L;
  const zS = Pf.z(fS), yS = Pf.T(fS), zT = Pf.zR;
  const wing = (y, chord, span, thick, aoa, zc) => {
    box(paint, 0, y, zc, span, thick, chord, aoa, 0, 0);
  };
  if (style === 'labio') {
    const y = Pf.T(1 - 0.12 / Pf.L);
    hexa(paint, [[-hwS * 0.85, y - 0.02, zT - 0.2], [hwS * 0.85, y - 0.02, zT - 0.2], [hwS * 0.85, y - 0.02, zT - 0.03], [-hwS * 0.85, y - 0.02, zT - 0.03],
      [-hwS * 0.85, y + 0.005, zT - 0.2], [hwS * 0.85, y + 0.005, zT - 0.2], [hwS * 0.85, y + 0.045, zT - 0.04], [-hwS * 0.85, y + 0.045, zT - 0.04]]);
  } else if (style === 'ducktail') {
    const y0 = Pf.T(1 - 0.45 / Pf.L), y1 = Pf.T(1 - 0.05 / Pf.L);
    hexa(paint, [[-hwS * 0.9, y0 - 0.02, zT - 0.45], [hwS * 0.9, y0 - 0.02, zT - 0.45], [hwS * 0.9, y1 - 0.03, zT - 0.02], [-hwS * 0.9, y1 - 0.03, zT - 0.02],
      [-hwS * 0.9, y0 + 0.005, zT - 0.45], [hwS * 0.9, y0 + 0.005, zT - 0.45], [hwS * 0.9, y1 + 0.09, zT - 0.01], [-hwS * 0.9, y1 + 0.09, zT - 0.01]]);
  } else if (style === 'arco') {
    const h = 0.2, span = hwS * 1.72, zc = zS + 0.02;
    wing(yS + h, 0.24, span, 0.035, -0.06, zc);
    for (const s of [1, -1]) beam(paint, [s * span / 2 * 0.96, yS - 0.01, zc - 0.12], [s * span / 2 * 0.96, yS + h, zc + 0.02], 0.05, 0.12);
  } else if (style === 'alto') {
    const h = 0.25, span = hwS * 1.56, zc = zS + 0.02;
    wing(yS + h, 0.24, span, 0.04, -0.08, zc);
    for (const s of [1, -1]) { beam(paint, [s * span * 0.36, yS - 0.01, zc - 0.05], [s * span * 0.36, yS + h, zc], 0.035, 0.14); box(paint, s * span / 2, yS + h + 0.03, zc, 0.02, 0.1, 0.26); }
  } else if (style === 'gt' || style === 'cuello') {
    const h = style === 'gt' ? 0.3 : 0.36, span = hwS * 1.84, zc = zS + (style === 'gt' ? 0.04 : 0.08);
    wing(yS + h, 0.32, span, 0.035, -0.1, zc);
    box(paint, 0, yS + h + 0.06, zc + 0.08, span * 0.98, 0.02, 0.12, -0.45, 0, 0);
    for (const s of [1, -1]) box(paint, s * span / 2, yS + h + 0.01, zc + 0.02, 0.02, 0.2, 0.4);
    trim.setColor(C.black);
    for (const s of [1, -1]) {
      if (style === 'gt') beam(trim, [s * 0.32, yS - 0.01, zc - 0.03], [s * 0.32, yS + h, zc], 0.025, 0.16);
      else { beam(trim, [s * 0.3, yS - 0.01, zc + 0.12], [s * 0.3, yS + h + 0.09, zc + 0.14], 0.025, 0.1); beam(trim, [s * 0.3, yS + h + 0.09, zc + 0.14], [s * 0.3, yS + h + 0.09, zc - 0.02], 0.025, 0.05); }
    }
  } else if (style === 'ballena') {
    const z0 = zT - 0.5, z1 = zT + 0.1, y0 = Pf.T(Pf.f(z0)), y = y0 + 0.05, span = hwS * 1.7;
    hexa(paint, [[-span / 2, y0 - 0.03, z0], [span / 2, y0 - 0.03, z0], [span / 2, y - 0.03, z1], [-span / 2, y - 0.03, z1], [-span / 2, y0 + 0.02, z0], [span / 2, y0 + 0.02, z0], [span / 2, y + 0.04, z1], [-span / 2, y + 0.04, z1]]);
    trim.setColor(C.rubber); box(trim, 0, y + 0.06, z1 - 0.02, span, 0.05, 0.04);
  }
}

function addBodykit(ctx, level) {
  const { Pf, bufs } = ctx, { paint, trim } = bufs;
  if (level < 1 || Pf.type === 'monoplaza') return;
  const zA = Pf.axles[0].z + Pf.axles[0].Ra + 0.03, zB = Pf.axles[1].z - Pf.axles[1].Ra - 0.03;
  const hw = Pf.HW(0.5), c = Pf.c;
  for (const s of [1, -1]) hexa(paint, [[s * hw * 0.95, c - 0.03, zA], [s * (hw + 0.025), c - 0.03, zA], [s * (hw + 0.025), c - 0.03, zB], [s * hw * 0.95, c - 0.03, zB],
    [s * hw * 0.95, c + 0.1, zA], [s * (hw + 0.012), c + 0.09, zA], [s * (hw + 0.012), c + 0.09, zB], [s * hw * 0.95, c + 0.1, zB]]);
  trim.setColor(C.carbon);
  const hf = Pf.HW(0.02) * 0.84;
  hexa(trim, [[-hf, c - 0.045, Pf.zF - 0.05], [hf, c - 0.045, Pf.zF - 0.05], [hf, c - 0.045, Pf.zF + 0.35], [-hf, c - 0.045, Pf.zF + 0.35],
    [-hf, c - 0.01, Pf.zF - 0.02], [hf, c - 0.01, Pf.zF - 0.02], [hf, c - 0.005, Pf.zF + 0.35], [-hf, c - 0.005, Pf.zF + 0.35]]);
  const hr = Pf.HW(0.97) * 0.7;
  box(trim, 0, c - 0.01, Pf.zR - 0.15, hr * 2, 0.04, 0.36);
  for (let k = -2; k <= 2; k++) box(trim, k * hr * 0.4, c + 0.03, Pf.zR - 0.12, 0.015, 0.09, 0.3);
  if (level >= 2) {
    if (!Pf.traits.has('flares')) flares(ctx, 0.06);
    for (const s of [1, -1]) box(trim, s * Pf.HW(0.03) * 0.8, c + 0.17, Pf.zF + 0.06, 0.16, 0.012, 0.12, 0, s * 0.35, s * 0.15);
  }
}

// ───────────────────────── Interior ─────────────────────────
export function buildInterior(ctx) {
  const { Pf, def, out } = ctx, P = Pf.P;
  const I = new GeoBuf({ colors: 3 });
  const tr = Pf.traits;
  const center = tr.has('centerSeat');
  const side = center ? 0 : tr.has('rhd') ? 1 : -1;
  const hw = Pf.HW(0.5);
  const eyeZ = Math.min(Pf.z(P.rf) + 0.38, Pf.z(P.rb) - 0.04);
  const fE = Pf.f(eyeZ), Ee = Pf.E(fE), Te = Pf.T(fE);
  const eyeY = Ee + (Te - Ee) * 0.62, eyeX = side * hw * 0.38;
  out.eye = [eyeX, eyeY, eyeZ];
  const c = Pf.c, floorY = c + 0.1, Ews = Pf.E(P.ws);
  const sporty = def.tier >= 3 || ['jdm', 'rally', 'super', 'hiper'].includes(def.class);
  const seatCol = sporty ? '#5a1a1e' : '#34363b', dark = '#26282c', mid = '#3a3c42';
  const seat = x => {
    I.setColor(seatCol);
    box(I, x, floorY + 0.15, eyeZ - 0.05, 0.46, 0.1, 0.5);
    hexa(I, [[x - 0.24, floorY + 0.15, eyeZ + 0.2], [x + 0.24, floorY + 0.15, eyeZ + 0.2], [x + 0.24, floorY + 0.15, eyeZ + 0.32], [x - 0.24, floorY + 0.15, eyeZ + 0.32],
      [x - 0.23, eyeY - 0.06, eyeZ + 0.3], [x + 0.23, eyeY - 0.06, eyeZ + 0.3], [x + 0.23, eyeY - 0.06, eyeZ + 0.4], [x - 0.23, eyeY - 0.06, eyeZ + 0.4]]);
    box(I, x, eyeY + 0.04, eyeZ + 0.36, 0.26, 0.17, 0.09);
  };
  seat(eyeX);
  if (!center) seat(-eyeX); else { seat(-hw * 0.55); seat(hw * 0.55); }
  I.setColor(dark);
  const zWS = Pf.z(P.ws), zBack = Math.min(eyeZ + (Pf.doors === 4 ? 1.1 : 0.58), Pf.z(P.rw) - 0.05);
  I.quad([-hw * 0.92, floorY, zWS], [hw * 0.92, floorY, zWS], [hw * 0.92, floorY, zBack], [-hw * 0.92, floorY, zBack], [0, floorY + 1, 0]);
  // puertas por dentro
  I.setColor(mid);
  for (const s of [1, -1]) {
    const x = s * Pf.HW(fE) * 0.9;
    const zz0 = zWS + 0.05, zz1 = Math.min(zBack, Pf.z(Pf.swEnd));
    hexa(I, [[x - s * 0.05, floorY, zz0], [x, floorY, zz0], [x, floorY, zz1], [x - s * 0.05, floorY, zz1],
      [x - s * 0.05, Pf.E(Pf.f(zz0)) + 0.005, zz0], [x, Pf.E(Pf.f(zz0)) + 0.005, zz0], [x, Pf.E(Pf.f(zz1)) + 0.005, zz1], [x - s * 0.05, Pf.E(Pf.f(zz1)) + 0.005, zz1]]);
  }
  // tablero
  const dz1 = eyeZ - 0.52, gy = eyeY - 0.31, gz = eyeZ - 0.64;
  I.setColor(dark);
  const dx = Pf.HW(P.ws + 0.02) * 0.9;
  hexa(I, [[-dx, Ews - 0.32, zWS + 0.02], [dx, Ews - 0.32, zWS + 0.02], [dx, Ews - 0.3, dz1], [-dx, Ews - 0.3, dz1],
    [-dx, Ews + 0.005, zWS + 0.02], [dx, Ews + 0.005, zWS + 0.02], [dx, Math.min(gy - 0.02, Ews + 0.05), dz1], [-dx, Math.min(gy - 0.02, Ews + 0.05), dz1]]);
  I.quad([-dx, floorY, zWS + 0.03], [dx, floorY, zWS + 0.03], [dx, Ews - 0.3, zWS + 0.03], [-dx, Ews - 0.3, zWS + 0.03], [0, 0, zWS + 1]);
  I.setColor('#1c1d20');
  box(I, eyeX, gy - 0.01, gz - 0.07, 0.36, 0.17, 0.1);
  box(I, eyeX, gy + 0.09, gz - 0.03, 0.38, 0.02, 0.16, 0.12, 0, 0);
  // columna, consola, techo, pilares, espejo, pared trasera
  const wc = [eyeX, eyeY - 0.34, eyeZ - 0.42];
  beam(I, [eyeX, gy - 0.14, gz + 0.05], [wc[0], wc[1] - 0.02, wc[2] + 0.02], 0.07, 0.07);
  if (!center) { I.setColor(mid); box(I, 0, floorY + 0.12, eyeZ - 0.15, 0.2, 0.24, 0.7); }
  I.setColor('#3a3b40');
  const rwH = Pf.HW((P.rf + P.rb) / 2) * P.roofW * 0.95;
  const zr0 = Pf.z(P.rf) + 0.02, zr1 = Pf.z(P.rb) - 0.02;
  I.quad([-rwH, Pf.T(P.rf) - 0.035, zr0], [rwH, Pf.T(P.rf) - 0.035, zr0], [rwH, Pf.T(P.rb) - 0.035, zr1], [-rwH, Pf.T(P.rb) - 0.035, zr1], [0, Pf.T(P.rf) + 1, (zr0 + zr1) / 2]);
  I.setColor(dark);
  for (const s of [1, -1]) beam(I, [s * Pf.HW(P.ws) * 0.9, Ews + 0.02, zWS + 0.03], [s * Pf.HW(P.rf) * P.roofW * 0.95, Pf.T(P.rf) - 0.04, Pf.z(P.rf) + 0.03], 0.07, 0.05);
  box(I, 0, Pf.T(P.rf) - 0.1, Pf.z(P.rf) + 0.1, 0.24, 0.065, 0.03);
  I.setColor('#8fa0ad'); box(I, 0, Pf.T(P.rf) - 0.1, Pf.z(P.rf) + 0.116, 0.21, 0.045, 0.005);
  I.setColor(dark); beam(I, [0, Pf.T(P.rf) - 0.03, Pf.z(P.rf) + 0.07], [0, Pf.T(P.rf) - 0.08, Pf.z(P.rf) + 0.1], 0.02, 0.02);
  const fB = Pf.f(zBack);
  I.setColor(mid);
  I.quad([-hw * 0.92, floorY, zBack], [hw * 0.92, floorY, zBack], [hw * 0.92, Pf.E(fB) + 0.02, zBack], [-hw * 0.92, Pf.E(fB) + 0.02, zBack], [0, 0, zBack + 1]);
  if (zBack < Pf.z(P.rw) - 0.02) I.quad([-hw * 0.9, Pf.E(fB) + 0.02, zBack], [hw * 0.9, Pf.E(fB) + 0.02, zBack], [hw * 0.9, Pf.E(P.rw), Pf.z(P.rw)], [-hw * 0.9, Pf.E(P.rw), Pf.z(P.rw)], [0, 0, 0]);
  if (Pf.doors === 4 && !center) {
    I.setColor(seatCol); box(I, 0, floorY + 0.15, zBack - 0.3, hw * 1.6, 0.12, 0.45);
    box(I, 0, (floorY + Pf.E(fB)) / 2 + 0.1, zBack - 0.06, hw * 1.6, Pf.E(fB) - floorY - 0.05, 0.1);
  }
  out.gauge = { pos: [eyeX, gy, gz], tilt: -0.25 };
  out.wheelCenter = wc;
  return I;
}

// Volante: aro, rayos y marca superior; plano del volante = XY, mira a +Z (hacia el piloto).
export function steeringWheelBuf(r = 0.175, formula = false) {
  const b = new GeoBuf({ colors: 3 });
  b.setColor('#151618');
  if (formula) {
    box(b, 0, 0, 0, r * 2, r * 0.9, 0.04);
    b.setColor('#1d6fd1'); box(b, 0, 0.01, 0.022, r * 0.8, r * 0.4, 0.005);
  } else {
    fromGeometry(b, new THREE.TorusGeometry(r, 0.02, 4, 14));
    for (const a of [-Math.PI / 2, 0.35, Math.PI - 0.35]) box(b, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 0, r, 0.035, 0.02, 0, 0, a);
    box(b, 0, 0, 0, 0.09, 0.09, 0.05);
    b.setColor('#d01818'); box(b, 0, r, 0.005, 0.03, 0.045, 0.045);
  }
  return b;
}

// ───────────────────────── Monoplaza de Fórmula ─────────────────────────
function loftRings(buf, rings, capStart = true, capEnd = true) {
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1], n = A.length;
    const cA = centroidOf(A), cB = centroidOf(B), ref = [(cA[0] + cB[0]) / 2, (cA[1] + cB[1]) / 2, (cA[2] + cB[2]) / 2];
    for (let j = 0; j < n; j++) buf.quad(A[j], A[(j + 1) % n], B[(j + 1) % n], B[j], ref);
  }
  const cap = (R, dir) => { const c = centroidOf(R); const ref = [c[0], c[1], c[2] - dir]; for (let j = 0; j < R.length; j++) buf.tri(c, R[j], R[(j + 1) % R.length], ref); };
  if (capStart) cap(rings[0], -1);
  if (capEnd) cap(rings[rings.length - 1], 1);
}
function centroidOf(R) { const c = [0, 0, 0]; for (const p of R) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return c.map(v => v / R.length); }
function oval(z, cy, hw, hh, n = 8, flat = 0.6) {
  const R = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + Math.PI / n, cx = Math.cos(a), sy = Math.sin(a);
    R.push([Math.sign(cx) * Math.pow(Math.abs(cx), flat) * hw, cy + Math.sign(sy) * Math.pow(Math.abs(sy), flat) * hh, z]);
  }
  return R;
}

export function buildFormula(ctx) {
  const { Pf, bufs, cu, out } = ctx, { paint, trim, lights } = bufs;
  const zF = Pf.zF, zR = Pf.zR;
  // nariz y monocasco
  loftRings(paint, [
    oval(zF + 0.12, 0.2, 0.06, 0.05), oval(zF + 0.5, 0.24, 0.13, 0.09), oval(-1.2, 0.33, 0.2, 0.15), oval(-0.85, 0.4, 0.27, 0.2),
    oval(-0.35, 0.42, 0.33, 0.22), oval(0.2, 0.42, 0.36, 0.22),
  ], true, false);
  // cubierta de motor con toma de aire
  loftRings(paint, [oval(0.18, 0.55, 0.3, 0.38), oval(0.35, 0.62, 0.22, 0.38), oval(1.1, 0.52, 0.28, 0.24), oval(1.8, 0.42, 0.16, 0.15), oval(2.25, 0.4, 0.07, 0.08)], true, true);
  trim.setColor('#050506'); box(trim, 0, 0.92, 0.18, 0.2, 0.12, 0.02);
  hexa(paint, [[-0.01, 0.9, 0.45], [0.01, 0.9, 0.45], [0.01, 0.62, 1.95], [-0.01, 0.62, 1.95], [-0.01, 1.0, 0.4], [0.01, 1.0, 0.4], [0.01, 0.9, 1.95], [-0.01, 0.9, 1.95]]);
  // pontones
  for (const s of [1, -1]) {
    hexa(paint, [[s * 0.3, 0.1, -0.35], [s * 0.72, 0.1, -0.3], [s * 0.6, 0.1, 1.2], [s * 0.3, 0.1, 1.3], [s * 0.3, 0.56, -0.35], [s * 0.68, 0.5, -0.3], [s * 0.45, 0.36, 1.2], [s * 0.3, 0.38, 1.3]]);
    trim.quad([s * 0.34, 0.16, -0.36], [s * 0.66, 0.16, -0.31], [s * 0.64, 0.46, -0.31], [s * 0.34, 0.52, -0.36], [s * 0.5, 0.3, 0]);
  }
  // abertura de cabina y piloto
  trim.setColor('#08080a'); trim.quad([-0.22, 0.645, -0.5], [0.22, 0.645, -0.5], [0.22, 0.645, 0.15], [-0.22, 0.645, 0.15], [0, 0, -0.2]);
  trim.setColor(cu.vinylColor && cu.vinylColor !== cu.paint ? cu.vinylColor : '#f4f4f2');
  fromGeometry(trim, new THREE.IcosahedronGeometry(0.14, 1), 0, 0.78, -0.02);
  trim.setColor('#0a0c10'); box(trim, 0, 0.8, -0.13, 0.2, 0.06, 0.06);
  // halo
  trim.setColor('#1a1b1e');
  beam(trim, [0, 0.62, -0.62], [0, 0.88, -0.42], 0.05, 0.04);
  const hp = [[0, 0.88, -0.42], [0.18, 0.88, -0.32], [0.26, 0.86, -0.1], [0.28, 0.8, 0.08], [0.3, 0.66, 0.18]];
  for (const s of [1, -1]) for (let i = 0; i < hp.length - 1; i++) beam(trim, [s * hp[i][0], hp[i][1], hp[i][2]], [s * hp[i + 1][0], hp[i + 1][1], hp[i + 1][2]], 0.045, 0.045);
  // piso, alerones y suspensión
  trim.setColor('#141416');
  box(trim, 0, 0.06, 0.55, 1.45, 0.03, 2.9);
  box(paint, 0, 0.09, zF + 0.22, 1.85, 0.025, 0.4, 0.04, 0, 0);
  box(paint, 0, 0.15, zF + 0.4, 1.7, 0.02, 0.22, -0.3, 0, 0);
  for (const s of [1, -1]) box(paint, s * 0.93, 0.17, zF + 0.28, 0.025, 0.24, 0.52);
  box(paint, 0, 0.9, zR - 0.2, 1.0, 0.03, 0.3, -0.1, 0, 0);
  box(paint, 0, 0.98, zR - 0.12, 1.0, 0.02, 0.16, -0.5, 0, 0);
  for (const s of [1, -1]) box(paint, s * 0.51, 0.75, zR - 0.18, 0.025, 0.55, 0.48);
  trim.setColor('#1a1b1e');
  beam(trim, [0, 0.5, zR - 0.55], [0, 0.88, zR - 0.22], 0.03, 0.12);
  box(trim, 0, 0.12, zR - 0.1, 1.0, 0.16, 0.2);
  for (const a of Pf.axles) for (const s of [1, -1]) {
    const hx = s * (a.halfTrack - a.tw / 2), bx = s * (a.front ? 0.18 : 0.22);
    beam(trim, [bx, 0.42, a.z - 0.12], [hx, a.yc + 0.08, a.z], 0.025, 0.025);
    beam(trim, [bx, 0.42, a.z + 0.15], [hx, a.yc + 0.08, a.z], 0.025, 0.025);
    beam(trim, [bx, 0.2, a.z - 0.1], [hx, a.yc - 0.08, a.z], 0.025, 0.025);
    beam(trim, [bx, 0.2, a.z + 0.15], [hx, a.yc - 0.08, a.z], 0.025, 0.025);
  }
  for (const s of [1, -1]) { box(paint, s * 0.45, 0.72, -0.55, 0.12, 0.05, 0.05); beam(trim, [s * 0.32, 0.55, -0.5], [s * 0.42, 0.7, -0.55], 0.015, 0.015); }
  // luz de lluvia, escape
  lights.setUV(...palUV(PAL.tail)); box(lights, 0, 0.32, zR - 0.01, 0.08, 0.06, 0.04); lights.setUV(null);
  trim.setColor(C.chrome); cyl(trim, 0, 0.48, zR - 0.4, 'z', 0.05, 0.12, 8, { caps: false });
  out.exhausts = [{ pos: [0, 0.48, zR - 0.32], dir: [0, 0, 1], r: 0.05 }];
  out.headPos = [[0.2, 0.3, zF + 0.1], [-0.2, 0.3, zF + 0.1]];
  out.tailPos = [[0, 0.32, zR]];
  out.eye = [0, 0.8, -0.2];
  out.gauge = { pos: [0, 0.68, -0.62], tilt: -0.5, scale: 0.55 };
  out.wheelCenter = [0, 0.66, -0.42];
  out.formula = true;
}
