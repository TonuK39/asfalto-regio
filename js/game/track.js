// Construcción 3D de una pista y consulta de superficie (contrato en DISENO.md).
// buildTrack(def, { quality, timeOfDay, weather }) → { group, query, sampleAt, gridSlots, … }
import * as THREE from 'three';
import { trackCenterline, catmullRom, resample } from '../data/tracks/geom.js';
import { rng, clamp } from '../core/util.js';
import {
  GeoBuilder, col, mixc, shade, material, basic, roadTex, kerbTex, tireTex, fenceTex, checkerTex, textAtlas,
  noise2, instanced, trs, partsGeo, disposeTree,
} from './scenery/kit.js';
import { buildScenery } from './scenery.js';

export const SURFACES = ['asfalto', 'piano', 'pasto', 'tierra', 'grava', 'arena', 'nieve', 'hielo'];
const ASF = 0, PIANO = 1, PASTO = 2, TIERRA = 3, GRAVA = 4, ARENA = 5, NIEVE = 6, HIELO = 7;
// Agarre y arrastre en el camino / fuera del camino
const GRIP_ON = [1, 0.95, 0.55, 0.72, 0.45, 0.5, 0.55, 0.35];
const DRAG_ON = [0, 0.05, 0.6, 0.15, 1.2, 1.0, 0.25, 0.05];
const GRIP_OFF = [0.95, 0.9, 0.55, 0.6, 0.45, 0.5, 0.45, 0.35];
const DRAG_OFF = [0.05, 0.05, 0.6, 0.45, 1.2, 1.0, 0.9, 0.05];
const SURF_COL = ['#5a5c61', '#c03030', '#4d7a32', '#8a6a45', '#b8a27e', '#d8bb84', '#e9eff5', '#c4dcec'];
const KERB_IN = 0.35, KERB_OUT = 1.2;

// Barreras: 1 concreto, 2 llantas, 3 guardarriel, 4 SAFER, 5 berma de arena, 6 banco de nieve
const B = { concreto: 1, llantas: 2, guardarriel: 3, safer: 4, berma: 5, nieve: 6 };

export const THEMES = {
  autodromo: { road: 'asfalto', run: [PASTO, PASTO], curveRun: GRAVA, base: [8, 8], extra: 16, barrier: 'concreto', curveBarrier: 'llantas', fence: 'rectas', kerbs: true, ground: '#5b7d3a', terrain: false },
  neon: { road: 'calle', run: [ASF, ASF], base: [2.4, 2.4], extra: 1.5, barrier: 'concreto', fence: 'todo', kerbs: 'pocas', ground: '#303036', terrain: false },
  puerto: { road: 'asfalto', run: [ASF, ASF], base: [3.5, 3.5], extra: 5, barrier: 'concreto', curveBarrier: 'llantas', kerbs: true, ground: '#77726a', terrain: false },
  montana: { road: 'asfalto', run: [GRAVA, GRAVA], base: [1.7, 1.7], extra: 1.2, barrier: 'guardarriel', kerbs: false, ground: '#56703c', terrain: true },
  desierto: { road: 'tierra', run: [ARENA, ARENA], base: [13, 13], extra: 10, barrier: 'berma', kerbs: false, ground: '#d2b07a', terrain: true },
  aerodromo: { road: 'pista', run: [ASF, ASF], base: [2, 2], extra: 0, barrier: 'concreto', kerbs: false, ground: '#74804c', terrain: false },
  ovalo: { road: 'asfalto', run: [ASF, ASF], base: [9, 0.6], extra: 0, barrier: 'safer', innerBarrier: 'concreto', fence: 'exterior', kerbs: false, ground: '#4f7a34', terrain: false },
  costa: { road: 'asfalto', run: [PASTO, PASTO], curveRun: ARENA, base: [7, 7], extra: 14, barrier: 'guardarriel', curveBarrier: 'llantas', kerbs: true, ground: '#5f8a3a', terrain: true },
  nieve: { road: 'nieve', run: [NIEVE, NIEVE], base: [3.5, 3.5], extra: 5, barrier: 'nieve', kerbs: false, ground: '#e6edf3', terrain: true },
};
const ROAD_SURF = { asfalto: ASF, calle: ASF, pista: ASF, concreto: ASF, tierra: TIERRA, nieve: NIEVE };

const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export async function buildTrack(def, opts = {}) {
  const quality = opts.quality === 'semi' ? 'semi' : 'lowpoly';
  const semi = quality === 'semi';
  const timeOfDay = opts.timeOfDay || def.defaultTime || 'day';
  const weather = opts.weather || 'clear';
  const night = timeOfDay === 'night';
  const TH = THEMES[def.theme] || THEMES.autodromo;
  const arena = def.kind === 'arena';
  const drag = def.kind === 'drag';
  const C = trackCenterline(def);
  const n = C.n, step = C.step, closed = C.closed, L = C.length;
  const nx = i => closed ? (i + 1) % n : Math.min(n - 1, i + 1);
  const pv = i => closed ? (i - 1 + n) % n : Math.max(0, i - 1);
  const wrapI = i => closed ? ((i % n) + n) % n : clamp(i, 0, n - 1);

  // ---------------------------------------------------------------- arreglos por muestra
  const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n), HW = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = C.x[i]; Z[i] = C.z[i]; Y[i] = C.y[i]; HW[i] = C.w[i] / 2; }
  // Hielo (Bosque Nevado): el tramo del lago queda plano
  const roadSurf = new Uint8Array(n).fill(ROAD_SURF[TH.road] ?? ASF);
  if (def.iceZone) {
    const a = Math.round(def.iceZone.from * n), b = Math.round(def.iceZone.to * n);
    let sum = 0, cnt = 0;
    for (let i = a; i <= b; i++) { sum += Y[wrapI(i)]; cnt++; }
    const lake = sum / cnt;
    for (let i = a - 25; i <= b + 25; i++) {
      const j = wrapI(i), f = i < a ? smoothstep(a - 25, a, i) : i > b ? 1 - smoothstep(b, b + 25, i) : 1;
      Y[j] = Y[j] + (lake - Y[j]) * f;
      if (i >= a + 4 && i <= b - 4) roadSurf[j] = HIELO;
    }
  }
  // Tangente horizontal y curvatura (+ = derecha)
  const THX = new Float64Array(n), THZ = new Float64Array(n), K = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = pv(i), b = nx(i);
    let dx = X[b] - X[a], dz = Z[b] - Z[a]; const l = Math.hypot(dx, dz) || 1;
    THX[i] = dx / l; THZ[i] = dz / l;
  }
  for (let i = 0; i < n; i++) {
    const a = pv(i), b = nx(i);
    const dtx = THX[b] - THX[a], dtz = THZ[b] - THZ[a];
    const ds = closed || (i > 0 && i < n - 1) ? 2 * step : step;
    K[i] = (dtx * -THZ[i] + dtz * THX[i]) / ds; // dT · right_horizontal
  }
  const smoothK = (rad) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -rad; k <= rad; k++) { const j = i + k; if (!closed && (j < 0 || j >= n)) continue; s += K[wrapI(j)]; c++; } o[i] = s / c; } return o; };
  const KS = smoothK(5), KL = smoothK(18);

  // Peralte (rad, + = lado derecho más bajo, curva a la derecha)
  const BANK = new Float64Array(n);
  if (def.bank) {
    let kmax = 1e-6, ksum = 0; for (let i = 0; i < n; i++) { kmax = Math.max(kmax, Math.abs(KL[i])); ksum += KL[i]; }
    const dom = ksum < 0 ? -1 : 1; // sentido dominante (óvalo: todas a la izquierda)
    const bmax = def.bank * Math.PI / 180, bmin = (def.bankMin || 0) * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const f = smoothstep(0, 1, Math.abs(KL[i]) / kmax);
      BANK[i] = dom * (bmin + (bmax - bmin) * f);
    }
    // en pistas con curvas en ambos sentidos el mínimo no aplica en rectas
    if (!(def.kind === 'oval')) for (let i = 0; i < n; i++) BANK[i] = Math.sign(KL[i]) * bmax * smoothstep(0, 1, Math.abs(KL[i]) / kmax);
  }
  // Altura del centro: el borde bajo del peralte queda a la altura base
  const CY = new Float64Array(n);
  for (let i = 0; i < n; i++) CY[i] = Y[i] + HW[i] * Math.abs(Math.sin(BANK[i]));

  // Marco: T (3D), Rh (derecha horizontal), R (derecha sobre el piso), N (normal)
  const TX = new Float32Array(n), TY = new Float32Array(n), TZ = new Float32Array(n);
  const RX = new Float32Array(n), RY = new Float32Array(n), RZ = new Float32Array(n);
  const NX = new Float32Array(n), NY = new Float32Array(n), NZ = new Float32Array(n);
  const RHX = new Float32Array(n), RHZ = new Float32Array(n), RXZ = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = pv(i), b = nx(i);
    let tx = X[b] - X[a], ty = CY[b] - CY[a], tz = Z[b] - Z[a];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const rhx = -THZ[i], rhz = THX[i];
    const cb = Math.cos(BANK[i]), sb = Math.sin(BANK[i]);
    let rx = rhx * cb, ry = -sb, rz = rhz * cb;
    const d = rx * tx + ry * ty + rz * tz; rx -= tx * d; ry -= ty * d; rz -= tz * d;
    const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    TX[i] = tx; TY[i] = ty; TZ[i] = tz; RX[i] = rx; RY[i] = ry; RZ[i] = rz;
    NX[i] = ry * tz - rz * ty; NY[i] = rz * tx - rx * tz; NZ[i] = rx * ty - ry * tx;
    RHX[i] = rhx; RHZ[i] = rhz; RXZ[i] = Math.hypot(rx, rz);
  }

  // Punto del piso a una distancia lateral (sobre el camino sigue el peralte; fuera, plano a la altura del borde)
  const edgePoint = (i, lat) => {
    const a = Math.abs(lat), sg = lat < 0 ? -1 : 1, h = HW[i];
    if (a <= h) return [X[i] + RX[i] * lat, CY[i] + RY[i] * lat, Z[i] + RZ[i] * lat];
    const ex = X[i] + RX[i] * h * sg, ey = CY[i] + RY[i] * h * sg, ez = Z[i] + RZ[i] * h * sg;
    return [ex + RHX[i] * sg * (a - h), ey, ez + RHZ[i] * sg * (a - h)];
  };

  // ---------------------------------------------------------------- rejilla espacial
  const GC = 24;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { minX = Math.min(minX, X[i]); maxX = Math.max(maxX, X[i]); minZ = Math.min(minZ, Z[i]); maxZ = Math.max(maxZ, Z[i]); minY = Math.min(minY, Y[i]); maxY = Math.max(maxY, CY[i]); }
  const gx0 = minX - 120, gz0 = minZ - 120;
  const gw = Math.ceil((maxX - minX + 240) / GC) + 1, gh = Math.ceil((maxZ - minZ + 240) / GC) + 1;
  const cellStart = new Int32Array(gw * gh + 1), cellItems = new Int32Array(n);
  {
    const cellOf = new Int32Array(n);
    for (let i = 0; i < n; i++) { const c = Math.floor((Z[i] - gz0) / GC) * gw + Math.floor((X[i] - gx0) / GC); cellOf[i] = c; cellStart[c + 1]++; }
    for (let c = 0; c < gw * gh; c++) cellStart[c + 1] += cellStart[c];
    const fill = cellStart.slice(0, gw * gh);
    for (let i = 0; i < n; i++) cellItems[fill[cellOf[i]]++] = i;
  }
  // Muestra más cercana (horizontal). maxDist limita la búsqueda (devuelve -1 si no hay nada cerca).
  function nearest(px, pz, maxDist = Infinity) {
    const cx = Math.floor((px - gx0) / GC), cz = Math.floor((pz - gz0) / GC);
    const inside = cx >= 0 && cz >= 0 && cx < gw && cz < gh;
    if (!inside && maxDist === Infinity) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const d = (X[i] - px) ** 2 + (Z[i] - pz) ** 2; if (d < bd) { bd = d; best = i; } }
      return best;
    }
    let best = -1, bd = Infinity;
    const rMax = Math.min(Math.max(gw, gh), Math.ceil(maxDist / GC) + 1);
    for (let r = 0; r <= rMax; r++) {
      for (let zz = cz - r; zz <= cz + r; zz++) {
        if (zz < 0 || zz >= gh) continue;
        const edgeRow = zz === cz - r || zz === cz + r;
        for (let xx = cx - r; xx <= cx + r; xx += (edgeRow ? 1 : 2 * r || 1)) {
          if (xx < 0 || xx >= gw) continue;
          const c = zz * gw + xx;
          for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
            const i = cellItems[k], d = (X[i] - px) ** 2 + (Z[i] - pz) ** 2;
            if (d < bd) { bd = d; best = i; }
          }
        }
      }
      if (best >= 0 && Math.sqrt(bd) <= r * GC) break;
    }
    if (best >= 0 && bd > maxDist * maxDist) return -1;
    return best;
  }
  // muestras dentro de un radio (para recortar barreras)
  function around(px, pz, rad, fn) {
    const c0x = Math.max(0, Math.floor((px - rad - gx0) / GC)), c1x = Math.min(gw - 1, Math.floor((px + rad - gx0) / GC));
    const c0z = Math.max(0, Math.floor((pz - rad - gz0) / GC)), c1z = Math.min(gh - 1, Math.floor((pz + rad - gz0) / GC));
    for (let zz = c0z; zz <= c1z; zz++) for (let xx = c0x; xx <= c1x; xx++) {
      const c = zz * gw + xx;
      for (let k = cellStart[c]; k < cellStart[c + 1]; k++) fn(cellItems[k]);
    }
  }

  // ---------------------------------------------------------------- pits
  const PIT = new Float32Array(n).fill(NaN);
  let pitHalf = 4.5, pitZone = null, pitSide = -1, pitA = -1, pitB = -1;
  if (def.osmPit) {
    const P = def.osmPit;
    pitHalf = (P.width || 9) / 2;
    const dense = resample(catmullRom(P.pts.map(p => [p[0], p[1], 0, 9]), false, 0.5, 1), 1, false);
    pitA = nearest(P.pts[0][0], P.pts[0][1]);
    pitB = nearest(P.pts[P.pts.length - 1][0], P.pts[P.pts.length - 1][1]);
    let ptr = 0, sumSide = 0;
    for (let k = 0, i = pitA; k < n; k++, i = nx(i)) {
      let best = ptr, bd = Infinity;
      for (let j = Math.max(0, ptr - 5); j < Math.min(dense.n, ptr + 80); j++) {
        const d = (dense.x[j] - X[i]) ** 2 + (dense.z[j] - Z[i]) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      ptr = best;
      const lat = (dense.x[best] - X[i]) * RHX[i] + (dense.z[best] - Z[i]) * RHZ[i];
      PIT[i] = lat; sumSide += lat;
      if (i === pitB) break;
    }
    pitSide = sumSide < 0 ? -1 : 1;
  } else if (def.pit) {
    const P = def.pit;
    pitHalf = (P.width || 9) / 2; pitSide = P.side === 'right' ? 1 : -1;
    pitA = wrapI(Math.round(P.from * n)); pitB = wrapI(Math.round(P.to * n));
    let len = pitB - pitA; if (len < 0) len += n;
    const taper = Math.round(70 / step);
    for (let k = 0; k <= len; k++) {
      const i = wrapI(pitA + k);
      const f = Math.min(smoothstep(0, taper, k), smoothstep(0, taper, len - k));
      PIT[i] = pitSide * P.offset * f;
    }
  }
  if (pitA >= 0) pitZone = { from: pitA * step, to: pitB * step };
  const pitWide = i => !Number.isNaN(PIT[i]) && Math.abs(PIT[i]) > HW[i] + 1;

  // ---------------------------------------------------------------- escapatorias, barreras y pianos
  const LW = new Float64Array(n), RW = new Float64Array(n);
  const RUN = [new Uint8Array(n), new Uint8Array(n)]; // [izq, der]
  const WT = [new Uint8Array(n), new Uint8Array(n)];
  const base = def.walls || TH.base;
  for (let i = 0; i < n; i++) {
    const ex = TH.extra * clamp(Math.abs(KL[i]) * 55, 0, 1);
    LW[i] = HW[i] + base[0] + (KL[i] > 0 ? ex : 0);
    RW[i] = HW[i] + base[1] + (KL[i] < 0 ? ex : 0);
    const curveL = KL[i] > 1 / 140 && TH.curveRun != null, curveR = KL[i] < -1 / 140 && TH.curveRun != null;
    RUN[0][i] = curveL ? TH.curveRun : TH.run[0];
    RUN[1][i] = curveR ? TH.curveRun : TH.run[1];
    WT[0][i] = (curveL && TH.curveBarrier) ? B[TH.curveBarrier] : B[TH.innerBarrier || TH.barrier];
    WT[1][i] = (curveR && TH.curveBarrier) ? B[TH.curveBarrier] : B[TH.barrier];
    if (def.theme === 'ovalo') { WT[0][i] = B.concreto; WT[1][i] = B.safer; }
  }
  if (arena) for (let i = 0; i < n; i++) { LW[i] = 400; RW[i] = HW[i] + 0.6; WT[0][i] = 0; WT[1][i] = B.concreto; RUN[0][i] = RUN[1][i] = ASF; }
  // pits: el muro de ese lado se abre para incluir el carril
  for (let i = 0; i < n; i++) if (!Number.isNaN(PIT[i]) && Math.abs(PIT[i]) > 0.5) {
    const need = Math.abs(PIT[i]) + pitHalf + 7;
    if (pitSide < 0) LW[i] = Math.max(LW[i], need); else RW[i] = Math.max(RW[i], need);
    if (pitWide(i)) {
      // donde hay garajes (tramo recto) la fachada hace de barrera; en el resto, concreto
      const garage = (def.theme === 'autodromo' || def.theme === 'ovalo') && Math.abs(KL[i]) < 1 / 300;
      const sideI = pitSide < 0 ? 0 : 1;
      RUN[sideI][i] = def.theme === 'ovalo' ? ASF : PASTO;
      WT[sideI][i] = garage ? 0 : B.concreto;
    }
  }
  // recorte: ninguna barrera cruza la mediatriz con otra parte de la pista; tampoco el centro de curvatura
  const clipWalls = (W, sg) => {
    const out = Float64Array.from(W);
    for (let i = 0; i < n; i++) {
      if (arena && sg < 0) continue;
      let lim = W[i];
      const rx = RHX[i] * sg, rz = RHZ[i] * sg;
      const arcMin = Math.max(60, 3 * W[i]);
      around(X[i], Z[i], W[i] * 2 + 10, j => {
        let arc = Math.abs(j - i) * step; if (closed) arc = Math.min(arc, L - arc);
        if (arc < arcMin) return;
        const dx = X[j] - X[i], dz = Z[j] - Z[i], dot = dx * rx + dz * rz;
        if (dot <= 0.05 * Math.hypot(dx, dz)) return;
        const b = (dx * dx + dz * dz) / (2 * dot) - 1.5;
        if (b < lim) lim = b;
      });
      const kin = KS[i] * sg; // >0: este lado es el interior de la curva
      if (kin > 1e-4) lim = Math.min(lim, 0.85 / kin);
      out[i] = Math.max(HW[i] + 0.8, lim);
    }
    // mínimo local y luego promedio, para que la barrera no zigzaguee
    const m = new Float64Array(n);
    for (let i = 0; i < n; i++) { let v = Infinity; for (let k = -4; k <= 4; k++) { const j = i + k; if (!closed && (j < 0 || j >= n)) continue; v = Math.min(v, out[wrapI(j)]); } m[i] = v; }
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -4; k <= 4; k++) { const j = i + k; if (!closed && (j < 0 || j >= n)) continue; s += m[wrapI(j)]; c++; } W[i] = Math.max(HW[i] + 0.8, s / c); }
  };
  clipWalls(LW, -1); clipWalls(RW, 1);

  // pianos en el vértice de las curvas
  const KB = [new Uint8Array(n), new Uint8Array(n)];
  if (TH.kerbs) {
    const thIn = TH.kerbs === 'pocas' ? 1 / 45 : 1 / 110, thOut = TH.kerbs === 'pocas' ? 1 / 25 : 1 / 50;
    const raw = [new Uint8Array(n), new Uint8Array(n)];
    for (let i = 0; i < n; i++) {
      if (KS[i] > thIn) raw[1][i] = 1; else if (KS[i] < -thIn) raw[0][i] = 1;
      if (KS[i] > thOut) raw[0][i] = 1; else if (KS[i] < -thOut) raw[1][i] = 1;
    }
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < n; i++) if (raw[s][i]) for (let k = -5; k <= 5; k++) { const j = i + k; if (closed || (j >= 0 && j < n)) KB[s][wrapI(j)] = 1; }
      for (let i = 0; i < n; i++) if (pitWide(i) && (s === 0) === (pitSide < 0)) KB[s][i] = 0;
    }
  }
  let wallMax = 0; for (let i = 0; i < n; i++) wallMax = Math.max(wallMax, Math.min(LW[i], 200), RW[i]);

  // ---------------------------------------------------------------- consulta de superficie
  function localSearch(px, pz, h) {
    const W = 24;
    let best = -1, bd = Infinity, bk = 0;
    for (let k = -W; k <= W; k++) {
      let j = h + k;
      if (closed) j = ((j % n) + n) % n; else if (j < 0 || j >= n) continue;
      const d = (X[j] - px) ** 2 + (Z[j] - pz) ** 2;
      if (d < bd) { bd = d; best = j; bk = k; }
    }
    if (best < 0) return -1;
    const atEdge = Math.abs(bk) >= W - 1 && (closed || (best > 0 && best < n - 1));
    if (atEdge) return -1;
    const lim = Math.min(Math.max(LW[best], RW[best]), 300) + 25;
    return bd > lim * lim ? -1 : best;
  }

  function newSurface() {
    return { index: 0, distance: 0, lateral: 0, halfWidth: 0, leftWall: 0, rightWall: 0, height: 0,
      normal: new THREE.Vector3(0, 1, 0), tangent: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0),
      surface: 'asfalto', grip: 1, drag: 0, inPit: false, offTrack: false };
  }

  function query(pos, hint, out) {
    const px = pos.x, pz = pos.z;
    let i = -1;
    if (hint != null && hint >= 0 && hint < n) i = localSearch(px, pz, hint | 0);
    if (i < 0) i = nearest(px, pz);
    // proyección sobre el segmento vecino más cercano
    let a = i, t = 0, bestD = Infinity;
    for (let s = 0; s < 2; s++) {
      const j0 = s === 0 ? pv(i) : i, j1 = s === 0 ? i : nx(i);
      if (j0 === j1) continue;
      const sx = X[j1] - X[j0], sz = Z[j1] - Z[j0], l2 = sx * sx + sz * sz || 1;
      const tt = clamp(((px - X[j0]) * sx + (pz - Z[j0]) * sz) / l2, 0, 1);
      const d = (X[j0] + sx * tt - px) ** 2 + (Z[j0] + sz * tt - pz) ** 2;
      if (d < bestD) { bestD = d; a = j0; t = tt; }
    }
    const b = nx(a), u = 1 - t;
    const S = out || newSurface();
    const cx = X[a] * u + X[b] * t, cz = Z[a] * u + Z[b] * t, cy = CY[a] * u + CY[b] * t;
    const hw = HW[a] * u + HW[b] * t;
    let rhx = RHX[a] * u + RHX[b] * t, rhz = RHZ[a] * u + RHZ[b] * t; const rhl = Math.hypot(rhx, rhz) || 1; rhx /= rhl; rhz /= rhl;
    const rxz = RXZ[a] * u + RXZ[b] * t, ry = RY[a] * u + RY[b] * t;
    const latH = (px - cx) * rhx + (pz - cz) * rhz;
    const roadH = hw * rxz;
    const al = Math.abs(latH), sg = latH < 0 ? -1 : 1;
    const lateral = al <= roadH ? latH / rxz : sg * (hw + (al - roadH));
    const alat = Math.abs(lateral);
    const height = alat <= hw ? cy + ry * lateral : cy + ry * hw * sg;
    let dist = (a + t) * step; if (closed && dist >= L) dist -= L;
    S.index = t < 0.5 ? a : b;
    S.distance = dist; S.lateral = lateral; S.halfWidth = hw;
    S.leftWall = LW[a] * u + LW[b] * t; S.rightWall = RW[a] * u + RW[b] * t;
    S.height = height;
    S.tangent.set(TX[a] * u + TX[b] * t, TY[a] * u + TY[b] * t, TZ[a] * u + TZ[b] * t).normalize();
    S.right.set(RX[a] * u + RX[b] * t, ry, RZ[a] * u + RZ[b] * t).normalize();
    if (alat <= hw) S.normal.set(NX[a] * u + NX[b] * t, NY[a] * u + NY[b] * t, NZ[a] * u + NZ[b] * t).normalize();
    else { const T = S.tangent; S.normal.set(-rhz * T.y, rhz * T.x - rhx * T.z, rhx * T.y).normalize(); if (S.normal.y < 0) S.normal.negate(); }
    // tipo de superficie
    const side = sg < 0 ? 0 : 1, ref = t < 0.5 ? a : b;
    let code, on = false, inPit = false;
    const po = Number.isNaN(PIT[a]) || Number.isNaN(PIT[b]) ? NaN : PIT[a] * u + PIT[b] * t;
    if (arena) { code = ASF; on = true; }
    else if (!Number.isNaN(po) && Math.abs(po) > hw + 1 && Math.abs(lateral - po) <= pitHalf + 0.3) { code = ASF; on = true; inPit = true; }
    else if (alat <= hw) { code = roadSurf[ref]; on = true; if (KB[side][ref] && alat > hw - KERB_IN) code = PIANO; }
    else if (KB[side][ref] && alat <= hw + KERB_OUT) { code = PIANO; on = true; }
    else if (!Number.isNaN(po) && Math.abs(po) > hw + 1 && Math.sign(lateral) === Math.sign(po) && Math.abs(lateral) > Math.abs(po)) code = ASF; // explanada de garajes
    else code = RUN[side][ref];
    S.surface = SURFACES[code];
    S.grip = on ? GRIP_ON[code] : GRIP_OFF[code];
    S.drag = on ? DRAG_ON[code] : DRAG_OFF[code];
    S.inPit = inPit; S.offTrack = !on;
    return S;
  }

  function sampleAt(dist) {
    let d = dist;
    if (closed) { d = d % L; if (d < 0) d += L; } else d = clamp(d, 0, L);
    const f = d / step; let a = Math.floor(f); if (a >= n) a = n - 1;
    const t = closed ? f - a : (a >= n - 1 ? 0 : f - a);
    const b = nx(a), u = 1 - t;
    const cy = CY[a] * u + CY[b] * t;
    return {
      index: t < 0.5 ? a : b, distance: d,
      pos: new THREE.Vector3(X[a] * u + X[b] * t, cy, Z[a] * u + Z[b] * t),
      tangent: new THREE.Vector3(TX[a] * u + TX[b] * t, TY[a] * u + TY[b] * t, TZ[a] * u + TZ[b] * t).normalize(),
      right: new THREE.Vector3(RX[a] * u + RX[b] * t, RY[a] * u + RY[b] * t, RZ[a] * u + RZ[b] * t).normalize(),
      normal: new THREE.Vector3(NX[a] * u + NX[b] * t, NY[a] * u + NY[b] * t, NZ[a] * u + NZ[b] * t).normalize(),
      halfWidth: HW[a] * u + HW[b] * t, curvature: KS[a] * u + KS[b] * t, height: cy,
      banking: BANK[a] * u + BANK[b] * t, leftWall: LW[a] * u + LW[b] * t, rightWall: RW[a] * u + RW[b] * t,
    };
  }

  // lado del interior de la primera curva (para la pole)
  let poleSide = -1;
  for (let k = 0; k < Math.min(n, 400); k++) { const i = wrapI(Math.round(C.startDistance / step) + k); if (Math.abs(KS[i]) > 1 / 150) { poleSide = KS[i] > 0 ? 1 : -1; break; } }

  function gridSlots(count) {
    const out = [];
    const startD = closed ? L : C.startDistance;
    for (let k = 0; k < count; k++) {
      let d, lat;
      if (drag) {
        const perRow = 8, row = Math.floor(k / perRow), m = Math.min(perRow, count - row * perRow), c = k % perRow;
        const sp = Math.min(3.4, (2 * HW[0] - 4) / Math.max(1, m));
        d = startD - 2.4 - row * 9; lat = (c - (m - 1) / 2) * sp;
      } else {
        const row = Math.floor(k / 2), c = k % 2;
        d = startD - 6 - row * 8 - c * 4;
        const sp = arena ? 3 : Math.min(HW[0] * 0.42, 3.2);
        lat = (c === 0 ? poleSide : -poleSide) * sp;
      }
      const s = sampleAt(d);
      const pos = s.pos.clone().addScaledVector(s.right, lat);
      out.push({ pos, yaw: Math.atan2(-s.tangent.x, -s.tangent.z) });
    }
    return out;
  }

  // ---------------------------------------------------------------- mallas
  const group = new THREE.Group(); group.name = 'pista:' + def.id;
  const R = rng(def.id + ':pista');
  const wet = weather === 'rain';
  const aniso = semi ? 8 : 4;
  const staticB = new GeoBuilder(), glowB = new GeoBuilder(), paintB = new GeoBuilder(), bannerB = new GeoBuilder();
  const matStatic = material(quality, { vertexColors: true, flat: true });
  const matGlow = basic({ vertexColors: true, toneMapped: false });
  const matPaint = material(quality, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const banners = textAtlas([
    { text: 'META', color: '#ffffff', bg: '#c41616' }, { text: 'SALIDA', color: '#ffffff', bg: '#1b5fc4' },
    { text: 'ASFALTO REGIO', color: '#ffd23f', bg: '#14161c' }, { text: 'PITS', color: '#111', bg: '#ffd23f', fg: '#111' },
    { text: 'LLANTAS ÁGUILA', color: '#ffffff', bg: '#d4471c' }, { text: 'ACEITES NORTEÑO', color: '#ffd23f', bg: '#0f4a2a' },
    { text: 'REFRESCOS BRAVO', color: '#ffffff', bg: '#b8122f' }, { text: 'TALLER GARZA', color: '#111', bg: '#f2f2f2', fg: '#111' },
    { text: 'GASOLINERA LA ESTRELLA', color: '#ffffff', bg: '#123c8c' }, { text: 'ZONA DE DERRAPE', color: '#111', bg: '#ffd23f', fg: '#111' },
    { text: 'RADIO REGIA 101', color: '#ffffff', bg: '#5a1a8c' }, { text: 'FRENOS DEL BRAVO', color: '#111', bg: '#e9e9e9', fg: '#111' },
  ], { cellW: 256, cellH: 64, cols: 4, glow: false });
  const matBanner = material(quality, { map: banners.tex, vertexColors: true, side: THREE.DoubleSide });
  const WHITE = [1, 1, 1];
  // Cartel plano con un texto del atlas (centro, ancho, alto, orientación por vector derecho)
  const banner = (idx, cx, cy, cz, w, h, rx, rz, b = bannerB) => {
    const [u0, v0, u1, v1] = banners.rect(idx);
    const hx = rx * w / 2, hz = rz * w / 2;
    b.quad([cx - hx, cy, cz - hz], [cx + hx, cy, cz + hz], [cx + hx, cy + h, cz + hz], [cx - hx, cy + h, cz - hz], WHITE, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  };

  // 1) Camino (cinta indexada; en cerradas se repite la primera fila para no cortar la textura)
  const roadKind = arena ? 'concreto' : TH.road;
  const ROAD_LEN = roadKind === 'calle' ? 12 : 16;
  if (!arena) {
    const rows = closed ? n + 1 : n, across = semi ? 3 : 2;
    const pos = new Float32Array(rows * across * 3), nor = new Float32Array(rows * across * 3), uv = new Float32Array(rows * across * 2);
    for (let r = 0; r < rows; r++) {
      const i = r % n;
      for (let c = 0; c < across; c++) {
        const f = c / (across - 1), lat = -HW[i] + 2 * HW[i] * f, o = (r * across + c);
        pos[o * 3] = X[i] + RX[i] * lat; pos[o * 3 + 1] = CY[i] + RY[i] * lat; pos[o * 3 + 2] = Z[i] + RZ[i] * lat;
        nor[o * 3] = NX[i]; nor[o * 3 + 1] = NY[i]; nor[o * 3 + 2] = NZ[i];
        uv[o * 2] = f; uv[o * 2 + 1] = (r * step) / ROAD_LEN;
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < across - 1; c++) {
      const a = r * across + c, b = a + 1, d = a + across, e = d + 1;
      idx.push(a, b, e, a, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const tex = roadTex(roadKind === 'asfalto' && def.theme === 'puerto' ? 'asfalto' : roadKind, R, aniso);
    const rm = material(quality, { map: tex, color: wet ? 0x8a8c90 : 0xffffff, roughness: wet ? 0.35 : 0.92, metalness: wet ? 0.1 : 0 });
    const mesh = new THREE.Mesh(g, rm); mesh.receiveShadow = semi; mesh.name = 'camino';
    group.add(mesh);
  }

  // 2) Escapatorias (de la orilla a la barrera) con colores por vértice
  const runB = new GeoBuilder();
  const runCol = SURF_COL.map(h => col(h));
  if (def.theme === 'neon' || def.theme === 'puerto') runCol[ASF] = col('#76767a');
  if (def.theme === 'aerodromo') runCol[ASF] = col('#8d8c86');
  if (def.theme === 'ovalo') runCol[ASF] = col('#4a4c50');
  if (!arena) for (let s = 0; s < 2; s++) {
    const sg = s ? 1 : -1, W = s ? RW : LW;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const j = nx(i);
      const wi = Math.min(W[i], 260), wj = Math.min(W[j], 260);
      const a0 = edgePoint(i, sg * HW[i]), a1 = edgePoint(j, sg * HW[j]), b0 = edgePoint(i, sg * wi), b1 = edgePoint(j, sg * wj);
      for (const p of [a0, a1, b0, b1]) p[1] -= 0.012;
      let c = runCol[RUN[s][i]];
      const stripe = RUN[s][i] === PASTO ? 1 + 0.07 * Math.sign(Math.sin((i * step) / 9)) : 1;
      c = shade(c, stripe);
      if (s) runB.quad(a0, b0, b1, a1, c); else runB.quad(b0, a0, a1, b1, c);
    }
  }
  runB.mesh(group, material(quality, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }), { receive: semi, name: 'escapatorias' });

  // 3) Pianos (textura roja/blanca a lo largo)
  if (TH.kerbs) {
    const kb = new GeoBuilder();
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1;
      const last = closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const j = nx(i);
        if (!KB[s][i] || !KB[s][j]) continue;
        const p0 = edgePoint(i, sg * (HW[i] - KERB_IN)), p1 = edgePoint(j, sg * (HW[j] - KERB_IN));
        const q0 = edgePoint(i, sg * (HW[i] + KERB_OUT)), q1 = edgePoint(j, sg * (HW[j] + KERB_OUT));
        for (const p of [p0, p1]) p[1] += 0.015;
        for (const p of [q0, q1]) p[1] += 0.03;
        const v0 = (i * step) / 3, v1 = v0 + step / 3;
        if (s) kb.quad(p0, q0, q1, p1, WHITE, [[0, v0], [1, v0], [1, v1], [0, v1]]);
        else kb.quad(q0, p0, p1, q1, WHITE, [[1, v0], [0, v0], [0, v1], [1, v1]]);
      }
    }
    kb.mesh(group, material(quality, { map: kerbTex(), vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { receive: semi, name: 'pianos' });
  }

  // 4) Carril de pits (cinta paralela) y explanada
  if (pitA >= 0) {
    const pb = new GeoBuilder();
    const apron = col('#6c6d70');
    for (let k = 0, i = pitA; k < n; k++, i = nx(i)) {
      const j = nx(i);
      if (i === pitB || Number.isNaN(PIT[j])) break;
      if (!pitWide(i) && !pitWide(j)) continue;
      const o0 = PIT[i], o1 = PIT[j];
      const in0 = edgePoint(i, o0 - pitHalf), out0 = edgePoint(i, o0 + pitHalf), in1 = edgePoint(j, o1 - pitHalf), out1 = edgePoint(j, o1 + pitHalf);
      const v0 = (k * step) / 16, v1 = v0 + step / 16;
      pb.quad(in0, out0, out1, in1, WHITE, [[0, v0], [1, v0], [1, v1], [0, v1]]);
      // explanada de garajes: del borde exterior del carril a la barrera
      const W = pitSide < 0 ? LW : RW;
      if (pitWide(i) && pitWide(j)) {
        const e0 = pitSide < 0 ? edgePoint(i, -W[i]) : edgePoint(i, W[i]), e1 = pitSide < 0 ? edgePoint(j, -W[j]) : edgePoint(j, W[j]);
        const f0 = pitSide < 0 ? in0 : out0, f1 = pitSide < 0 ? in1 : out1;
        if (pitSide < 0) staticB.quad([e0[0], e0[1] - 0.004, e0[2]], [f0[0], f0[1] - 0.004, f0[2]], [f1[0], f1[1] - 0.004, f1[2]], [e1[0], e1[1] - 0.004, e1[2]], apron);
        else staticB.quad([f0[0], f0[1] - 0.004, f0[2]], [e0[0], e0[1] - 0.004, e0[2]], [e1[0], e1[1] - 0.004, e1[2]], [f1[0], f1[1] - 0.004, f1[2]], apron);
      }
    }
    pb.mesh(group, material(quality, { map: roadTex('pits', R, aniso), vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), { receive: semi, name: 'pits' });
  }

  // 5) Barreras
  const wallB = new GeoBuilder(), tireB = new GeoBuilder(), railB = new GeoBuilder(), fenceB = new GeoBuilder();
  const postMats = [];
  const cConc = col('#c9c7c0'), cConcDark = col('#9d9b95'), cRed = col('#c42020'), cBlue = col('#2a6fd1'), cSand = col('#cfae78'), cSnow = col('#f2f6fa');
  const fenceOn = (s, i) => {
    const t = WT[s][i];
    if (TH.fence === 'todo') return t === B.concreto;
    if (TH.fence === 'exterior') return s === 1;
    if (TH.fence === 'rectas') return t === B.concreto && Math.abs(KL[i]) < 1 / 300 && (s === 1 || !pitWide(i));
    return false;
  };
  const quadIJ = (b, Pi, Pj, Qj, Qi, flip, c, uv) => { if (flip) b.quad(Pj, Pi, Qi, Qj, c, uv && [uv[1], uv[0], uv[3], uv[2]]); else b.quad(Pi, Pj, Qj, Qi, c, uv); };
  for (let s = 0; s < 2; s++) {
    const sg = s ? 1 : -1, W = s ? RW : LW, flipIn = sg > 0;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const j = nx(i), t = WT[s][i];
      if (!t || W[i] > 250) continue;
      const th = t === B.llantas ? 0.9 : t === B.berma ? 3 : t === B.nieve ? 2.4 : t === B.guardarriel ? 0.25 : 0.5;
      const h = t === B.safer ? 1.25 : t === B.berma ? 0.9 : t === B.nieve ? 1.1 : t === B.llantas ? 0.95 : 1.0;
      const IBi = edgePoint(i, sg * W[i]), IBj = edgePoint(j, sg * W[j]);
      const OBi = edgePoint(i, sg * (W[i] + th)), OBj = edgePoint(j, sg * (W[j] + th));
      const up = (p, dy) => [p[0], p[1] + dy, p[2]];
      if (t === B.concreto || t === B.safer || t === B.llantas) {
        const b = t === B.llantas ? tireB : wallB;
        let c = cConc;
        if (t === B.concreto) {
          const seg = Math.floor(i * step / 6);
          if (def.theme === 'autodromo' || def.theme === 'puerto') c = seg % 2 ? cConc : (def.theme === 'autodromo' ? cRed : col('#e0b020'));
          else if (def.theme === 'aerodromo' || arena) c = seg % 2 ? cConc : col('#d84a1a');
          else c = (seg % 3 === 0) ? cConcDark : cConc;
        }
        if (t === B.safer) c = cSnow;
        const v0 = (i * step) / 4, v1 = v0 + step / 4;
        const uvIn = t === B.llantas ? [[v0, 0], [v1, 0], [v1, 1], [v0, 1]] : null;
        quadIJ(b, IBi, IBj, up(IBj, h), up(IBi, h), flipIn, c, uvIn);
        quadIJ(b, up(IBi, h), up(IBj, h), up(OBj, h), up(OBi, h), flipIn, t === B.llantas ? c : shade(c, 1.08), t === B.llantas ? [[v0, 0.9], [v1, 0.9], [v1, 0.95], [v0, 0.95]] : null);
        quadIJ(b, OBi, OBj, up(OBj, h), up(OBi, h), !flipIn, shade(c, 0.85), uvIn);
        if (t === B.safer) { // franja azul de amortiguamiento
          const ii = edgePoint(i, sg * (W[i] - 0.02)), jj = edgePoint(j, sg * (W[j] - 0.02));
          quadIJ(wallB, up(ii, 0.25), up(jj, 0.25), up(jj, 0.55), up(ii, 0.55), flipIn, cBlue);
        }
        if (fenceOn(s, i)) {
          const fh = def.theme === 'ovalo' ? 5 : 3.2;
          const f0 = up(IBi, h), f1 = up(IBj, h);
          fenceB.quad(f0, f1, up(f1, fh), up(f0, fh), WHITE, [[v0 * 2, 0], [v1 * 2, 0], [v1 * 2, fh / 1.6], [v0 * 2, fh / 1.6]]);
          if (i % 3 === 0) postMats.push(trs(f0[0], f0[1], f0[2], 0, 1, fh, 1));
        }
      } else if (t === B.guardarriel) {
        const a0 = up(IBi, 0.45), a1 = up(IBj, 0.45);
        const cR = col('#b9bec4');
        quadIJ(railB, a0, a1, up(a1, 0.34), up(a0, 0.34), flipIn, cR);
        quadIJ(railB, a0, a1, up(a1, 0.34), up(a0, 0.34), !flipIn, shade(cR, 0.7));
        if (i % 2 === 0) postMats.push(trs(IBi[0], IBi[1], IBi[2], 0, 1, 0.82, 1));
      } else if (t === B.berma || t === B.nieve) {
        const c = t === B.berma ? cSand : cSnow;
        const mid0 = edgePoint(i, sg * (W[i] + th * 0.45)), mid1 = edgePoint(j, sg * (W[j] + th * 0.45));
        quadIJ(wallB, IBi, IBj, up(mid1, h), up(mid0, h), flipIn, c);
        quadIJ(wallB, up(mid0, h), up(mid1, h), OBj, OBi, flipIn, shade(c, 0.92));
      }
    }
  }
  wallB.mesh(group, matStatic, { cast: semi, receive: semi, name: 'barreras' });
  tireB.mesh(group, material(quality, { map: tireTex(), vertexColors: true }), { name: 'llantas' });
  railB.mesh(group, material(quality, { vertexColors: true, metalness: 0.6, roughness: 0.4 }), { name: 'guardarriel' });
  fenceB.mesh(group, material(quality, { map: fenceTex(), vertexColors: true, transparent: false, alphaTest: 0.4, side: THREE.DoubleSide }), { name: 'malla' });
  if (postMats.length) {
    const pg = new THREE.BoxGeometry(0.12, 1, 0.12); pg.translate(0, 0.5, 0);
    group.add(instanced(pg, material(quality, { color: 0x8c9096, metalness: 0.5, roughness: 0.5 }), postMats));
  }

  // 6) Taludes: del pie exterior de la barrera hasta el suelo (pistas elevadas / peraltadas)
  const groundY = TH.terrain ? minY - 60 : Math.min(0, minY) - 0.03;
  if (!TH.terrain && !arena) {
    const tb = new GeoBuilder(), gcol = col(TH.ground);
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1, W = s ? RW : LW;
      const last = closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const j = nx(i);
        if (W[i] > 250) continue;
        const a0 = edgePoint(i, sg * (W[i] + 0.4)), a1 = edgePoint(j, sg * (W[j] + 0.4));
        const dh0 = a0[1] - groundY, dh1 = a1[1] - groundY;
        if (dh0 < 0.15 && dh1 < 0.15) continue;
        const b0 = edgePoint(i, sg * (W[i] + 0.4 + dh0 * 1.6)), b1 = edgePoint(j, sg * (W[j] + 0.4 + dh1 * 1.6));
        b0[1] = groundY; b1[1] = groundY;
        if (s) tb.quad(a0, b0, b1, a1, gcol); else tb.quad(b0, a0, a1, b1, gcol);
      }
    }
    tb.mesh(group, matStatic, { receive: semi, name: 'taludes' });
  }

  // 7) Meta, salida, parrilla, semáforo
  const lights = []; // {x,y,z, kind:'red'|'amber'|'green'|'stage'}
  const gantry = (d, label, withLights) => {
    const s = sampleAt(d), i = s.index;
    const wl = Math.min(LW[i], HW[i] + 4), wr = Math.min(RW[i], HW[i] + 4);
    const pl = edgePoint(i, -wl), pr = edgePoint(i, wr);
    const top = Math.max(pl[1], pr[1]) + 6.5;
    const cG = col('#2a2d33');
    for (const p of [pl, pr]) staticB.box(p[0], p[1], p[2], 0.7, top - p[1] + 1.2, 0.7, cG, Math.atan2(-s.tangent.x, -s.tangent.z));
    const span = Math.hypot(pr[0] - pl[0], pr[2] - pl[2]);
    const mx = (pl[0] + pr[0]) / 2, mz = (pl[2] + pr[2]) / 2;
    const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
    staticB.box(mx, top, mz, span + 0.7, 1.4, 0.8, cG, yaw);
    const rx = s.right.x, rz = s.right.z, rl = Math.hypot(rx, rz);
    banner(label, mx - s.tangent.x * 0.42, top + 0.12, mz - s.tangent.z * 0.42, Math.min(span * 0.5, 9), 1.15, rx / rl, rz / rl);
    banner(2, mx + s.tangent.x * 0.42, top + 0.12, mz + s.tangent.z * 0.42, Math.min(span * 0.5, 9), 1.15, -rx / rl, -rz / rl);
    if (withLights) {
      const cnt = drag ? 0 : 5;
      for (let k = 0; k < cnt; k++) {
        const o = (k - 2) * 1.3;
        lights.push({ x: mx + rx / rl * o - s.tangent.x * 0.5, y: top - 0.45, z: mz + rz / rl * o - s.tangent.z * 0.5, kind: 'red', k });
      }
    }
    return { mx, mz, top, s };
  };
  const checkerLine = (d, w = 2) => {
    const s = sampleAt(d), i = s.index;
    const cb = new GeoBuilder();
    const a = edgePoint(i, -HW[i]), b = edgePoint(i, HW[i]);
    const tx = s.tangent.x * w / 2, tz = s.tangent.z * w / 2;
    const rep = (2 * HW[i]) / w * 4;
    cb.quad([a[0] - tx, a[1] + 0.02, a[2] - tz], [b[0] - tx, b[1] + 0.02, b[2] - tz], [b[0] + tx, b[1] + 0.02, b[2] + tz], [a[0] + tx, a[1] + 0.02, a[2] + tz], WHITE, [[0, 0], [rep, 0], [rep, 4], [0, 4]]);
    cb.mesh(group, material(quality, { map: checkerTex(), vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { name: 'cuadros' });
  };
  const paintLine = (i, lat0, lat1, along0, along1, c) => {
    const s = sampleAt(i * step);
    const a = edgePoint(i, lat0), b = edgePoint(i, lat1);
    const t = s.tangent;
    paintB.quad([a[0] + t.x * along0, a[1] + 0.02, a[2] + t.z * along0], [b[0] + t.x * along0, b[1] + 0.02, b[2] + t.z * along0], [b[0] + t.x * along1, b[1] + 0.02, b[2] + t.z * along1], [a[0] + t.x * along1, a[1] + 0.02, a[2] + t.z * along1], c);
  };
  const cW = col('#f0f0f0'), cY = col('#f2c230');
  if (closed) {
    checkerLine(0);
    gantry(arena ? 0 : 0, 0, true);
    if (!arena) for (const g of gridSlots(10)) {
      const q = query(g.pos), i = q.index, lat = q.lateral;
      const fwd = (q.distance > L / 2 ? q.distance - L : q.distance);
      const di = wrapI(Math.round(fwd / step) + 1);
      paintLine(di, lat - 1.2, lat + 1.2, 0, 0.18, cW);
      paintLine(di, lat - 1.2, lat - 1.05, -1.5, 0.18, cW);
      paintLine(di, lat + 1.05, lat + 1.2, -1.5, 0.18, cW);
    }
  } else {
    const st = Math.round(C.startDistance / step), fi = Math.round(C.finishDistance / step);
    paintLine(st, -HW[st], HW[st], 0, 0.4, cW);
    checkerLine(C.finishDistance, drag ? 3 : 2);
    gantry(C.startDistance, 1, true);
    gantry(C.finishDistance, 0, false);
    if (drag) {
      // carriles y marcas de 60, 330 y 660 pies
      const lanes = 8, sp = (2 * HW[0] - 2) / lanes;
      for (let i = Math.max(0, st - 15); i < Math.min(n - 1, fi + 40); i++) {
        for (let k = 1; k < lanes; k++) {
          const lat = -HW[i] + 1 + k * sp;
          if (i < st || (i % 6) < 3) paintLine(i, lat - 0.08, lat + 0.08, 0, step, cW);
        }
      }
      for (const ft of [60, 330, 660, 1000]) { const i = Math.round((C.startDistance + ft * 0.3048) / step); paintLine(i, -HW[i] + 1, -HW[i] + 2.5, 0, 0.3, cY); paintLine(i, HW[i] - 2.5, HW[i] - 1, 0, 0.3, cY); }
      // árbol de arrancones: torre en medio, sobre el pórtico
      const s = sampleAt(C.startDistance + 3), rl = Math.hypot(s.right.x, s.right.z), rx = s.right.x / rl, rz = s.right.z / rl;
      const cx = s.pos.x, cz = s.pos.z, top = s.pos.y + 6.3;
      staticB.box(cx, top - 3.2, cz, 0.9, 3.4, 0.5, col('#1d1f24'), Math.atan2(-s.tangent.x, -s.tangent.z));
      const kinds = ['stage', 'stage', 'amber', 'amber', 'amber', 'green', 'red'];
      kinds.forEach((kd, r) => { for (const side of [-1, 1]) lights.push({ x: cx + rx * side * 0.22 + s.tangent.x * 0.3, y: top - 0.25 - r * 0.45, z: cz + rz * side * 0.22 + s.tangent.z * 0.3, kind: kd, k: r }); });
    }
  }
  // Semáforo instanciado (setStartLights)
  let lightMesh = null;
  const LIGHT_ON = { red: col('#ff2a20', 3), amber: col('#ffb020', 3), green: col('#30ff60', 3), stage: col('#fff0c0', 2.5) };
  const LIGHT_OFF = col('#251512');
  if (lights.length) {
    const lg = new THREE.SphereGeometry(0.2, 10, 8);
    lightMesh = instanced(lg, basic({ toneMapped: false }), lights.map(l => trs(l.x, l.y, l.z)), lights.map(() => LIGHT_OFF));
    group.add(lightMesh);
  }
  function setStartLights(count = 0, go = false) {
    if (!lightMesh) return;
    const c = new THREE.Color();
    lights.forEach((l, idx) => {
      let on = false;
      if (drag) on = l.kind === 'stage' ? true : l.kind === 'amber' ? (!go && count > l.k - 2) : l.kind === 'green' ? go : false;
      else on = !go && count > l.k;
      const v = on ? LIGHT_ON[l.kind] : LIGHT_OFF;
      lightMesh.setColorAt(idx, c.setRGB(v[0], v[1], v[2]));
    });
    lightMesh.instanceColor.needsUpdate = true;
  }

  // 8) Gymkhana: conos, puertas, postes y zonas
  const props = [];
  let coneMesh = null;
  const coneAnim = new Map();
  if (def.props) {
    const counters = { cone: 0, gate: 0, post: 0, zone: 0 };
    const names = { cone: 'cono', gate: 'puerta', post: 'poste', zone: 'zona' };
    const coneMats = [];
    for (const p of def.props) {
      const [type, x, z, radius, yawDeg = 0, label] = p;
      const id = names[type] + '-' + (++counters[type]);
      const q = query({ x, z });
      const pr = { type, pos: new THREE.Vector3(x, q.height, z), radius, yaw: yawDeg * Math.PI / 180, id, knocked: false };
      if (label) pr.label = label;
      props.push(pr);
      const y = q.height;
      if (type === 'cone') { pr.ci = coneMats.length; coneMats.push(trs(x, y, z)); }
      else if (type === 'gate') {
        const rx = Math.cos(pr.yaw), rz = -Math.sin(pr.yaw);
        for (const sgn of [-1, 1]) {
          const px = x + rx * radius * sgn, pz = z + rz * radius * sgn;
          for (let k = 0; k < 6; k++) staticB.box(px, y + k * 0.4, pz, 0.28, 0.4, 0.28, k % 2 ? cW : col('#e0281c'));
        }
        bannerB.quad([x - rx * radius, y + 2.4, z - rz * radius], [x + rx * radius, y + 2.4, z + rz * radius], [x + rx * radius, y + 3.1, z + rz * radius], [x - rx * radius, y + 3.1, z - rz * radius], WHITE, (() => { const [u0, v0, u1, v1] = banners.rect(2); return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; })());
        paintLine(q.index, q.lateral - 0.1, q.lateral + 0.1, -0.05, 0.05, cY);
      } else if (type === 'post') {
        for (let k = 0; k < 8; k++) staticB.box(x, y + k * 0.35, z, 0.36, 0.35, 0.36, k % 2 ? col('#151515') : cY);
        ring(x, y, z, radius, 0.18, cY);
        ring(x, y, z, 1.2, 0.12, cW);
      } else if (type === 'zone') {
        ring(x, y, z, radius, 0.3, cY);
        bannerB.quad([x - 5, y + 0.03, z + 0.9], [x + 5, y + 0.03, z + 0.9], [x + 5, y + 0.03, z - 0.9], [x - 5, y + 0.03, z - 0.9], WHITE, (() => { const [u0, v0, u1, v1] = banners.rect(9); return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; })());
      }
    }
    if (coneMats.length) {
      const cg = partsGeo(b => {
        b.box(0, 0, 0, 0.42, 0.04, 0.42, col('#1a1a1a'));
        const cone = new THREE.CylinderGeometry(0.035, 0.17, 0.66, 10); cone.translate(0, 0.37, 0);
        b.addGeometry(cone, new THREE.Matrix4(), col('#ff5a10'));
        const band = new THREE.CylinderGeometry(0.105, 0.125, 0.12, 10); band.translate(0, 0.38, 0);
        b.addGeometry(band, new THREE.Matrix4(), col('#f4f4f4'));
      });
      coneMesh = instanced(cg, material(quality, { vertexColors: true }), coneMats, null, { cast: semi });
      coneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(coneMesh);
    }
  }
  function ring(x, y, z, r, w, c) {
    const seg = Math.max(16, Math.round(r * 5));
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
      const p = (a, rr) => [x + Math.cos(a) * rr, y + 0.025, z + Math.sin(a) * rr];
      paintB.quad(p(a0, r + w), p(a0, r - w), p(a1, r - w), p(a1, r + w), c);
    }
  }
  function knockProp(id) {
    const pr = props.find(p => p.id === id);
    if (!pr) return;
    pr.knocked = true;
    if (pr.type !== 'cone' || !coneMesh || coneAnim.has(id)) return;
    const r = rng(id);
    coneAnim.set(id, { t: 0, dir: r() * Math.PI * 2, dist: 1.5 + r() * 2, spin: (r() - 0.5) * 4 });
  }
  function resetProps() {
    coneAnim.clear();
    for (const pr of props) {
      pr.knocked = false;
      if (pr.type === 'cone' && coneMesh) coneMesh.setMatrixAt(pr.ci, trs(pr.pos.x, pr.pos.y, pr.pos.z));
    }
    if (coneMesh) coneMesh.instanceMatrix.needsUpdate = true;
  }

  // 9) Suelo: plano (temas planos) o terreno con relieve
  const N2 = noise2(7 + def.id.length);
  let natural = naturalFn(def.theme, N2, { minY, maxY, minZ, maxZ });
  // Lago congelado (tramo de hielo): el terreno queda por debajo de la superficie del hielo
  let lake = null;
  if (def.iceZone) {
    const a = Math.round(def.iceZone.from * n), b = Math.round(def.iceZone.to * n);
    let sx = 0, sz = 0, sy = 0, cnt = 0;
    for (let i = a; i <= b; i++) { sx += X[i]; sz += Z[i]; sy += CY[i]; cnt++; }
    const cx = sx / cnt, cz = sz / cnt;
    let rad = 0; for (let i = a; i <= b; i++) rad = Math.max(rad, Math.hypot(X[i] - cx, Z[i] - cz));
    lake = { cx, cz, rad: rad + 35, y: sy / cnt - 0.03 };
    const nat0 = natural;
    natural = (x, z) => { const d = Math.hypot(x - cx, (z - cz) / 0.75); const h = nat0(x, z); return d < lake.rad + 6 ? Math.min(h, lake.y - 1) : d < lake.rad + 60 ? Math.min(h, lake.y - 1 + (d - lake.rad - 6) * 0.4) : h; };
  }
  let terrainH = (x, z) => groundY;
  if (TH.terrain) {
    terrainH = (x, z) => {
      const nat = natural(x, z);
      const i = nearest(x, z, 160);
      if (i < 0) return nat;
      const lat = (x - X[i]) * RHX[i] + (z - Z[i]) * RHZ[i];
      const sg = lat < 0 ? -1 : 1, W = Math.min(sg < 0 ? LW[i] : RW[i], 120);
      const over = Math.abs(lat) - W;
      const edge = CY[i] + RY[i] * HW[i] * sg - 0.3;
      const blend = def.theme === 'montana' ? 34 : 55;
      if (lake && Math.hypot(x - lake.cx, (z - lake.cz) / 0.75) < lake.rad + 6) return Math.min(nat, edge - 0.6);
      if (over <= 2) return edge - (over > -1 ? 0.2 : 0);
      const w = smoothstep(2, blend, over);
      return edge + (nat - edge) * w;
    };
    const margin = def.theme === 'montana' ? 380 : 420;
    const cell = semi ? 9 : 12;
    const x0 = minX - margin, x1 = maxX + margin, z0 = minZ - margin, z1 = maxZ + margin;
    const cx = Math.ceil((x1 - x0) / cell), cz = Math.ceil((z1 - z0) / cell);
    const H = new Float32Array((cx + 1) * (cz + 1));
    for (let b = 0; b <= cz; b++) for (let a = 0; a <= cx; a++) H[b * (cx + 1) + a] = terrainH(x0 + a * cell, z0 + b * cell);
    const tb = new GeoBuilder();
    const tcol = terrainColors(def.theme);
    for (let b = 0; b < cz; b++) for (let a = 0; a < cx; a++) {
      const k = b * (cx + 1) + a;
      const p00 = [x0 + a * cell, H[k], z0 + b * cell], p10 = [x0 + (a + 1) * cell, H[k + 1], z0 + b * cell];
      const p01 = [x0 + a * cell, H[k + cx + 1], z0 + (b + 1) * cell], p11 = [x0 + (a + 1) * cell, H[k + cx + 2], z0 + (b + 1) * cell];
      const slope = Math.max(Math.abs(H[k + 1] - H[k]), Math.abs(H[k + cx + 1] - H[k])) / cell;
      const hAvg = (H[k] + H[k + 1] + H[k + cx + 1] + H[k + cx + 2]) / 4;
      const c = tcol(hAvg, slope, N2(p00[0] / 23, p00[2] / 23));
      tb.tri(p00, p01, p11, c); tb.tri(p00, p11, p10, shade(c, 0.97));
    }
    tb.mesh(group, material(quality, { vertexColors: true, flat: true, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }), { receive: semi, name: 'terreno' });
    // plano lejano (valle o llanura) para que no se vea el borde
    let lo = Infinity; for (let i = 0; i < H.length; i++) lo = Math.min(lo, H[i]);
    const farCol = tcol(lo, 0, 0);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2), material(quality, { color: new THREE.Color().setRGB(farCol[0], farCol[1], farCol[2]), polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 }));
    far.position.set((minX + maxX) / 2, lo - 2, (minZ + maxZ) / 2); far.name = 'llanura';
    group.add(far);
  } else {
    const gm = material(quality, { color: new THREE.Color(TH.ground), polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), gm);
    g.position.set((minX + maxX) / 2, groundY, (minZ + maxZ) / 2); g.receiveShadow = semi; g.name = 'suelo';
    group.add(g);
  }

  // 10) Contexto para el escenario temático
  const ctx = {
    THREE, def, theme: def.theme, quality, semi, timeOfDay, weather, night, group,
    n, step, closed, length: L, startDistance: C.startDistance, finishDistance: C.finishDistance,
    X, Y: CY, Z, HW, LW, RW, KS, KL, RHX, RHZ, TX, TZ, PIT, pitHalf, pitSide, pitA, pitB, pitWide, WT, B,
    bounds: { minX, maxX, minZ, maxZ, minY, maxY }, groundY, lake,
    edgePoint, sampleAt, nearest, wrapI, nx,
    heightAt: (x, z) => terrainH(x, z),
    // distancia más allá de la barrera más cercana (negativa = dentro de la zona de pista)
    clearance(x, z, maxD = 200) {
      const i = nearest(x, z, maxD);
      if (i < 0) return maxD;
      const lat = (x - X[i]) * RHX[i] + (z - Z[i]) * RHZ[i];
      const W = lat < 0 ? LW[i] : RW[i];
      if (arena && lat < 0) return -1;
      const along = Math.abs((x - X[i]) * THX[i] + (z - Z[i]) * THZ[i]);
      return Math.max(Math.abs(lat) - Math.min(W, 250), along - step);
    },
    builders: { static: staticB, glow: glowB, paint: paintB, banner: bannerB },
    banner, bannerIndex: { META: 0, SALIDA: 1, LOGO: 2, PITS: 3, sponsors: [4, 5, 6, 7, 8, 10, 11] },
    mats: { static: matStatic, glow: matGlow },
    rand: rng(def.id + ':escenario'), noise: N2,
  };
  const scen = await buildScenery(ctx);

  staticB.mesh(group, matStatic, { cast: semi, receive: semi, name: 'estatico' });
  glowB.mesh(group, matGlow, { name: 'luces' });
  paintB.mesh(group, matPaint, { name: 'pintura' });
  bannerB.mesh(group, matBanner, { name: 'mantas' });

  // 11) Minimapa
  const minimap = [];
  const mm = 200, lastI = closed ? n : n - 1;
  for (let k = 0; k < mm; k++) { const i = Math.min(n - 1, Math.round(k * lastI / (closed ? mm : mm - 1))); minimap.push([Math.round(X[i] * 10) / 10, Math.round(Z[i] * 10) / 10]); }

  setStartLights(0, false);

  const _tmpM = new THREE.Matrix4();
  const track = {
    group, def, length: L, closed, query, sampleAt, gridSlots, minimap,
    finishDistance: C.finishDistance, startDistance: C.startDistance, pitZone, props,
    knockProp, resetProps, setStartLights, surfaces: SURFACES,
    bounds: { minX, maxX, minZ, maxZ, minY, maxY },
    update(dt, camera) {
      if (coneAnim.size && coneMesh) {
        for (const [id, a] of coneAnim) {
          const pr = props.find(p => p.id === id);
          a.t = Math.min(1, a.t + dt * 1.6);
          const e = 1 - (1 - a.t) ** 3;
          const x = pr.pos.x + Math.cos(a.dir) * a.dist * e, z = pr.pos.z + Math.sin(a.dir) * a.dist * e;
          _tmpM.copy(trs(x, pr.pos.y + 0.17 * e, z, a.dir + a.spin * e, 1, 1, 1, 0, -Math.PI / 2 * e));
          coneMesh.setMatrixAt(pr.ci, _tmpM);
          if (a.t >= 1) coneAnim.delete(id);
        }
        coneMesh.instanceMatrix.needsUpdate = true;
      }
      scen && scen.update && scen.update(dt, camera);
    },
    dispose() {
      scen && scen.dispose && scen.dispose();
      if (group.parent) group.parent.remove(group);
      disposeTree(group);
    },
  };
  return track;
}

// ------------------------------------------------------------------------------------------------
// Relieve natural por tema (lejos de la pista); cerca de la pista manda la altura del camino.
function naturalFn(theme, N, b) {
  const fbm = (x, z) => N(x, z) * 0.6 + N(x * 2.1 + 17, z * 2.1 - 9) * 0.28 + N(x * 4.3 - 5, z * 4.3 + 3) * 0.12;
  if (theme === 'montana') {
    return (x, z) => Math.max(-40, 300 - 0.38 * (z - b.minZ) + 30 * fbm(x / 260, z / 260) + 9 * N(x / 45, z / 45));
  }
  if (theme === 'desierto') {
    return (x, z) => {
      const ridge = 1 - Math.abs(N(x / 90 + 0.3 * N(z / 140, x / 140), z / 55));
      return 1 + 9 * ridge * ridge + 5 * fbm(x / 300, z / 300);
    };
  }
  if (theme === 'costa') {
    return (x, z) => {
      const shore = 262 + 22 * N(x / 260, 4.2);
      if (z > shore) return 1.5 - (z - shore) * 0.09;
      return 2 + Math.max(0, shore - 70 - z) * 0.11 + 18 * Math.max(0, fbm(x / 240, z / 240) + 0.3);
    };
  }
  if (theme === 'nieve') {
    return (x, z) => 18 + 16 * fbm(x / 220, z / 220) + 5 * N(x / 50, z / 50);
  }
  return () => 0;
}

function terrainColors(theme) {
  if (theme === 'montana') {
    const grass = col('#4f6b35'), dry = col('#7a7448'), rock = col('#6e6a64'), dark = col('#3d5a2c');
    return (h, slope, nz) => slope > 0.75 ? mixc(rock, dry, 0.3 + nz * 0.2) : mixc(nz > 0 ? grass : dark, dry, clamp(slope * 0.8, 0, 0.7));
  }
  if (theme === 'desierto') {
    const s1 = col('#d9b77f'), s2 = col('#c99a62'), s3 = col('#e3c690');
    return (h, slope, nz) => mixc(mixc(s1, s3, clamp(h / 12, 0, 1)), s2, clamp(slope * 1.2 + nz * 0.15, 0, 0.8));
  }
  if (theme === 'costa') {
    const sand = col('#e2cc98'), wetSand = col('#b9a272'), grass = col('#5f8a3a'), dark = col('#466e2c'), rock = col('#7d776c');
    return (h, slope, nz) => h < 0.6 ? wetSand : h < 3.2 ? sand : slope > 0.8 ? rock : mixc(nz > 0 ? grass : dark, sand, clamp((6 - h) / 8, 0, 0.5));
  }
  if (theme === 'nieve') {
    const snow = col('#eef3f8'), blue = col('#d5e0ec'), rock = col('#6f7378');
    return (h, slope, nz) => slope > 0.9 ? rock : mixc(snow, blue, clamp(0.3 + nz * 0.4, 0, 1));
  }
  const g = col('#5b7d3a');
  return () => g;
}
