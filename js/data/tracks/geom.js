// Geometría de pistas SIN Three.js: línea central a partir de la definición de la pista.
// La usan js/data/tracks.js (vista previa barata para la interfaz) y js/game/track.js (construcción 3D).
// Convención: x = este, z = sur, y = arriba. Las pistas se recorren en el orden de sus puntos.

export const STEP = 2; // metros entre muestras de la línea central

const cache = new Map();

const hyp = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Catmull-Rom centrípeta (alpha 0.5) que pasa por todos los puntos.
// Cada punto: [x, z, ...canales extra] (los canales se interpolan con los mismos pesos).
export function catmullRom(points, closed, alpha = 0.5, maxSeg = 1) {
  const n = points.length, dims = points[0].length, out = [];
  const P = i => {
    if (closed) return points[((i % n) + n) % n];
    if (i < 0) return points[0].map((v, d) => 2 * v - points[1][d]);
    if (i >= n) return points[n - 1].map((v, d) => 2 * v - points[n - 2][d]);
    return points[i];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const t0 = 0;
    const t1 = t0 + Math.max(1e-3, Math.pow(hyp(p0, p1), alpha));
    const t2 = t1 + Math.max(1e-3, Math.pow(hyp(p1, p2), alpha));
    const t3 = t2 + Math.max(1e-3, Math.pow(hyp(p2, p3), alpha));
    const steps = Math.max(1, Math.ceil(hyp(p1, p2) / maxSeg));
    for (let k = 0; k < steps; k++) {
      const t = t1 + (t2 - t1) * (k / steps);
      const pt = new Array(dims);
      for (let d = 0; d < dims; d++) {
        const a1 = ((t1 - t) * p0[d] + (t - t0) * p1[d]) / (t1 - t0);
        const a2 = ((t2 - t) * p1[d] + (t - t1) * p2[d]) / (t2 - t1);
        const a3 = ((t3 - t) * p2[d] + (t - t2) * p3[d]) / (t3 - t2);
        const b1 = ((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0);
        const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
        pt[d] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
      }
      out.push(pt);
    }
  }
  if (!closed) out.push(points[n - 1].slice());
  return out;
}

// Polilínea con esquinas redondeadas (filetes de radio r). path = [[x, z, r?, y?, ancho?], …]
// Devuelve puntos densos [x, z, y, w]; y y w se interpolan entre los vértices (anclados a la mitad de cada arco).
export function filletPath(path, closed, defY = 0, defW = 12, arcStep = 2) {
  const n = path.length;
  const V = path.map(p => ({ x: p[0], z: p[1], r: p[2] || 0, y: p[3] ?? defY, w: p[4] ?? defW }));
  const out = [], anchors = [];
  for (let i = 0; i < n; i++) {
    const v = V[i];
    const prev = closed ? V[(i - 1 + n) % n] : V[i - 1];
    const next = closed ? V[(i + 1) % n] : V[i + 1];
    if (!prev || !next || v.r <= 0) { anchors.push({ k: out.length, y: v.y, w: v.w }); out.push([v.x, v.z]); continue; }
    let d1x = v.x - prev.x, d1z = v.z - prev.z; const l1 = Math.hypot(d1x, d1z); d1x /= l1; d1z /= l1;
    let d2x = next.x - v.x, d2z = next.z - v.z; const l2 = Math.hypot(d2x, d2z); d2x /= l2; d2z /= l2;
    const th = Math.acos(Math.max(-1, Math.min(1, d1x * d2x + d1z * d2z)));
    if (th < 1e-3) { anchors.push({ k: out.length, y: v.y, w: v.w }); out.push([v.x, v.z]); continue; }
    let t = v.r * Math.tan(th / 2);
    t = Math.min(t, 0.49 * Math.min(l1, l2));
    const r = t / Math.tan(th / 2);
    const ax = v.x - d1x * t, az = v.z - d1z * t, bx = v.x + d2x * t, bz = v.z + d2z * t;
    let px = -d1z, pz = d1x;
    if (px * d2x + pz * d2z < 0) { px = -px; pz = -pz; }
    const cx = ax + px * r, cz = az + pz * r;
    const a0 = Math.atan2(az - cz, ax - cx);
    let da = Math.atan2(bz - cz, bx - cx) - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(da) * r / arcStep));
    anchors.push({ k: out.length + (steps >> 1), y: v.y, w: v.w });
    for (let k = 0; k <= steps; k++) { const a = a0 + da * k / steps; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  }
  // distancia acumulada para interpolar y, w entre anclas
  const m = out.length, cum = new Float64Array(m);
  for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + hyp(out[i - 1], out[i]);
  const total = closed ? cum[m - 1] + hyp(out[m - 1], out[0]) : cum[m - 1];
  const A = anchors.map(a => ({ s: cum[a.k], y: a.y, w: a.w })).sort((a, b) => a.s - b.s);
  for (let i = 0; i < m; i++) {
    const s = cum[i];
    let a = null, b = null;
    for (let j = 0; j < A.length; j++) if (A[j].s <= s) a = A[j]; else { b = A[j]; break; }
    let y, w;
    if (closed) {
      if (!a) a = { ...A[A.length - 1], s: A[A.length - 1].s - total };
      if (!b) b = { ...A[0], s: A[0].s + total };
    }
    if (!a) { y = b.y; w = b.w; } else if (!b) { y = a.y; w = a.w; } else {
      const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
      y = a.y + (b.y - a.y) * f; w = a.w + (b.w - a.w) * f;
    }
    out[i] = [out[i][0], out[i][1], y, w];
  }
  return out;
}

// Remuestreo uniforme por longitud de arco. pts: [[x, z, y, w], …]
export function resample(pts, step, closed) {
  const m = pts.length;
  const segs = closed ? m : m - 1;
  const cum = new Float64Array(segs + 1);
  for (let i = 0; i < segs; i++) cum[i + 1] = cum[i] + hyp(pts[i], pts[(i + 1) % m]);
  const L = cum[segs];
  const n = closed ? Math.max(8, Math.round(L / step)) : Math.max(2, Math.round(L / step) + 1);
  const st = closed ? L / n : L / (n - 1);
  const x = new Float64Array(n), z = new Float64Array(n), y = new Float64Array(n), w = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.min(i * st, L);
    while (j < segs - 1 && cum[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % m];
    const segL = cum[j + 1] - cum[j];
    const f = segL > 1e-9 ? (s - cum[j]) / segL : 0;
    x[i] = a[0] + (b[0] - a[0]) * f; z[i] = a[1] + (b[1] - a[1]) * f;
    y[i] = (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * f;
    w[i] = (a[3] ?? 12) + ((b[3] ?? 12) - (a[3] ?? 12)) * f;
  }
  return { n, step: st, length: L, closed, x, y, z, w };
}

// Promedio móvil (radio en muestras). Abierta: los extremos se conservan.
export function smoothArr(arr, rad, closed, passes = 1) {
  const n = arr.length;
  if (rad < 1 || n < 3) return arr;
  let a = arr;
  for (let p = 0; p < passes; p++) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let k = -rad; k <= rad; k++) {
        let j = i + k;
        if (closed) j = ((j % n) + n) % n;
        else if (j < 0 || j >= n) continue;
        sum += a[j]; cnt++;
      }
      out[i] = sum / cnt;
    }
    if (!closed) { out[0] = a[0]; out[n - 1] = a[n - 1]; }
    a = out;
  }
  return a;
}

// Suavizado local iterativo donde el radio de giro es menor que rMin. Devuelve true si cambió algo.
export function limitCurvature(c, rMin, maxIter = 80) {
  const { n, closed, x, z } = c;
  let changed = false;
  for (let it = 0; it < maxIter; it++) {
    const bad = [];
    for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      const ax = x[i] - x[a], az = z[i] - z[a], bx = x[b] - x[i], bz = z[b] - z[i];
      let da = Math.atan2(bz, bx) - Math.atan2(az, ax);
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const L = (Math.hypot(ax, az) + Math.hypot(bx, bz)) / 2;
      if (Math.abs(da) > 1e-6 && L / Math.abs(da) < rMin) bad.push(i);
    }
    if (!bad.length) break;
    changed = true;
    const mark = new Uint8Array(n);
    for (const i of bad) for (let k = -5; k <= 5; k++) {
      const j = i + k;
      if (closed) mark[((j % n) + n) % n] = 1; else if (j > 0 && j < n - 1) mark[j] = 1;
    }
    const nx = Float64Array.from(x), nz = Float64Array.from(z);
    for (let i = 0; i < n; i++) if (mark[i]) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      nx[i] = x[i] * 0.4 + (x[a] + x[b]) * 0.3;
      nz[i] = z[i] * 0.4 + (z[a] + z[b]) * 0.3;
    }
    x.set(nx); z.set(nz);
  }
  return changed;
}

export function isClosed(def) { return !(def.kind === 'sprint' || def.kind === 'drag' || def.closed === false); }

// Línea central lista: { n, step, length, closed, x, y, z, w, startDistance, finishDistance }.
// En pistas cerradas el índice 0 queda en la meta (def.finishAt).
export function trackCenterline(def) {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const closed = isClosed(def);
  const W = def.width || 12;
  let c;
  if (def.points) {
    const dense = catmullRom(def.points.map(p => [p[0], p[1], p[2] ?? 0, p[3] ?? W]), closed, 0.5, 1);
    c = resample(dense, STEP, closed);
    if (def.smooth) { c.x = smoothArr(c.x, def.smooth, closed); c.z = smoothArr(c.z, def.smooth, closed); }
  } else {
    const dense = filletPath(def.path, closed, 0, W, 1.5);
    c = resample(dense, STEP, closed);
    const sm = def.smooth ?? 2;
    c.x = smoothArr(c.x, sm, closed); c.z = smoothArr(c.z, sm, closed);
    const pts = []; for (let i = 0; i < c.n; i++) pts.push([c.x[i], c.z[i], c.y[i], c.w[i]]);
    c = resample(pts, STEP, closed);
  }
  // Radio mínimo: suaviza solo los quiebres demasiado cerrados (p. ej. nodos de OSM) para que la cinta no se doble.
  if (limitCurvature(c, def.minRadius ?? (W / 2 + 6))) {
    const pts = []; for (let i = 0; i < c.n; i++) pts.push([c.x[i], c.z[i], c.y[i], c.w[i]]);
    c = resample(pts, STEP, closed);
  }
  c.y = smoothArr(c.y, 10, closed, 2);
  c.w = smoothArr(c.w, 6, closed, 1);
  if (closed && def.finishAt) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < c.n; i++) {
      const d = (c.x[i] - def.finishAt[0]) ** 2 + (c.z[i] - def.finishAt[1]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best) for (const k of ['x', 'y', 'z', 'w']) {
      const a = c[k], r = new Float64Array(c.n);
      for (let i = 0; i < c.n; i++) r[i] = a[(i + best) % c.n];
      c[k] = r;
    }
  }
  if (closed) { c.startDistance = 0; c.finishDistance = c.length; }
  else if (def.kind === 'drag') {
    c.startDistance = def.startDistance ?? 45;
    c.finishDistance = c.startDistance + 402.34;
  } else {
    c.startDistance = def.startDistance ?? 80;
    c.finishDistance = def.finishDistance ?? c.length - 150;
  }
  cache.set(def.id, c);
  return c;
}

// Contorno barato [[x, z], …] con ~count puntos (vista previa de la interfaz).
export function outlineOf(def, count = 150) {
  const c = trackCenterline(def);
  const out = [];
  const last = c.closed ? c.n : c.n - 1;
  for (let k = 0; k < count; k++) {
    const i = Math.min(c.n - 1, Math.round(k * last / (c.closed ? count : count - 1)));
    out.push([Math.round(c.x[i] * 10) / 10, Math.round(c.z[i] * 10) / 10]);
  }
  return out;
}
