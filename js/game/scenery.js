// Escenario temático de cada pista (gradas, edificios, árboles, agua, montañas del horizonte…).
// Todo con semilla fija (ctx.rand) para que todos los jugadores vean lo mismo.
// Lo estático va a los acumuladores compartidos (ctx.builders.static / glow / banner) → pocas llamadas de dibujo.
import * as THREE from 'three';
import { MONTERREY_OSM } from '../data/tracks/monterrey-osm.js';
import { clamp } from '../core/util.js';
import {
  GeoBuilder, col, mixc, shade, material, basic, windowsTex, corrugatedTex, radialTex, textAtlas, instanced, trs, partsGeo,
} from './scenery/kit.js';

const TAU = Math.PI * 2;

export async function buildScenery(ctx) {
  const S = new Scene(ctx);
  const fn = THEMES[ctx.theme];
  if (fn) fn(S, ctx);
  S.finish();
  return { update: (dt, cam) => S.update(dt, cam), dispose: () => {} };
}

// ------------------------------------------------------------------------------------------------
class Scene {
  constructor(ctx) {
    this.ctx = ctx; this.r = ctx.rand; this.st = ctx.builders.static; this.glow = ctx.builders.glow;
    this.night = ctx.night; this.q = ctx.quality;
    this.inst = new Map();     // nombre → { geo, mat, mats:[], cols:[] }
    this.pools = [];           // charcos de luz (noche)
    this.updaters = [];
    this.bld = null;           // edificios con ventanas
    this.corr = null;          // lámina acanalada
    this.signs = null;         // letreros de neón
    this.horizonMesh = null;
  }
  rnd(a, b) { return a + (b - a) * this.r(); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length) % arr.length]; }
  // registra una instancia de un objeto repetido
  add(name, make, m, color = null) {
    let e = this.inst.get(name);
    if (!e) { e = { ...make(), mats: [], cols: [] }; this.inst.set(name, e); }
    e.mats.push(m); if (color) e.cols.push(color);
  }
  // posición más allá de la barrera de un lado (sg = −1 izq, +1 der), mirando hacia la pista
  beyond(i, sg, off) {
    const c = this.ctx, W = sg < 0 ? c.LW[i] : c.RW[i];
    const p = c.edgePoint(i, sg * (Math.min(W, 250) + off));
    return { x: p[0], y: p[1], z: p[2], yaw: Math.atan2(-sg * c.RHX[i], -sg * c.RHZ[i]) };
  }
  // ¿cabe un rectángulo (w × d, girado yaw) sin invadir la pista?
  fits(x, z, w, d, yaw, margin = 1.5) {
    const c = this.ctx, cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (const [lx, lz] of [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, -d / 2], [0, d / 2], [-w / 2, 0], [w / 2, 0]]) {
      if (c.clearance(x + lx * cs + lz * sn, z - lx * sn + lz * cs, 60) < margin) return false;
    }
    return true;
  }
  // lista de índices de un tramo [i0, i1] (con vuelta)
  range(i0, i1, every = 1) {
    const c = this.ctx, out = [];
    let len = i1 - i0; if (len < 0) len += c.n;
    for (let k = 0; k <= len; k += every) out.push(c.wrapI(i0 + k));
    return out;
  }
  // puntos al azar en la caja de la pista (con margen) con holgura mínima respecto a las barreras
  scatter(count, minClear, margin, fn, maxClear = Infinity, tries = 6) {
    const b = this.ctx.bounds;
    for (let k = 0; k < count * tries && count > 0; k++) {
      const x = this.rnd(b.minX - margin, b.maxX + margin), z = this.rnd(b.minZ - margin, b.maxZ + margin);
      const cl = this.ctx.clearance(x, z, Math.max(minClear, Math.min(maxClear, 400)) + 5);
      if (cl < minClear || cl > maxClear) continue;
      if (fn(x, z, cl) !== false) count--;
    }
  }

  // ---------- piezas
  building(x, y, z, w, d, h, yaw, tint) {
    if (!this.bld) this.bld = { b: new GeoBuilder(), t: windowsTex(this.r) };
    this.bld.b.box(x, y - 0.5, z, w, h + 0.5, d, tint, yaw, [1 / 4 / 8 * 1, 1 / 3.5 / 8], shade(tint, 0.75));
  }
  container(x, y, z, yaw, c, long = 12.2) {
    if (!this.corr) this.corr = { b: new GeoBuilder(), t: corrugatedTex() };
    this.corr.b.box(x, y, z, 2.44, 2.6, long, c, yaw, [1 / 2.6, 1 / 2.6], shade(c, 0.85));
  }
  shed(x, y, z, w, d, h, yaw, c) {
    if (!this.corr) this.corr = { b: new GeoBuilder(), t: corrugatedTex() };
    this.corr.b.box(x, y - 0.3, z, w, h + 0.3, d, c, yaw, [1 / 3, 1 / 3], shade(c, 0.8));
    // techo a dos aguas
    const cs = Math.cos(yaw), sn = Math.sin(yaw), P = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
    const rc = shade(c, 0.7), hw = w / 2, hd = d / 2, rh = h + Math.min(w, d) * 0.12;
    this.st.quad(P(-hw, h, hd), P(0, rh, hd), P(0, rh, -hd), P(-hw, h, -hd), rc);
    this.st.quad(P(0, rh, hd), P(hw, h, hd), P(hw, h, -hd), P(0, rh, -hd), rc);
    this.st.tri(P(-hw, h, hd), P(hw, h, hd), P(0, rh, hd), c);
    this.st.tri(P(hw, h, -hd), P(-hw, h, -hd), P(0, rh, -hd), c);
  }
  // poste de luz: poste, brazo y lámpara (encendida de noche) + charco de luz en el piso
  lamp(x, y, z, yaw, h = 9, arm = 2.2, pool = true) {
    this.add('poste', () => ({ geo: partsGeo(b => { b.box(0, 0, 0, 0.22, 1, 0.22, col('#5d6168')); }), mat: this.ctx.mats.static }), trs(x, y, z, yaw, 1, h, 1));
    // el «frente» de un objeto girado yaw es (sin yaw, cos yaw)
    const hx = x + Math.sin(yaw) * arm, hz = z + Math.cos(yaw) * arm;
    this.st.box((x + hx) / 2, y + h - 0.15, (z + hz) / 2, 0.14, 0.14, arm, col('#5d6168'), yaw);
    this.glow.box(hx, y + h - 0.35, hz, 0.5, 0.18, 0.9, this.night ? col('#ffe2a8', 1.6) : col('#9aa0a8'), yaw);
    if (pool && this.night) this.pools.push([hx, y, hz, 13]);
  }
  // torre de iluminación de estadio
  lightTower(x, y, z, yaw, h = 26) {
    this.add('torre', () => ({ geo: partsGeo(b => { b.box(0, 0, 0, 0.7, 1, 0.7, col('#7d8288')); }), mat: this.ctx.mats.static }), trs(x, y, z, yaw, 1, h, 1));
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    this.st.box(x, y + h, z, 5, 3, 0.5, col('#3a3d42'), yaw);
    this.glow.box(x + fx * 0.3, y + h + 0.3, z + fz * 0.3, 4.4, 2.4, 0.06, this.night ? col('#fff6dc', 2) : col('#c9ced6'), yaw);
    if (this.night) this.pools.push([x + fx * 30, y, z + fz * 30, 45]);
  }
  tree(kind, x, y, z, s = 1, yaw = 0) {
    const geos = TREE_GEO;
    this.add('arbol-' + kind, () => ({ geo: geos[kind](), mat: this.ctx.mats.static }), trs(x, y - 0.2, z, yaw, s, s * (0.85 + this.r() * 0.3), s));
  }
  rock(x, y, z, s, c) {
    this.add('roca', () => ({ geo: partsGeo(b => b.addGeometry(new THREE.DodecahedronGeometry(1, 0), new THREE.Matrix4(), [1, 1, 1])), mat: this.ctx.mats.static }),
      trs(x, y, z, this.r() * TAU, s, s * (0.5 + this.r() * 0.5), s * (0.8 + this.r() * 0.4), this.r(), this.r()), c);
  }
  grandstand(idx, sg, off, rows, rowH = 0.55, rowD = 0.9, roof = true) {
    const c = this.ctx, b = this.st;
    const crowd = ['#d23a2a', '#2a5bd2', '#f0c020', '#f4f4f4', '#2b2b2b', '#2ea04a', '#e07020', '#8a2ab0', '#20a0c0', '#c8c8c8'].map(h => col(h));
    const conc = col('#a8a6a0'), seat = col('#6d7380'), dark = col('#4a4d55');
    for (let k = 0; k < idx.length - 1; k++) {
      const i = idx[k], j = idx[k + 1];
      const yi = c.edgePoint(i, sg * (Math.min(sg < 0 ? c.LW[i] : c.RW[i], 250) + off))[1];
      const P = (ii, d, hgt) => { const W = Math.min(sg < 0 ? c.LW[ii] : c.RW[ii], 250); const p = c.edgePoint(ii, sg * (W + off + d)); return [p[0], yi + hgt, p[2]]; };
      const flip = sg > 0;
      const q = (a, bb, cc, dd, colr) => flip ? b.quad(bb, a, dd, cc, colr) : b.quad(a, bb, cc, dd, colr);
      for (let r = 0; r < rows; r++) {
        const h0 = 1 + r * rowH, d0 = r * rowD, d1 = (r + 1) * rowD;
        q(P(i, d0, h0 - rowH), P(j, d0, h0 - rowH), P(j, d0, h0), P(i, d0, h0), conc);         // contrahuella
        const full = this.r() < 0.88;
        q(P(i, d0, h0), P(j, d0, h0), P(j, d1, h0), P(i, d1, h0), full ? this.pick(crowd) : seat); // asiento con público
      }
      const top = 1 + rows * rowH, back = rows * rowD;
      q(P(j, back, 0), P(i, back, 0), P(i, back, top + 1), P(j, back, top + 1), dark);         // muro trasero
      q(P(i, 0, -0.5), P(j, 0, -0.5), P(j, 0, 1 - rowH), P(i, 0, 1 - rowH), conc);
      if (roof) {
        const rh = top + 4;
        q(P(i, -1, rh), P(j, -1, rh), P(j, back + 0.5, rh + 1), P(i, back + 0.5, rh + 1), col('#d8d8d8'));
        q(P(j, -1, rh - 0.05), P(i, -1, rh - 0.05), P(i, back + 0.5, rh + 0.95), P(j, back + 0.5, rh + 0.95), col('#8a8a8a'));
        if (k % 6 === 0) { const p = P(i, back, 0); b.box(p[0], p[1], p[2], 0.4, rh + 1, 0.4, dark); }
      }
    }
  }
  water(x0, z0, x1, z1, y, color) {
    const r = this.r;
    const tex = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
      g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
      for (let k = 0; k < 500; k++) { const v = 110 + r() * 60; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 128, r() * 128, 8 + r() * 20, 1 + r() * 2); }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set((x1 - x0) / 40, (z1 - z0) / 40); return t;
    })();
    const m = material(this.q, { color: new THREE.Color(color).multiplyScalar(1.6), map: tex, roughness: 0.18, metalness: 0.15 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), m);
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); mesh.name = 'agua'; mesh.receiveShadow = this.ctx.semi;
    this.ctx.group.add(mesh);
    this.updaters.push(dt => { tex.offset.x += dt * 0.01; tex.offset.y += dt * 0.004; });
  }
  // letreros de neón (atlas) en fachadas: texto, centro, ancho, alto, yaw del frente
  sign(i, x, y, z, w, h, yaw) {
    const { rect } = this.signs;
    const [u0, v0, u1, v1] = rect(i);
    const cs = Math.cos(yaw), sn = Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
    const P = (lx, ly) => [x + lx * cs + fx * 0.15, y + ly, z - lx * sn + fz * 0.15];
    this.signs.b.quad(P(-w / 2, 0), P(w / 2, 0), P(w / 2, h), P(-w / 2, h), [1, 1, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }

  // ---------- horizonte: siluetas lejanas que siguen a la cámara (baratas, sin niebla)
  horizon(features, { base = '#6f7f95', haze = '#b8c8da', far = null, seed = 3 } = {}) {
    const c = this.ctx;
    if (c.weather === 'fog') return;
    const tod = c.timeOfDay;
    let cTop = col(base), cHaze = col(haze);
    if (tod === 'sunset') { cTop = mixc(cTop, col('#4a3a52'), 0.6); cHaze = col('#e3a27e'); }
    if (tod === 'night') { cTop = col('#141a26'); cHaze = col('#1c2333'); }
    if (c.weather === 'rain' || c.weather === 'snow') { cTop = mixc(cTop, col('#8a9098'), 0.55); cHaze = mixc(cHaze, col('#9aa0a8'), 0.6); }
    const R0 = 1000, b = new GeoBuilder();
    const layer = (feats, rad, topC, hazeC) => {
      const seg = 720;
      const H = new Float32Array(seg + 1);
      for (let k = 0; k <= seg; k++) {
        const brg = k / seg * 360;
        let h = 0;
        for (const f of feats) {
          let d = brg - f.b; while (d > 180) d -= 360; while (d < -180) d += 360;
          const x = d / (f.w / 2);
          if (Math.abs(x) >= 1) continue;
          h = Math.max(h, f.shape(x) * f.h + (f.rough || 0) * f.h * jag(k * 0.37 + f.b));
        }
        H[k] = h;
      }
      for (let k = 0; k < seg; k++) {
        if (H[k] <= 0.01 && H[k + 1] <= 0.01) continue;
        const a0 = k / seg * TAU, a1 = (k + 1) / seg * TAU;
        // rumbo: 0° = norte (−z), 90° = este (+x)
        const p = (a, hh) => [Math.sin(a) * rad, rad * Math.tan(hh * Math.PI / 180) - rad * 0.012, -Math.cos(a) * rad];
        const t0 = p(a0, H[k]), t1 = p(a1, H[k + 1]), b0 = p(a0, -0.6), b1 = p(a1, -0.6);
        b.quad(b1, b0, t0, t1, hazeC); // vértices: b1 b0 t0 | b1 t0 t1 → la cima con su propio color
        const cc = b.c; const L = cc.length;
        const setC = (vi, c3) => { cc[L - 18 + vi * 3] = c3[0]; cc[L - 18 + vi * 3 + 1] = c3[1]; cc[L - 18 + vi * 3 + 2] = c3[2]; };
        setC(0, hazeC); setC(1, hazeC); setC(2, topC); setC(3, hazeC); setC(4, topC); setC(5, topC);
      }
    };
    const jagN = (s => { const r = []; for (let i = 0; i < 512; i++) r.push(((Math.imul(i + seed * 97, 2654435761) >>> 0) % 1000) / 1000); return r; })();
    function jag(x) { const i = Math.floor(x) & 511, f = x - Math.floor(x); return (jagN[i] * (1 - f) + jagN[(i + 1) & 511] * f) - 0.5; }
    if (far) layer(far, R0, mixc(cTop, cHaze, 0.55), cHaze);
    layer(features, R0 * 0.96, cTop, mixc(cTop, cHaze, 0.55));
    const g = b.build();
    if (!g) return;
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 1001; m.frustumCulled = false; m.name = 'horizonte'; // después del cielo
    c.group.add(m);
    this.horizonMesh = m;
  }

  finish() {
    const c = this.ctx, g = c.group;
    for (const [name, e] of this.inst) {
      const im = instanced(e.geo, e.mat, e.mats, e.cols.length === e.mats.length ? e.cols : null, { cast: c.semi && name.startsWith('arbol') });
      if (im) { im.name = name; g.add(im); }
    }
    if (this.bld) {
      const m = material(this.q, { map: this.bld.t.map, vertexColors: true, emissive: this.night ? 0xffffff : 0x000000, emissiveMap: this.bld.t.emissiveMap, emissiveIntensity: this.night ? 1 : 0 });
      this.bld.b.mesh(g, m, { cast: c.semi, receive: c.semi, name: 'edificios' });
    }
    if (this.corr) this.corr.b.mesh(g, material(this.q, { map: this.corr.t, vertexColors: true, metalness: 0.3, roughness: 0.6 }), { cast: c.semi, receive: c.semi, name: 'lamina' });
    if (this.signs) this.signs.b.mesh(g, basic({ map: this.signs.tex, vertexColors: true, toneMapped: false, transparent: false, side: THREE.DoubleSide }), { name: 'letreros' });
    if (this.pools.length) {
      const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,214,150,0.55)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const mats = this.pools.map(([x, y, z, s]) => { const i = c.nearest(x, z, 60); const yy = i >= 0 && c.clearance(x, z, 60) < 0 ? c.Y[i] : c.heightAt(x, z); return trs(x, yy + 0.05, z, 0, s, 1, s); });
      const im = instanced(geo, m, mats); im.name = 'charcos-luz'; im.renderOrder = 2; g.add(im);
    }
  }
  update(dt, cam) {
    for (const u of this.updaters) u(dt, cam);
    if (this.horizonMesh && cam) {
      const far = cam.far || 1000;
      const s = (far * 0.86) / 1000;
      this.horizonMesh.position.set(cam.position.x, this.ctx.bounds.minY - 2, cam.position.z);
      this.horizonMesh.scale.setScalar(s);
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Geometrías de árboles y plantas (coloreadas por vértice, para InstancedMesh)
const TREE_GEO = {
  pino: () => partsGeo(b => {
    const m = new THREE.Matrix4();
    b.addGeometry(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 5).translate(0, 1.1, 0), m, col('#5a3d26'));
    b.addGeometry(new THREE.ConeGeometry(2.4, 4.2, 7).translate(0, 3.6, 0), m, col('#2f5a2c'));
    b.addGeometry(new THREE.ConeGeometry(1.8, 3.6, 7).translate(0, 5.6, 0), m, col('#356632'));
    b.addGeometry(new THREE.ConeGeometry(1.1, 2.8, 7).translate(0, 7.4, 0), m, col('#3c7036'));
  }),
  pinoNieve: () => partsGeo(b => {
    const m = new THREE.Matrix4();
    b.addGeometry(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 5).translate(0, 1.1, 0), m, col('#4e3522'));
    b.addGeometry(new THREE.ConeGeometry(2.4, 4.2, 7).translate(0, 3.6, 0), m, col('#2c4a32'));
    b.addGeometry(new THREE.ConeGeometry(2.0, 1.2, 7).translate(0, 4.4, 0), m, col('#eef3f8'));
    b.addGeometry(new THREE.ConeGeometry(1.7, 3.4, 7).translate(0, 5.6, 0), m, col('#30523a'));
    b.addGeometry(new THREE.ConeGeometry(1.2, 1.6, 7).translate(0, 7.3, 0), m, col('#f2f6fa'));
  }),
  bajo: () => partsGeo(b => {
    const m = new THREE.Matrix4();
    b.addGeometry(new THREE.CylinderGeometry(0.15, 0.22, 1.6, 5).translate(0, 0.8, 0), m, col('#5b4330'));
    b.addGeometry(new THREE.IcosahedronGeometry(1.8, 0).scale(1, 0.75, 1).translate(0, 2.6, 0), m, col('#4f7a33'));
    b.addGeometry(new THREE.IcosahedronGeometry(1.1, 0).translate(0.9, 3.1, 0.4), m, col('#5b8a3a'));
  }),
  palma: () => partsGeo(b => {
    const m = new THREE.Matrix4();
    for (let k = 0; k < 5; k++) b.addGeometry(new THREE.CylinderGeometry(0.2 - k * 0.015, 0.24 - k * 0.015, 1.9, 6).translate(k * 0.18, 0.95 + k * 1.85, 0), m, col(k % 2 ? '#8a6b48' : '#7a5d3d'));
    const top = [0.9, 9.4, 0];
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU;
      const fx = Math.cos(a), fz = Math.sin(a);
      const tip = [top[0] + fx * 3.6, top[1] - 1.6, top[2] + fz * 3.6];
      const mid = [top[0] + fx * 1.8, top[1] + 0.35, top[2] + fz * 1.8];
      const sx = -fz * 0.7, sz = fx * 0.7;
      const c = col(k % 2 ? '#3f8a3a' : '#4a9a40');
      b.tri(top, [mid[0] + sx, mid[1], mid[2] + sz], mid, c); b.tri(top, mid, [mid[0] + sx, mid[1], mid[2] + sz], c);
      b.tri(top, mid, [mid[0] - sx, mid[1], mid[2] - sz], c); b.tri(top, [mid[0] - sx, mid[1], mid[2] - sz], mid, c);
      b.tri(mid, [mid[0] + sx, mid[1], mid[2] + sz], tip, c); b.tri(mid, tip, [mid[0] + sx, mid[1], mid[2] + sz], c);
      b.tri(mid, tip, [mid[0] - sx, mid[1], mid[2] - sz], c); b.tri(mid, [mid[0] - sx, mid[1], mid[2] - sz], tip, c);
    }
  }),
  saguaro: () => partsGeo(b => {
    const m = new THREE.Matrix4(), c = col('#4f7a3a');
    b.addGeometry(new THREE.CylinderGeometry(0.42, 0.48, 6, 7).translate(0, 3, 0), m, c);
    b.addGeometry(new THREE.SphereGeometry(0.42, 7, 4, 0, TAU, 0, Math.PI / 2).translate(0, 6, 0), m, c);
    b.addGeometry(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 6).rotateZ(Math.PI / 2).translate(0.9, 2.6, 0), m, c);
    b.addGeometry(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 6).translate(1.55, 3.6, 0), m, c);
    b.addGeometry(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 6).rotateZ(Math.PI / 2).translate(-0.75, 3.4, 0), m, c);
    b.addGeometry(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 6).translate(-1.25, 4.1, 0), m, c);
  }),
  nopal: () => partsGeo(b => {
    const c = col('#5c8a3c'), c2 = col('#6f9c46');
    const pad = (x, y, z, ry, rz, s, cc) => b.addGeometry(new THREE.SphereGeometry(0.55, 6, 4).scale(1, 1.35, 0.22), trs(x, y, z, ry, s, s, s, 0, rz), cc);
    pad(0, 0.7, 0, 0, 0, 1, c); pad(0.45, 1.6, 0.05, 0.4, -0.5, 0.8, c2); pad(-0.5, 1.5, 0, -0.3, 0.5, 0.75, c2); pad(0.05, 2.2, 0.1, 1.2, 0.1, 0.65, c);
    b.addGeometry(new THREE.SphereGeometry(0.09, 4, 3).translate(0.1, 2.85, 0.1), new THREE.Matrix4(), col('#d8344a'));
  }),
  arbusto: () => partsGeo(b => {
    b.addGeometry(new THREE.IcosahedronGeometry(0.9, 0).scale(1.2, 0.6, 1).translate(0, 0.35, 0), new THREE.Matrix4(), col('#8a8a4a'));
  }),
  lechuguilla: () => partsGeo(b => {
    const c = col('#7f9a52');
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; b.addGeometry(new THREE.ConeGeometry(0.09, 1.1, 3).translate(0, 0.55, 0), trs(0, 0, 0, a, 1, 1, 1, 0.5, 0), c); }
  }),
};

// ------------------------------------------------------------------------------------------------
// Temas
const THEMES = {
  // ============================================================== Autódromo (Monterrey)
  autodromo(S, c) {
    const st = S.st, r = S.r;
    const pitS = c.pitSide, gsS = -pitS;
    // tramo de la recta principal (alrededor de la meta)
    const nearFinish = [];
    for (let k = -Math.round(130 / c.step); k <= Math.round(150 / c.step); k++) nearFinish.push(c.wrapI(k));
    const straight = nearFinish.filter(i => Math.abs(c.KL[i]) < 1 / 250);
    // gradas principales del lado contrario a pits
    S.grandstand(straight.filter((_, k) => k % 2 === 0), gsS, 3, 16);
    // gradas secundarias en curvas lentas (por fuera)
    let placed = 0;
    for (let i = 0; i < c.n && placed < 4; i += 7) {
      if (Math.abs(c.KS[i]) > 1 / 45 && !c.pitWide(i)) {
        const sg = c.KS[i] > 0 ? -1 : 1;
        const idx = S.range(c.wrapI(i - 20), c.wrapI(i + 20), 2);
        const ok = idx.every(j => { const p = S.beyond(j, sg, 12); return c.clearance(p.x, p.z, 40) > 8; });
        if (ok) { S.grandstand(idx, sg, 4, 8, 0.55, 0.9, false); placed++; i += 120; }
      }
    }
    // edificio de pits con garajes + torre de control
    if (c.pitA >= 0) {
      const idx = S.range(c.pitA, c.pitB, 4).filter(i => c.pitWide(i) && Math.abs(c.KL[i]) < 1 / 300);
      const wall = col('#e8e6e0'), door = col('#2a2d33'), glass = col('#7fb3d8');
      idx.forEach((i, k) => {
        const p = S.beyond(i, pitS, 0.6);
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
        const cx = p.x - fx * 6, cz = p.z - fz * 6;
        st.box(cx, p.y, cz, 8.4, 7, 12, wall, p.yaw);
        st.box(p.x - fx * 0.05, p.y, p.z - fz * 0.05, 6.4, 4.2, 0.2, door, p.yaw);
        if (k % 3 === 0) S.glow.box(p.x + fx * 0.06, p.y + 5.2, p.z + fz * 0.06, 7.8, 1.2, 0.08, S.night ? col('#ffe9c0', 1.3) : glass, p.yaw);
      });
      // torre de control junto a la meta
      const i0 = c.wrapI(Math.round(8 / c.step));
      const p = S.beyond(i0, pitS, 16);
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      if (S.fits(p.x - fx * 4, p.z - fz * 4, 10, 10, p.yaw, 0)) {
        st.box(p.x - fx * 4, p.y, p.z - fz * 4, 8, 22, 8, col('#d9d6cf'), p.yaw);
        S.glow.box(p.x - fx * 4, p.y + 22, p.z - fz * 4, 10, 4, 10, S.night ? col('#ffe7b8', 1.2) : col('#6f9ec4'), p.yaw);
        st.box(p.x - fx * 4, p.y + 26, p.z - fz * 4, 11, 0.6, 11, col('#3a3d44'), p.yaw);
        c.banner(c.bannerIndex.LOGO, p.x + fx * 1.2, p.y + 18, p.z + fz * 1.2, 9, 2.2, Math.cos(p.yaw), -Math.sin(p.yaw));
      }
    }
    // mantas de patrocinadores en las rectas (sobre la barrera)
    let sp = 0;
    for (let i = 0; i < c.n; i += 30) {
      if (Math.abs(c.KL[i]) > 1 / 400) continue;
      const sg = (sp % 2) ? 1 : -1;
      if (sg === pitS && c.pitWide(i)) continue;
      const p = S.beyond(i, sg, 0.2);
      c.banner(c.bannerIndex.sponsors[sp % c.bannerIndex.sponsors.length], p.x, p.y + 0.05, p.z, 8, 1.4, Math.cos(p.yaw), -Math.sin(p.yaw));
      sp++;
    }
    // torres de iluminación
    for (let i = 0, k = 0; i < c.n; i += Math.round(140 / c.step), k++) {
      const sg = k % 2 ? 1 : -1;
      const p = S.beyond(i, sg, 9);
      if (c.clearance(p.x, p.z, 30) > 4) S.lightTower(p.x, p.y, p.z, p.yaw);
    }
    // estacionamientos con autos
    const carCols = ['#c9c9c9', '#2b2b2b', '#8a1c1c', '#1c3f8a', '#e6e2d3', '#4c5a3a', '#d8d8d8', '#6b6f78'].map(h => col(h));
    let lots = 0;
    const tryLot = (x, z, yaw) => {
      if (lots >= 4 || !S.fits(x, z, 70, 40, yaw, 6)) return;
      lots++;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      S.st.box(x, -0.03, z, 70, 0.06, 40, col('#5e5f62'), yaw);
      for (let row = 0; row < 4; row++) for (let k = 0; k < 13; k++) {
        if (r() < 0.3) continue;
        const lx = -30 + k * 5, lz = -15 + row * 10;
        const px = x + lx * cs + lz * sn, pz = z - lx * sn + lz * cs;
        S.add('auto', () => ({ geo: partsGeo(b => { b.box(0, 0.25, 0, 1.8, 0.75, 4.4, [1, 1, 1]); b.box(0, 1.0, 0.2, 1.6, 0.55, 2.3, [0.75, 0.8, 0.9]); }), mat: c.mats.static }), trs(px, 0, pz, yaw + (r() - 0.5) * 0.1), S.pick(carCols));
      }
    };
    for (const d of [60, 260, 520, c.length - 250]) {
      const s = c.sampleAt(d), i = s.index;
      for (const sg of [gsS, -gsS]) { const p = S.beyond(i, sg, 45); tryLot(p.x, p.z, p.yaw); }
    }
    // árboles bajos
    S.scatter(c.semi ? 650 : 420, 7, 220, (x, z) => { S.tree('bajo', x, c.groundY, z, 0.8 + r() * 0.7, r() * TAU); });
    // barda perimetral del complejo (contorno real de OSM)
    if (c.def.id.startsWith('monterrey')) {
      const P = MONTERREY_OSM.complexOutline, cw = col('#bdbab2');
      for (let k = 0; k < P.length - 1; k++) {
        const [x0, z0] = P[k], [x1, z1] = P[k + 1];
        const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
        st.box((x0 + x1) / 2, 0, (z0 + z1) / 2, 0.4, 2.6, len, cw, yaw);
      }
    }
    // horizonte real desde Apodaca: Cerro de la Silla (S), Topo Chico (SO), Mitras (OSO), Sierra Madre (S/SO)
    const X = 1.4; // exageración de altura para que se lean
    S.horizon([
      { b: 184, w: 13, h: 3.1 * X, shape: silla, rough: 0.05 },
      { b: 226, w: 16, h: 2.2 * X, shape: x => Math.pow(Math.cos(x * Math.PI / 2), 1.5) * (0.85 + 0.15 * Math.cos(x * 7)), rough: 0.08 },
      { b: 238, w: 18, h: 3.6 * X, shape: x => Math.pow(Math.cos(x * Math.PI / 2), 0.8), rough: 0.35 },
      { b: 276, w: 14, h: 2.6 * X, shape: x => Math.pow(Math.cos(x * Math.PI / 2), 1.2), rough: 0.3 },
      { b: 340, w: 60, h: 0.7, shape: x => Math.cos(x * Math.PI / 2), rough: 0.4 },
    ], {
      far: [{ b: 212, w: 60, h: 3.5 * X, shape: x => Math.pow(Math.cos(x * Math.PI / 2), 0.5), rough: 0.45 },
        { b: 160, w: 30, h: 1.6, shape: x => Math.cos(x * Math.PI / 2), rough: 0.4 }],
    });
  },

  // ============================================================== Distrito Neón
  neon(S, c) {
    const r = S.r;
    const names = ['TACOS EL GÜERO', 'FARMACIA LA LUZ', 'CANTINA EL TECOLOTE', 'TALLER HNOS. GARZA', 'HOTEL PARAÍSO', 'BILLAR LA BOLA 8',
      'LAVANDERÍA BURBUJAS', 'CARNITAS DON CHUY', 'DISCO GALAXIA', 'FERRETERÍA EL TORNILLO', 'ABARROTES LA GÜERA', 'MARISCOS EL PULPO',
      'BAR NEÓN 81', 'GIMNASIO FIERRO', 'CINE ESTRELLA', 'POLLOS REGIOS', 'KARAOKE LA ROLA', 'ELOTES DOÑA LUPE', 'CAFÉ DESVELO', 'MOTEL LUNA AZUL'];
    const neonCols = ['#ff2bd6', '#2bf0ff', '#ffd23f', '#5cff7a', '#ff5a1f', '#b06bff', '#ff4060', '#40a0ff'];
    S.signs = { b: new GeoBuilder(), ...textAtlas(names.map((t, k) => ({ text: t, color: neonCols[k % neonCols.length], bg: '#07070c' })), { cellW: 256, cellH: 64, cols: 4 }) };
    const tints = ['#b9b2a8', '#9fa6b0', '#c4a98a', '#8f8a85', '#a89aa8', '#7f8c8f', '#c9c1b0'].map(h => col(h));
    // banquetas (más allá de los muros)
    const walk = col('#8d8b86');
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1;
      for (let i = 0; i < c.n; i++) {
        const j = c.nx(i);
        const W0 = (sg < 0 ? c.LW : c.RW)[i], W1 = (sg < 0 ? c.LW : c.RW)[j];
        const a0 = c.edgePoint(i, sg * (W0 + 0.5)), a1 = c.edgePoint(j, sg * (W1 + 0.5)), b0 = c.edgePoint(i, sg * (W0 + 4.5)), b1 = c.edgePoint(j, sg * (W1 + 4.5));
        for (const p of [a0, a1, b0, b1]) p[1] += 0.15;
        if (c.clearance((b0[0] + b1[0]) / 2, (b0[2] + b1[2]) / 2, 20) < 3) continue;
        if (sg > 0) S.st.quad(a0, b0, b1, a1, walk); else S.st.quad(b0, a0, a1, b1, walk);
      }
    }
    // edificios a lo largo de las calles (dos filas)
    let signK = 0;
    for (const sg of [-1, 1]) {
      let i = 0;
      while (i < c.n) {
        const w = S.rnd(14, 30), d = S.rnd(14, 24), h = S.rnd(9, 46) * (r() < 0.15 ? 1.6 : 1);
        const p = S.beyond(i, sg, 5 + d / 2);
        if (S.fits(p.x, p.z, w, d, p.yaw, 4.5)) {
          S.building(p.x, c.groundY, p.z, w, d, h, p.yaw, S.pick(tints));
          // letrero de neón en la fachada
          if (r() < 0.75) {
            const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
            const sx = p.x + fx * (d / 2 + 0.05), sz = p.z + fz * (d / 2 + 0.05);
            S.sign((signK++) % names.length, sx, 4 + r() * 3, sz, Math.min(w - 2, 9), Math.min(w - 2, 9) / 4, p.yaw);
          }
          // fila de atrás, más alta
          const q = S.beyond(i, sg, 5 + d + 6 + 12);
          const h2 = S.rnd(20, 70);
          if (S.fits(q.x, q.z, w, 22, q.yaw, 4)) S.building(q.x, c.groundY, q.z, w * 0.9, 20, h2, q.yaw, S.pick(tints));
          i += Math.max(4, Math.round((w + 2) / c.step));
        } else i += 3;
      }
    }
    // relleno de manzanas interiores
    S.scatter(70, 14, 260, (x, z) => { const w = S.rnd(16, 30); if (!S.fits(x, z, w, w, 0, 6)) return false; S.building(x, c.groundY, z, w, w, S.rnd(12, 60), Math.round(r() * 4) * Math.PI / 2, S.pick(tints)); });
    // postes de luz
    for (let i = 0, k = 0; i < c.n; i += Math.round(26 / c.step), k++) {
      const sg = k % 2 ? 1 : -1;
      const p = S.beyond(i, sg, 1.2);
      S.lamp(p.x, c.groundY + 0.15, p.z, p.yaw, 8.5, 2.6 + Math.min(sg < 0 ? c.LW[i] : c.RW[i], 8) - c.HW[i] - 1.5);
    }
    // anuncios grandes sobre azoteas (cartel brillante)
    // skyline lejano
    S.horizon(Array.from({ length: 70 }, (_, k) => ({ b: k * 360 / 70 + r() * 3, w: 3 + r() * 4, h: 0.8 + r() * 3.2, shape: x => (Math.abs(x) < 0.8 ? 1 : 0) }))
      , { base: c.night ? '#141826' : '#5e6878', haze: c.night ? '#1d2236' : '#a8b4c4' });
  },

  // ============================================================== Puerto Óxido
  puerto(S, c) {
    const r = S.r, b = c.bounds;
    const quayZ = b.maxZ + 24;
    S.water(b.minX - 3000, quayZ, b.maxX + 3000, quayZ + 3000, -2.2, '#1d4a5a');
    // muelle: borde de concreto y bitas
    S.st.box((b.minX + b.maxX) / 2, -2.4, quayZ - 1, b.maxX - b.minX + 900, 2.4, 2, col('#8a877f'));
    for (let x = b.minX - 400; x < b.maxX + 400; x += 18) S.st.box(x, 0, quayZ - 2.2, 0.6, 0.7, 0.6, col('#2d2f33'));
    // grúas de muelle (pórticos que cruzan la recta)
    const cr = col('#c4531d'), crD = col('#8e3a16');
    for (const d of [c.length - 150, 30, 110, 190]) {
      const s = c.sampleAt(d), i = s.index;
      if (Math.abs(c.KL[i]) > 1 / 300 || Math.abs(s.tangent.x) < 0.95) continue;
      const pL = c.edgePoint(i, -(c.LW[i] + 3)), pR = c.edgePoint(i, c.RW[i] + 3);
      const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
      const tx = s.tangent.x, tz = s.tangent.z;
      for (const p of [pL, pR]) for (const o of [-7, 7]) S.st.box(p[0] + tx * o, 0, p[2] + tz * o, 1.2, 34, 1.2, cr, yaw);
      const mx = (pL[0] + pR[0]) / 2, mz = (pL[2] + pR[2]) / 2, span = Math.hypot(pR[0] - pL[0], pR[2] - pL[2]);
      const rl = Math.hypot(s.right.x, s.right.z), rx = s.right.x / rl, rz = s.right.z / rl;
      // pluma que sale sobre el agua
      for (const o of [-7, 7]) S.st.box(mx + tx * o + rx * 18, 34, mz + tz * o + rz * 18, 1.4, 2.2, span + 70, crD, Math.atan2(rx, rz));
      S.st.box(mx, 36, mz, span + 4, 6, 16, cr, yaw);
      S.glow.box(mx, 33.6, mz, 3, 0.3, 3, S.night ? col('#ffd890', 2) : col('#888'), 0);
      if (S.night) S.pools.push([mx, 0, mz, 30]);
    }
    // contenedores apilados donde quepan
    const ccols = ['#a33a22', '#1f5c8a', '#2f7a4a', '#d4791c', '#1d8a8a', '#7a7d82', '#8a2a2a', '#c9a227', '#3b3f99'].map(h => col(h));
    S.scatter(c.semi ? 75 : 55, 6, 160, (x, z) => {
      const yaw = Math.round(r() * 2) * Math.PI / 2 + (c.def.id === 'puerto-oxido' ? 0 : 0);
      const rows = 2 + Math.floor(r() * 4), cols = 1 + Math.floor(r() * 3);
      const W = rows * 2.6, D = cols * 12.6;
      if (!S.fits(x, z, W, D, yaw, 3)) return false;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      for (let a = 0; a < rows; a++) for (let k = 0; k < cols; k++) {
        const hgt = 1 + Math.floor(r() * 4);
        for (let lv = 0; lv < hgt; lv++) {
          const lx = -W / 2 + 1.3 + a * 2.6, lz = -D / 2 + 6.3 + k * 12.6;
          S.container(x + lx * cs + lz * sn, lv * 2.62, z - lx * sn + lz * cs, yaw, S.pick(ccols));
        }
      }
    }, 140);
    // bodegas
    S.scatter(12, 10, 260, (x, z) => {
      const w = S.rnd(30, 60), d = S.rnd(50, 90), yaw = Math.round(r() * 2) * Math.PI / 2;
      if (!S.fits(x, z, w, d, yaw, 6)) return false;
      S.shed(x, 0, z, w, d, S.rnd(10, 16), yaw, S.pick([col('#9aa3a8'), col('#b07a52'), col('#7b8c7a'), col('#a8a39a')]));
    });
    // postes altos
    for (let i = 0, k = 0; i < c.n; i += Math.round(70 / c.step), k++) {
      const sg = k % 2 ? 1 : -1, p = S.beyond(i, sg, 2.5);
      if (c.clearance(p.x, p.z, 20) > 1.5) S.lamp(p.x, 0, p.z, p.yaw, 14, 3 + Math.min(sg < 0 ? c.LW[i] : c.RW[i], 8) - c.HW[i]);
    }
    S.horizon([
      { b: 330, w: 80, h: 2.2, shape: x => Math.cos(x * Math.PI / 2), rough: 0.3 },
      ...Array.from({ length: 30 }, (_, k) => ({ b: 270 + k * 3 + r() * 2, w: 2 + r() * 2, h: 0.6 + r() * 1.4, shape: x => (Math.abs(x) < 0.85 ? 1 : 0) })),
    ], { base: '#55606e', haze: '#a9b5c2' });
  },

  // ============================================================== Montaña
  montana(S, c) {
    const r = S.r;
    S.scatter(c.semi ? 1700 : 1100, 3.5, 330, (x, z) => {
      const y = c.heightAt(x, z);
      S.tree('pino', x, y, z, 0.8 + r() * 0.9, r() * TAU);
    });
    S.scatter(160, 2.5, 300, (x, z) => { const y = c.heightAt(x, z); S.rock(x, y, z, 0.8 + r() * 2.8, mixc(col('#77736b'), col('#5d5a55'), r())); });
    // chevrones en las horquillas (lado de afuera)
    for (let i = 0; i < c.n; i += 3) {
      if (Math.abs(c.KS[i]) < 1 / 22) continue;
      const sg = c.KS[i] > 0 ? -1 : 1;
      const p = S.beyond(i, sg, 0.4);
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      S.st.box(p.x, p.y + 0.9, p.z, 1.2, 0.8, 0.08, col('#f2c230'), p.yaw);
      S.st.box(p.x + fx * 0.05, p.y + 1.05, p.z + fz * 0.05, 0.5, 0.5, 0.06, col('#111111'), p.yaw + Math.PI / 4);
      S.st.box(p.x, p.y, p.z, 0.1, 0.9, 0.1, col('#555'), p.yaw);
      i += 5;
    }
    S.horizon([
      ...Array.from({ length: 22 }, (_, k) => ({ b: k * 360 / 22 + r() * 8, w: 30 + r() * 25, h: 3 + r() * 5, shape: x => Math.pow(1 - Math.abs(x), 1.4), rough: 0.25 })),
    ], { base: '#4a5a6e', haze: '#a6b8cc', far: Array.from({ length: 14 }, (_, k) => ({ b: k * 360 / 14 + r() * 10, w: 40 + r() * 30, h: 6 + r() * 4, shape: x => Math.pow(1 - Math.abs(x), 1.2), rough: 0.3 })) });
  },

  // ============================================================== Desierto
  desierto(S, c) {
    const r = S.r;
    S.scatter(c.semi ? 260 : 180, 6, 350, (x, z) => S.tree('saguaro', x, c.heightAt(x, z), z, 0.7 + r() * 0.6, r() * TAU));
    S.scatter(c.semi ? 380 : 260, 4, 300, (x, z) => S.tree('nopal', x, c.heightAt(x, z), z, 0.8 + r() * 0.8, r() * TAU));
    S.scatter(c.semi ? 500 : 320, 2.5, 320, (x, z) => S.tree(r() < 0.5 ? 'lechuguilla' : 'arbusto', x, c.heightAt(x, z), z, 0.7 + r() * 0.8, r() * TAU));
    S.scatter(120, 3, 300, (x, z) => S.rock(x, c.heightAt(x, z), z, 0.6 + r() * 2.2, mixc(col('#a0784e'), col('#7d5a3a'), r())));
    // mesas de roca a lo lejos (capas de colores)
    const layers = ['#b5683f', '#c98a55', '#a65a36', '#d9a06a', '#8f4f30'].map(h => col(h));
    S.scatter(9, 90, 700, (x, z) => {
      const rad = S.rnd(40, 90), h = S.rnd(25, 60), y = c.heightAt(x, z) - 2;
      const seg = 7 + Math.floor(r() * 3);
      for (let k = 0; k < 5; k++) {
        const g = new THREE.CylinderGeometry(rad * (1 - k * 0.04), rad * (1.08 - k * 0.04), h / 5, seg);
        S.st.addGeometry(g, trs(x, y + (k + 0.5) * h / 5, z, r()), layers[k]);
      }
      S.st.addGeometry(new THREE.CylinderGeometry(rad * 1.1, rad * 1.45, 10, seg), trs(x, y - 2, z, r()), col('#b98a5a'));
    }, 900, 4);
    // rancho con molino cerca de la meta
    const s0 = c.sampleAt(40), p = S.beyond(s0.index, 1, 30);
    if (S.fits(p.x, p.z, 16, 12, p.yaw, 4)) {
      const y = c.heightAt(p.x, p.z);
      S.st.box(p.x, y - 0.3, p.z, 12, 4.3, 8, col('#c9a27a'), p.yaw, null, col('#8a5a3a'));
      S.st.box(p.x + 12, y, p.z, 0.4, 12, 0.4, col('#6b6f75'));
      for (let k = 0; k < 8; k++) S.st.box(p.x + 12, y + 12, p.z, 0.25, 2.6, 0.08, col('#c0c4c8'), k / 8 * TAU);
    }
    S.horizon([
      ...Array.from({ length: 12 }, (_, k) => ({ b: k * 30 + r() * 10, w: 30 + r() * 30, h: 1.5 + r() * 2.5, shape: x => Math.min(1, (1 - Math.abs(x)) * 3), rough: 0.12 })),
    ], { base: '#9a6a4e', haze: '#e6c7a0', far: [{ b: 200, w: 140, h: 3.5, shape: x => Math.pow(1 - Math.abs(x), 0.6), rough: 0.3 }] });
  },

  // ============================================================== Aeródromo (arrancones y gymkhana)
  aerodromo(S, c) {
    const r = S.r, b = c.bounds, def = c.def;
    const arena = def.kind === 'arena';
    if (arena) {
      // plataforma de concreto 200 × 140 con juntas
      const A = def.arena, pad = new GeoBuilder();
      const cc = col('#a7a6a0');
      for (let x = -A.w / 2; x < A.w / 2; x += 10) for (let z = -A.h / 2; z < A.h / 2; z += 10) {
        const v = 0.94 + r() * 0.1;
        pad.quad([x, 0, z + 10], [x + 10, 0, z + 10], [x + 10, 0, z], [x, 0, z], shade(cc, v));
      }
      pad.mesh(c.group, material(c.quality, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), { receive: c.semi, name: 'plataforma' });
      // pilas de llantas en las esquinas
      for (const [x, z] of [[-96, -66], [96, -66], [96, 66], [-96, 66]]) for (let k = 0; k < 6; k++) S.st.addGeometry(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 10), trs(x + (k % 3) * 1.3 - 1.3, 0.7, z + Math.floor(k / 3) * 1.3, 0), col('#1c1c1e'));
    } else {
      // la pista de aviación completa, más larga y ancha que el tramo de arrancones
      const run = new GeoBuilder(), cr = col('#7f7e79');
      const x0 = b.minX - 700, x1 = b.maxX + 900;
      run.quad([x0, -0.02, 24], [x1, -0.02, 24], [x1, -0.02, -24], [x0, -0.02, -24], cr);
      // umbrales tipo «teclas de piano»
      for (const xe of [x0 + 20, x1 - 60]) for (let k = -5; k <= 5; k++) S.ctx.builders.paint.quad([xe, 0.0, k * 3.6 + 1], [xe + 40, 0.0, k * 3.6 + 1], [xe + 40, 0.0, k * 3.6 - 1], [xe, 0.0, k * 3.6 - 1], col('#e8e8e8'));
      run.mesh(c.group, material(c.quality, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3 }), { name: 'pista-aviacion' });
      // gradas pequeñas junto a la salida y la meta
      for (const d of [c.startDistance - 30, c.finishDistance - 40]) {
        const s0 = c.sampleAt(d);
        S.grandstand(S.range(s0.index, c.wrapI(s0.index + 30), 2), -1, 6, 7, 0.55, 0.9, false);
      }
    }
    // hangares semicilíndricos
    const hc = [col('#8f969c'), col('#a3946f'), col('#7d8a80')];
    S.scatter(arena ? 6 : 7, 25, arena ? 160 : 220, (x, z) => {
      const yaw = Math.round(r() * 2) * Math.PI / 2, w = S.rnd(28, 40), d = S.rnd(36, 55);
      if (!S.fits(x, z, w, d, yaw, 8)) return false;
      if (!S.corr) S.corr = { b: new GeoBuilder(), t: corrugatedTex() };
      const g = new THREE.CylinderGeometry(w / 2, w / 2, d, 14, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
      S.corr.b.addGeometry(g, trs(x, 0, z, yaw), S.pick(hc), [6, 3]);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      for (const sgn of [-1, 1]) {
        const cx = x + fx * sgn * d / 2, cz = z + fz * sgn * d / 2;
        S.st.addGeometry(new THREE.CircleGeometry(w / 2, 14, 0, Math.PI), trs(cx, 0, cz, yaw + (sgn > 0 ? 0 : Math.PI)), col('#6d7277'));
        S.st.box(cx + fx * sgn * 0.05, 0, cz + fz * sgn * 0.05, w * 0.6, w * 0.32, 0.2, col('#3b3f45'), yaw);
      }
    });
    // torre de control vieja
    const ct = c.sampleAt(arena ? 0 : c.finishDistance * 0.5), pp = S.beyond(ct.index, -1, 60);
    if (S.fits(pp.x, pp.z, 9, 9, pp.yaw, 3)) {
      S.st.box(pp.x, 0, pp.z, 6, 16, 6, col('#c9c3b5'), pp.yaw);
      S.glow.box(pp.x, 16, pp.z, 8, 3, 8, S.night ? col('#ffe2a0', 1.2) : col('#5f8fb0'), pp.yaw);
      S.st.box(pp.x, 19, pp.z, 9, 0.5, 9, col('#3a3c40'), pp.yaw);
    }
    // avioneta abandonada y manga de viento
    S.scatter(arena ? 2 : 3, 15, 160, (x, z) => {
      const yaw = r() * TAU, w = col('#d8d4cc'), m = new THREE.Matrix4();
      if (!S.fits(x, z, 14, 12, yaw, 3)) return false;
      const T = trs(x, 1.4, z, yaw);
      S.st.addGeometry(new THREE.CylinderGeometry(0.6, 0.35, 9, 8).rotateX(Math.PI / 2), T, w);
      S.st.addGeometry(new THREE.BoxGeometry(12, 0.15, 1.8).translate(0, 0.4, -0.8), T, col('#b8452a'));
      S.st.addGeometry(new THREE.BoxGeometry(3.6, 0.12, 1).translate(0, 0.2, 4), T, w);
      S.st.addGeometry(new THREE.BoxGeometry(0.12, 1.6, 1.2).translate(0, 1, 4), T, col('#b8452a'));
      void m;
    });
    S.scatter(1, 10, 120, (x, z) => { S.st.box(x, 0, z, 0.15, 7, 0.15, col('#d0d0d0')); S.st.addGeometry(new THREE.ConeGeometry(0.5, 2.6, 8, 1, true).rotateZ(Math.PI / 2), trs(x + 1.4, 6.7, z, 0.6), col('#ff6a1a')); });
    // postes de luz
    for (let i = 0, k = 0; i < c.n; i += Math.round(60 / c.step), k++) {
      const sg = arena ? 1 : (k % 2 ? 1 : -1), p = S.beyond(i, sg, 3);
      if (c.clearance(p.x, p.z, 20) > 2) S.lightTower(p.x, 0, p.z, p.yaw, 16);
    }
    S.scatter(arena ? 120 : 160, 12, 300, (x, z) => S.tree('bajo', x, 0, z, 0.7 + r() * 0.6, r() * TAU));
    S.horizon([
      ...Array.from({ length: 10 }, (_, k) => ({ b: k * 36 + r() * 12, w: 40 + r() * 30, h: 1 + r() * 1.6, shape: x => Math.cos(x * Math.PI / 2), rough: 0.3 })),
    ], { base: '#6a7480', haze: '#b9c4cf' });
  },

  // ============================================================== Óvalo
  ovalo(S, c) {
    const r = S.r;
    // gradas gigantes por fuera de la recta principal y de las curvas
    const idx = [];
    for (let k = -Math.round(330 / c.step); k <= Math.round(330 / c.step); k += 2) idx.push(c.wrapI(k));
    S.grandstand(idx, 1, 6, 34, 0.75, 1.0, false);
    const back = [];
    const half = Math.round(c.n / 2);
    for (let k = -Math.round(150 / c.step); k <= Math.round(150 / c.step); k += 2) back.push(c.wrapI(half + k));
    S.grandstand(back, 1, 6, 16, 0.6, 0.95, true);
    // palco de prensa sobre la grada principal
    const s0 = c.sampleAt(0), p = S.beyond(s0.index, 1, 6 + 34 + 2);
    S.st.box(p.x, p.y + 27, p.z, 160, 8, 8, col('#2d3038'), p.yaw);
    S.glow.box(p.x + Math.sin(p.yaw) * 4.05, p.y + 29, p.z + Math.cos(p.yaw) * 4.05, 156, 3.5, 0.1, S.night ? col('#ffe7b8', 1.4) : col('#4f7aa0'), p.yaw);
    c.banner(c.bannerIndex.LOGO, p.x + Math.sin(p.yaw) * 4.2, p.y + 33.5, p.z + Math.cos(p.yaw) * 4.2, 40, 6, Math.cos(p.yaw), -Math.sin(p.yaw));
    // garajes de pits en el infield
    if (c.pitA >= 0) {
      const ids = S.range(c.pitA, c.pitB, 5).filter(i => c.pitWide(i) && Math.abs(c.KL[i]) < 1 / 300);
      ids.forEach(i => { const q = S.beyond(i, c.pitSide, 0.5), fx = Math.sin(q.yaw), fz = Math.cos(q.yaw); S.st.box(q.x - fx * 5, q.y, q.z - fz * 5, 9.6, 5, 10, col('#e2e0da'), q.yaw); S.st.box(q.x, q.y, q.z, 7, 3.8, 0.2, col('#2a2d33'), q.yaw); });
    }
    // remolques en el infield
    const tc = ['#c42020', '#1c4fa8', '#f0b020', '#2a8a4a', '#e8e8e8', '#202020'].map(h => col(h));
    const mid = c.sampleAt(c.length * 0.25);
    for (let k = 0; k < 14; k++) {
      const x = -180 + k * 26, z = -10 + (k % 2) * 30;
      if (c.clearance(x, z, 40) > 6) S.st.box(x, 0, z, 2.6, 4, 16, S.pick(tc), Math.PI / 2);
    }
    void mid;
    // torres de luz alrededor
    for (let i = 0, k = 0; i < c.n; i += Math.round(110 / c.step), k++) { const q = S.beyond(i, 1, 2); S.lightTower(q.x, q.y, q.z, q.yaw, 32); }
    S.scatter(220, 30, 260, (x, z) => S.tree('bajo', x, 0, z, 0.8 + r() * 0.8, r() * TAU));
    S.horizon(Array.from({ length: 9 }, (_, k) => ({ b: k * 40 + r() * 15, w: 50 + r() * 40, h: 0.8 + r() * 1.4, shape: x => Math.cos(x * Math.PI / 2), rough: 0.2 })), { base: '#5d6874', haze: '#aebac6' });
  },

  // ============================================================== Costa
  costa(S, c) {
    const r = S.r, b = c.bounds;
    S.water(b.minX - 4000, 255, b.maxX + 4000, 4400, 0, '#1f7f8f');
    // palmeras a lo largo de la recta de playa y dispersas
    for (let i = 0; i < c.n; i += Math.round(18 / c.step)) {
      if (c.Z[i] < 150) continue;
      for (const sg of [-1, 1]) {
        const p = S.beyond(i, sg, 2 + r() * 3);
        if (c.clearance(p.x, p.z, 20) > 1.5) S.tree('palma', p.x, c.heightAt(p.x, p.z), p.z, 0.9 + r() * 0.4, r() * TAU);
      }
    }
    S.scatter(c.semi ? 380 : 260, 5, 300, (x, z) => { const y = c.heightAt(x, z); if (y < 0.5) return false; S.tree(y < 6 ? 'palma' : 'bajo', x, y, z, 0.8 + r() * 0.6, r() * TAU); });
    // hoteles frente al mar (del lado de tierra de la recta de playa)
    const tints = ['#f2efe6', '#f4d8c4', '#cfe6ee', '#efe2b8', '#e6e6e6'].map(h => col(h));
    for (let i = 0; i < c.n; i += 8) {
      if (c.Z[i] < 170) continue;
      const w = S.rnd(26, 40), d = S.rnd(16, 22), h = S.rnd(22, 70);
      const p = S.beyond(i, -1, 14 + d / 2);
      if (!S.fits(p.x, p.z, w, d, p.yaw, 6)) continue;
      S.building(p.x, c.heightAt(p.x, p.z), p.z, w, d, h, p.yaw, S.pick(tints));
      i += Math.round(w / c.step) + 6;
    }
    // faro en un cerro
    S.scatter(1, 60, 260, (x, z) => { const y = c.heightAt(x, z); if (y < 15) return false; for (let k = 0; k < 7; k++) S.st.box(x, y + k * 3, z, 3.4 - k * 0.2, 3, 3.4 - k * 0.2, k % 2 ? col('#c42020') : col('#f4f4f4')); S.glow.box(x, y + 21, z, 2.2, 2, 2.2, col('#fff0b0', S.night ? 2 : 1)); });
    // lanchas
    for (let k = 0; k < 10; k++) {
      const x = S.rnd(b.minX, b.maxX), z = S.rnd(320, 900), yaw = r() * TAU;
      S.st.addGeometry(new THREE.BoxGeometry(2.2, 1, 7).translate(0, 0.3, 0), trs(x, 0, z, yaw), col('#f2f2f2'));
      S.st.addGeometry(new THREE.BoxGeometry(1.6, 0.9, 2).translate(0, 1.2, -0.6), trs(x, 0, z, yaw), col('#2a6fd1'));
    }
    for (let i = 0, k = 0; i < c.n; i += Math.round(55 / c.step), k++) { const p = S.beyond(i, -1, 1.5); if (c.clearance(p.x, p.z, 20) > 1) S.lamp(p.x, p.y, p.z, p.yaw, 9, 2.5 + Math.min(c.LW[i], 9) - c.HW[i]); }
    S.horizon([
      { b: 320, w: 120, h: 4, shape: x => Math.pow(1 - Math.abs(x), 0.8), rough: 0.25 },
      { b: 20, w: 70, h: 3, shape: x => Math.pow(1 - Math.abs(x), 1), rough: 0.25 },
      { b: 255, w: 60, h: 2.4, shape: x => Math.pow(1 - Math.abs(x), 1), rough: 0.2 },
    ], { base: '#4f6a6a', haze: '#b4cbd6' });
  },

  // ============================================================== Nieve
  nieve(S, c) {
    const r = S.r;
    // lago congelado alrededor del tramo de hielo
    if (c.lake) {
      const { cx, cz, rad: rr, y: ly } = c.lake, rad = rr - 35;
      const g = new THREE.CircleGeometry(rad + 35, 40).rotateX(-Math.PI / 2);
      const ice = new THREE.Mesh(g, material(c.quality, { color: 0xc8e0f0, roughness: 0.1, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
      ice.position.set(cx, ly - 0.05, cz); ice.scale.set(1, 1, 0.75); ice.name = 'lago';
      c.group.add(ice);
      S.lakeR = { cx, cz, rad: rad + 35 };
    }
    const inLake = (x, z) => S.lakeR && Math.hypot(x - S.lakeR.cx, (z - S.lakeR.cz) / 0.75) < S.lakeR.rad + 4;
    S.scatter(c.semi ? 1800 : 1200, 3, 340, (x, z) => { if (inLake(x, z)) return false; S.tree('pinoNieve', x, c.heightAt(x, z), z, 0.8 + r() * 1.0, r() * TAU); });
    S.scatter(80, 2.5, 300, (x, z) => { if (inLake(x, z)) return false; S.rock(x, c.heightAt(x, z), z, 0.6 + r() * 1.6, mixc(col('#6f7378'), col('#e8eef4'), r() * 0.5)); });
    // cabañas
    let cab = 0;
    S.scatter(10, 10, 140, (x, z) => {
      const yaw = r() * TAU, w = S.rnd(7, 10), d = S.rnd(8, 12);
      if (inLake(x, z) || !S.fits(x, z, w + 2, d + 2, yaw, 3)) return false;
      const y = c.heightAt(x, z);
      S.st.box(x, y - 0.5, z, w, 3.6, d, col('#7a4e2c'), yaw);
      const cs = Math.cos(yaw), sn = Math.sin(yaw), P = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
      const hw = w / 2 + 0.6, hd = d / 2 + 0.6, snow = col('#f2f6fa');
      S.st.quad(P(-hw, 3, hd), P(0, 5.6, hd), P(0, 5.6, -hd), P(-hw, 3, -hd), snow);
      S.st.quad(P(0, 5.6, hd), P(hw, 3, hd), P(hw, 3, -hd), P(0, 5.6, -hd), snow);
      S.st.tri(P(-w / 2, 3.05, d / 2), P(w / 2, 3.05, d / 2), P(0, 5.5, d / 2), col('#6a4426'));
      S.st.tri(P(w / 2, 3.05, -d / 2), P(-w / 2, 3.05, -d / 2), P(0, 5.5, -d / 2), col('#6a4426'));
      S.st.box(x + sn * 0, y + 3.5, z, 0.8, 3, 0.8, col('#5a5a5a'), yaw);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      for (const o of [-w / 4, w / 4]) S.glow.box(x + fx * (d / 2 + 0.05) + cs * o, y + 1.6, z + fz * (d / 2 + 0.05) - sn * o, 1.2, 1, 0.06, S.night || c.weather === 'snow' ? col('#ffcf7a', 1.5) : col('#5d7590'), yaw);
      if (S.night) S.pools.push([x + fx * (d / 2 + 3), y, z + fz * (d / 2 + 3), 9]);
      cab++;
    });
    // muñeco de nieve cerca de la meta
    const s0 = c.sampleAt(25), p = S.beyond(s0.index, 1, 4);
    if (c.clearance(p.x, p.z, 20) > 2) {
      const y = c.heightAt(p.x, p.z), w = col('#f4f7fa');
      S.st.addGeometry(new THREE.IcosahedronGeometry(0.9, 1), trs(p.x, y + 0.8, p.z), w);
      S.st.addGeometry(new THREE.IcosahedronGeometry(0.65, 1), trs(p.x, y + 2.0, p.z), w);
      S.st.addGeometry(new THREE.IcosahedronGeometry(0.45, 1), trs(p.x, y + 2.9, p.z), w);
      S.st.addGeometry(new THREE.ConeGeometry(0.08, 0.5, 5).rotateX(Math.PI / 2), trs(p.x + Math.sin(p.yaw) * 0.5, y + 2.9, p.z + Math.cos(p.yaw) * 0.5, p.yaw), col('#ff7a1a'));
    }
    S.horizon([
      ...Array.from({ length: 18 }, (_, k) => ({ b: k * 20 + r() * 8, w: 26 + r() * 20, h: 3 + r() * 4, shape: x => Math.pow(1 - Math.abs(x), 1.3), rough: 0.25 })),
    ], { base: '#c8d4e2', haze: '#dfe7f0', far: Array.from({ length: 10 }, (_, k) => ({ b: k * 36 + r() * 12, w: 40 + r() * 30, h: 6 + r() * 3, shape: x => Math.pow(1 - Math.abs(x), 1.1), rough: 0.3 })) });
  },
};

// Silueta del Cerro de la Silla: dos jorobas (Pico Norte y Pico Sur) con la «silla» en medio y la Antena.
function silla(x) {
  const g = (m, s, a) => a * Math.exp(-((x - m) ** 2) / (2 * s * s));
  const body = Math.max(0, 1 - x * x) * 0.55;
  return Math.min(1.05, Math.max(body, g(-0.42, 0.16, 0.92) + g(-0.62, 0.1, 0.35), g(0.38, 0.14, 1.0) + g(0.55, 0.08, 0.25), g(0.02, 0.22, 0.62), g(0.75, 0.07, 0.55)));
}
