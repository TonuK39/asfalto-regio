// Modelos 3D procedurales de los autos: carrocería low-poly reconocible, personalización visible,
// luces, interior opcional, fantasma, daño y etiqueta de nombre. Ver contrato en DISENO.md («Autos»).
import * as THREE from 'three';
import { CAR_BY_ID } from '../data/cars.js';
import { resolveCustom } from '../data/parts.js';
import { GeoBuf, box, cyl } from './cars/geom.js';
import { Profile, buildBody, buildInterior, buildFormula, steeringWheelBuf } from './cars/body.js';
import {
  getEnvMap, getGlowTexture, getHeadlightPoolTexture, getRimAtlas, RIM_STYLES, TIRE_CELL, rimCellUV,
  paintTexture, gaugeTexture, nameTagTexture, paletteTexture, PAL, ATLAS,
} from './cars/textures.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const RIDE_DROP = [0, 0.03, 0.06];
const CAMBER = [0, 0, 0.05];
const FINISH = {
  brillante: { refl: 0.12, rough: 0.35, metal: 0.05 }, metalico: { refl: 0.22, rough: 0.3, metal: 0.55 },
  perla: { refl: 0.18, rough: 0.25, metal: 0.3 }, mate: { refl: 0, rough: 0.92, metal: 0 }, cromo: { refl: 0.7, rough: 0.08, metal: 1 },
};
const IDLE = { speed: 0, steerAngle: 0, rpm: 900, gear: 0, brake: 0, throttle: 0, nitroActive: false, wheelSpin: 0 };

// ───────────── Materiales compartidos ─────────────
const shared = new Map();
const liveReflective = new Set();
let envLevel = 1;
function sh(key, make) { let m = shared.get(key); if (!m) { m = make(); for (const x of [].concat(m)) x.userData.shared = true; shared.set(key, m); } return m; }

function trimMat(q) {
  return sh('trim' + q, () => q === 'semi'
    ? new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.3, envMap: getEnvMap(), envMapIntensity: 0.6 })
    : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}
function interiorMat() { return sh('int', () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); }
function glassMat(q, transparent) {
  return sh('glass' + q + transparent, () => {
    const color = transparent ? '#a9bccb' : '#1f2830';
    const m = q === 'semi'
      ? new THREE.MeshStandardMaterial({ color, vertexColors: true, flatShading: true, roughness: 0.06, metalness: 0.4, envMap: getEnvMap(), envMapIntensity: envLevel })
      : new THREE.MeshLambertMaterial({ color, vertexColors: true, flatShading: true, envMap: getEnvMap(), reflectivity: 0.28 * envLevel, combine: THREE.MixOperation });
    m.userData.baseRefl = 0.28;
    if (transparent) { m.transparent = true; m.depthWrite = false; }
    liveReflective.add(m);
    return m;
  });
}
function wheelMats(q) {
  return sh('wheel' + q, () => {
    const atlas = getRimAtlas();
    if (q !== 'semi') return new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
    return [
      new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.92, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, roughness: 0.3, metalness: 0.75, envMap: getEnvMap() }),
    ];
  });
}
const needleMat = () => sh('needle', () => new THREE.MeshBasicMaterial({ color: '#ff5a1f', side: THREE.DoubleSide, toneMapped: false }));
const flameMat = () => sh('flame', () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
const shadowMat = () => sh('shadow', () => new THREE.MeshBasicMaterial({ map: getGlowTexture(), color: '#000000', transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
const glowMat = (color, tex, opacity) => sh('glow' + color + tex.uuid + opacity, () => new THREE.MeshBasicMaterial({
  map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3,
}));
const smokeMat = () => sh('dmgsmoke', () => new THREE.PointsMaterial({ map: getGlowTexture(), size: 0.9, transparent: true, depthWrite: false, vertexColors: true, color: '#9a9a9a' }));

// Nivel de reflejos (p. ej. 0.35 de noche). Afecta materiales compartidos y pinturas vivas.
export function setCarEnvironmentLevel(level = 1) {
  envLevel = clamp(level, 0, 1.5);
  for (const m of liveReflective) {
    if (m.isMeshStandardMaterial) m.envMapIntensity = envLevel;
    else if (m.envMap) m.reflectivity = (m.userData.baseRefl || 0.15) * envLevel;
  }
}

const ghostCache = new WeakMap();
function ghostOf(mat, o) {
  let byLevel = ghostCache.get(mat);
  if (!byLevel) { byLevel = new Map(); ghostCache.set(mat, byLevel); }
  const k = Math.round(o * 10);
  let g = byLevel.get(k);
  if (!g) {
    g = mat.clone();
    g.transparent = true; g.depthWrite = false;
    g.opacity = (mat.transparent ? mat.opacity : 1) * Math.max(0.05, k / 10);
    g.userData = { ghost: true, shared: !!mat.userData.shared };
    byLevel.set(k, g);
  }
  return g;
}
function disposeGhosts(mat) {
  const m = ghostCache.get(mat);
  if (m) { for (const g of m.values()) g.dispose(); ghostCache.delete(mat); }
}

function hexRGB(hex) { const n = parseInt(String(hex).slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function ihash(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// Proyección de UV de la pintura según la normal de la cara (ver regiones del atlas en textures.js).
function makeProjector(Pf) {
  const L = Pf.L, W = Pf.W, H = Pf.Hmax, zF = Pf.zF, S = ATLAS.solid;
  return (nx, ny, nz, x, y, z) => {
    if (ny < -0.6) return S;
    const s = clamp((z - zF) / L, 0.002, 0.998);
    if (ny > 0.55) return [s, clamp(0.375 + x * 0.25 / W, 0.252, 0.498)];
    const hv = clamp(y / H, 0.01, 0.99) * 0.25;
    if (Math.abs(nx) >= Math.abs(nz) * 0.8) return nx < 0 ? [s, 0.75 + hv] : [1 - s, 0.5 + hv];
    if (nz < 0) return [clamp(0.125 - x * 0.25 / W, 0.002, 0.248), hv];
    return [clamp(0.375 + x * 0.25 / W, 0.252, 0.498), hv];
  };
}

// ───────────── Rueda (llanta + rin en una geometría) y freno ─────────────
function wheelGeometry(R, tw, style, rimColor, segs, rimFrac, semi) {
  const b = new GeoBuf({ colors: 3, uv: true });
  const T = rimCellUV(TIRE_CELL), M = rimCellUV(Math.max(0, RIM_STYLES.indexOf(style)));
  const rr = R * rimFrac, x0 = -tw / 2, x1 = tw / 2;
  const inset = style === 'dish' ? 0.055 : (style === 'tapon' || style === 'aero') ? 0.012 : 0.03;
  const A = i => i / segs * Math.PI * 2;
  const P = (a, r, x) => [x, Math.cos(a) * r, Math.sin(a) * r];
  const tuv = (a, k) => [T.cu + Math.cos(a) * T.r * k, T.cv + Math.sin(a) * T.r * k];
  b.setColor([1, 1, 1]);
  for (let i = 0; i < segs; i++) {
    const a0 = A(i), a1 = A(i + 1);
    const ref = [0, 0, 0];
    const tq = (p0, p1, p2, p3, r, k0, k1) => { b.tri(p0, p1, p2, r, tuv(a0, k0), tuv(a1, k0), tuv(a1, k1)); b.tri(p0, p2, p3, r, tuv(a0, k0), tuv(a1, k1), tuv(a0, k1)); };
    tq(P(a0, R, x0), P(a1, R, x0), P(a1, R, x1), P(a0, R, x1), ref, 0.95, 0.95);
    tq(P(a0, R, x1), P(a1, R, x1), P(a1, rr, x1), P(a0, rr, x1), [x1 - 1, 0, 0], 0.9, 0.55);
    tq(P(a0, R, x0), P(a1, R, x0), P(a1, rr, x0), P(a0, rr, x0), [x0 + 1, 0, 0], 0.9, 0.55);
    b.tri([x0 + 0.012, 0, 0], P(a0, rr, x0 + 0.012), P(a1, rr, x0 + 0.012), [x0 - 1, 0, 0], [T.cu, T.cv], tuv(a0, 0.4), tuv(a1, 0.4));
  }
  const nTire = b.triangles;
  b.setColor(rimColor);
  const muv = (a, k) => [M.cu + Math.cos(a) * M.r * k, M.cv + Math.sin(a) * M.r * k];
  const xf = x1 - inset;
  for (let i = 0; i < segs; i++) {
    const a0 = A(i), a1 = A(i + 1);
    const out0 = P((a0 + a1) / 2, rr * 3, 0);
    b.tri(P(a0, rr, xf), P(a1, rr, xf), P(a1, rr, x0 + 0.012), out0, muv(a0, 0.98), muv(a1, 0.98), muv(a1, 0.98));
    b.tri(P(a0, rr, xf), P(a1, rr, x0 + 0.012), P(a0, rr, x0 + 0.012), out0, muv(a0, 0.98), muv(a1, 0.98), muv(a0, 0.98));
    b.tri([xf, 0, 0], P(a0, rr, xf), P(a1, rr, xf), [xf - 1, 0, 0], [M.cu, M.cv], muv(a0, 1), muv(a1, 1));
  }
  const g = b.toGeometry();
  if (semi) { g.addGroup(0, nTire * 3, 0); g.addGroup(nTire * 3, (b.triangles - nTire) * 3, 1); }
  g.userData.inset = inset; g.userData.rimR = rr;
  return g;
}
function brakeInto(buf, cx, cy, cz, sx, rr, tw, inset, caliper) {
  const xr = cx + sx * (tw / 2 - inset - 0.04);
  buf.setColor('#7d8187'); cyl(buf, xr, cy, cz, 'x', rr * 0.82, 0.018, 8, { phase: Math.PI / 8 });
  buf.setColor(caliper); box(buf, xr + sx * 0.012, cy + rr * 0.5, cz + rr * 0.48, 0.06, rr * 0.42, rr * 0.3, -0.8, 0, 0);
}

// ───────────── Modelo ─────────────
export function buildCarModel(carDef, custom, opts = {}) {
  const def = typeof carDef === 'string' ? CAR_BY_ID[carDef] : carDef;
  if (!def) throw new Error('Auto desconocido: ' + carDef);
  return new CarModel(def, custom, opts);
}

class CarModel {
  constructor(def, custom, { quality = 'lowpoly', interior = false, ghostable = true } = {}) {
    const cu = this.custom = resolveCustom(def, custom);
    const q = this.quality = quality === 'semi' ? 'semi' : 'lowpoly';
    const semi = q === 'semi';
    this.carDef = this.def = def;
    this.ghostable = ghostable !== false;
    const Pf = this.profile = new Profile(def, cu);
    const formula = Pf.type === 'monoplaza';
    const bufs = {
      paint: new GeoBuf({ uv: true, project: makeProjector(Pf) }), trim: new GeoBuf({ colors: 3 }),
      glass: new GeoBuf({ colors: 4 }), lights: new GeoBuf({ uv: true }),
    };
    const out = {};
    const ctx = { Pf, def, cu, bufs, out };
    if (formula) buildFormula(ctx); else buildBody(ctx);
    let intBuf = null;
    if (!formula) intBuf = buildInterior(ctx);   // también calcula ojo, tablero y volante
    this.dims = { length: Pf.L, width: Pf.W, height: Pf.H, wheelbase: Pf.wb };

    this.group = new THREE.Group();
    this.group.name = 'auto:' + def.id;
    this.group.rotation.order = 'YXZ';
    this.body = new THREE.Group();
    this.body.position.y = -RIDE_DROP[cu.ride | 0];
    this.group.add(this.body);
    this._meshes = [];       // mallas que cambian a fantasma
    this._ownMats = [];      // materiales propios del auto (se liberan en dispose)
    this._ownTex = [];
    this._dmg = [];          // geometrías con abolladuras
    this.stats = { triangles: 0, interiorTriangles: 0, drawCalls: 0 };

    // pintura
    const L = Pf.L, P = Pf.P;
    const info = {
      L, W: Pf.W, H: Pf.Hmax, c: Pf.c, E: s => Pf.E(s / L), sWS: P.ws * L, sRF: P.rf * L, sRB: P.rb * L, sRW: P.rw * L,
      sFA: Pf.fFA * L, sRA: Pf.fRA * L, R: Pf.R, doors: Pf.doors, sBP: Pf.bp ? Pf.bp * L : null, sDoorEnd: Pf.doorEnd * L,
      traits: Pf.traits, type: Pf.type, seed: def.id, seedNum: Math.floor(ihash(def.id.length, def.id.charCodeAt(0), def.id.charCodeAt(1)) * 1000),
    };
    this._paintTex = paintTexture(info, cu, semi ? 1024 : 512);
    this._ownTex.push(this._paintTex);
    const fin = FINISH[cu.finish] || FINISH.brillante;
    const pm = semi
      ? new THREE.MeshStandardMaterial({ map: this._paintTex, flatShading: true, roughness: fin.rough, metalness: fin.metal, envMap: fin.refl ? getEnvMap() : null, envMapIntensity: envLevel })
      : new THREE.MeshLambertMaterial({ map: this._paintTex, flatShading: true, envMap: fin.refl ? getEnvMap() : null, reflectivity: fin.refl * envLevel, combine: THREE.MixOperation });
    pm.userData.baseRefl = fin.refl;
    if (fin.refl) liveReflective.add(pm);
    this.paintMat = pm; this._ownMats.push(pm);
    this._palette = paletteTexture(); this._ownTex.push(this._palette);
    this.lightsMat = new THREE.MeshBasicMaterial({ map: this._palette, toneMapped: false });
    this._ownMats.push(this.lightsMat);

    const addMesh = (buf, mat, parent = this.body, opts2 = {}) => {
      if (!buf || !buf.triangles) return null;
      const g = buf.toGeometry();
      const m = new THREE.Mesh(g, mat);
      m.userData.baseMat = mat;
      if (semi && opts2.shadow !== false) m.castShadow = true;
      parent.add(m);
      if (opts2.ghost !== false) this._meshes.push(m);
      if (opts2.dent) this._dmg.push(g);
      if (opts2.interior) this.stats.interiorTriangles += buf.triangles; else this.stats.triangles += buf.triangles;
      this.stats.drawCalls++;
      return m;
    };

    // frenos traseros (no giran ni dan vuelta) van con los adornos
    this.wheels = [];
    const rimFrac = def.body.rimFrac ?? (def.year < 1975 ? 0.56 : def.year < 1990 ? 0.6 : def.year < 2005 ? 0.66 : 0.71);
    const segs = semi ? 20 : 12;
    const geoCache = {};
    const wgeo = (R, tw) => geoCache[R + ':' + tw] || (geoCache[R + ':' + tw] = wheelGeometry(R, tw, cu.rims, cu.rimColor, segs, rimFrac, semi));
    for (const a of Pf.axles) {
      const g = wgeo(a.R, a.tw);
      // la carrocería baja con `ride`; los frenos traseros se suben lo mismo para quedar en el eje
      if (!a.front) for (const s of [1, -1]) brakeInto(bufs.trim, s * a.halfTrack, a.R + RIDE_DROP[cu.ride | 0], a.z, s, g.userData.rimR, a.tw, g.userData.inset, cu.caliper);
    }
    // las cubetas de la carrocería se vuelven mallas
    this.paintMesh = addMesh(bufs.paint, pm, this.body, { dent: true });
    this.trimMesh = addMesh(bufs.trim, trimMat(q), this.body, { dent: true });
    this.glassMesh = addMesh(bufs.glass, glassMat(q, !!interior), this.body, { dent: true, shadow: false });
    this.lightsMesh = addMesh(bufs.lights, this.lightsMat, this.body, { dent: true, shadow: false });

    // faros escamoteables
    this._popup = null;
    if (out.popup) {
      const pv = new THREE.Group();
      pv.position.set(...out.popup.hinge);
      const shift = g => { g.translate(-out.popup.hinge[0], -out.popup.hinge[1], -out.popup.hinge[2]); return g; };
      const mp = new THREE.Mesh(shift(out.popup.paint.toGeometry()), pm); mp.userData.baseMat = pm;
      const ml = new THREE.Mesh(shift(out.popup.lights.toGeometry()), this.lightsMat); ml.userData.baseMat = this.lightsMat;
      pv.add(mp, ml); this._meshes.push(mp, ml);
      this.body.add(pv);
      this._popup = { pivot: pv, angle: 0, open: out.popup.open };
      this.stats.triangles += out.popup.paint.triangles + out.popup.lights.triangles; this.stats.drawCalls += 2;
    }

    // ruedas
    const wmat = wheelMats(q);
    const dt = def.spec.drivetrain;
    for (const a of Pf.axles) {
      const g = wgeo(a.R, a.tw);
      for (const s of [1, -1]) {
        const pivot = new THREE.Group();
        pivot.rotation.order = 'YZX';
        pivot.position.set(s * a.halfTrack, a.R, a.z);
        pivot.rotation.z = s * CAMBER[cu.ride | 0];
        const spin = new THREE.Group();
        const wm = new THREE.Mesh(g, wmat);
        wm.scale.x = s; wm.userData.baseMat = wmat;
        if (semi) wm.castShadow = true;
        spin.add(wm); pivot.add(spin);
        this._meshes.push(wm);
        this.stats.triangles += g.attributes.position.count / 3; this.stats.drawCalls += semi ? 2 : 1;
        if (a.front) {
          const bb = new GeoBuf({ colors: 3 });
          brakeInto(bb, 0, 0, 0, s, g.userData.rimR, a.tw, g.userData.inset, cu.caliper);
          addMesh(bb, trimMat(q), pivot);
        }
        this.group.add(pivot);
        const local = new THREE.Vector3(s * a.halfTrack, a.R, a.z), contact = new THREE.Vector3(s * a.halfTrack, 0, a.z);
        const grp = this.group;
        this.wheels.push({
          mesh: pivot, spin, front: a.front, side: s > 0 ? 'R' : 'L', radius: a.R, width: a.tw,
          driven: dt === 'AWD' || (dt === 'FWD') === a.front, _a: 0,
          worldPos(t = new THREE.Vector3()) { return t.copy(local).applyMatrix4(grp.matrixWorld); },
          contactPos(t = new THREE.Vector3()) { return t.copy(contact).applyMatrix4(grp.matrixWorld); },
        });
      }
    }

    // cabina, cofre, volante e instrumentos
    const eye = new THREE.Object3D(); eye.name = 'ojos';
    eye.position.set(...(out.eye || [0, Pf.H * 0.8, 0]));
    this.body.add(eye);
    const hood = new THREE.Object3D(); hood.name = 'cofre';
    if (formula) hood.position.set(0, 1.04, 0.12);
    else { const fh = Math.max(0.05, P.ws - 0.1); hood.position.set(0, Pf.T(fh) + 0.16, Pf.z(fh)); }
    this.body.add(hood);
    this.hood = hood;
    const wheelPivot = new THREE.Group();
    const steer = new THREE.Group(); steer.name = 'volante';
    wheelPivot.position.set(...(out.wheelCenter || [0, Pf.H * 0.6, 0]));
    wheelPivot.rotation.x = formula ? -0.15 : -0.35;
    wheelPivot.add(steer); this.body.add(wheelPivot);
    this.cockpit = { eye, steeringWheel: steer };
    this._needles = null;
    if (interior) {
      if (intBuf) addMesh(intBuf, interiorMat(), this.body, { interior: true, shadow: false });
      const sw = steeringWheelBuf(formula ? 0.13 : 0.175, formula);
      addMesh(sw, interiorMat(), steer, { interior: true, shadow: false });
      const gInfo = out.gauge;
      if (gInfo) {
        const maxKmh = Math.ceil(((def.topKmh || 200) + 20) / 40) * 40, maxRpm = Math.ceil(def.spec.redlineRpm / 1000 + 1) * 1000;
        const gt = gaugeTexture(maxKmh, maxRpm, def.engine.layout === 'EV' ? null : def.spec.redlineRpm);
        this._ownTex.push(gt);
        const gm = new THREE.MeshBasicMaterial({ map: gt, toneMapped: false }); this._ownMats.push(gm);
        const sc = (gInfo.scale || 1) * 0.82;
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.34 * sc, 0.17 * sc), gm);
        panel.position.set(...gInfo.pos); panel.rotation.x = gInfo.tilt;
        panel.userData.baseMat = gm; this._meshes.push(panel);
        this.body.add(panel);
        const ng = new THREE.BufferGeometry();
        ng.setAttribute('position', new THREE.Float32BufferAttribute([-0.004 * sc, 0, 0.002, 0.004 * sc, 0, 0.002, 0, 0.062 * sc, 0.002], 3));
        const n1 = new THREE.Mesh(ng, needleMat()), n2 = new THREE.Mesh(ng, needleMat());
        n1.position.set(-0.085 * sc, 0, 0); n2.position.set(0.085 * sc, 0, 0);
        panel.add(n1, n2);
        this._needles = { speed: n1, rpm: n2, maxKmh, maxRpm };
        this.stats.interiorTriangles += 4; this.stats.drawCalls += 3;
      }
    }

    // flamas de nitro
    this._flame = null;
    if (out.exhausts && out.exhausts.length) {
      const fb = new GeoBuf({ colors: 3 });
      for (const e of out.exhausts) {
        const len = 0.5 + e.r * 3, up = e.dir[1] > 0.5;
        const c = [e.pos[0] + e.dir[0] * len / 2, e.pos[1] + e.dir[1] * len / 2, e.pos[2] + e.dir[2] * len / 2];
        fb.setColor('#2a5cff'); cyl(fb, c[0], c[1], c[2], up ? 'y' : 'z', e.r * 1.25, len, 7, { r2: 0.0, caps: false });
        fb.setColor('#ffe9c0'); cyl(fb, c[0], c[1], c[2] - (up ? 0 : len * 0.2), up ? 'y' : 'z', e.r * 0.7, len * 0.55, 6, { r2: 0, caps: false });
      }
      const ex0 = out.exhausts[0].pos, fg = fb.toGeometry();
      fg.translate(-ex0[0] * 0, -ex0[1], -ex0[2]);
      const fm = new THREE.Mesh(fg, flameMat());
      fm.position.set(0, ex0[1], ex0[2]);
      fm.userData.axis = out.exhausts[0].dir[1] > 0.5 ? 'y' : 'z';
      fm.visible = false; fm.frustumCulled = false;
      this.body.add(fm);
      this._flame = fm;
    }

    // sombra de contacto, neón inferior, charco de faros
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(Pf.W * 1.3, Pf.L * 1.12), shadowMat());
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.renderOrder = -1;
    this.group.add(shadow); this._shadow = shadow; this.stats.drawCalls++;
    this._glow = null;
    if (cu.underglow) {
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(Pf.W * 1.6, Pf.L * 1.15), glowMat(cu.underglow, getGlowTexture(), 0.9));
      gm.rotation.x = -Math.PI / 2; gm.position.y = 0.03;
      this.group.add(gm); this._glow = gm; this.stats.drawCalls++;
    }
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 10), glowMat(cu.lights, getHeadlightPoolTexture(), 0.45));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.04, Pf.zF - 5);
    pool.visible = false;
    this.group.add(pool); this._pool = pool;

    // humo por daño
    const NS = 14;
    this._smoke = { n: NS, life: new Float32Array(NS), vel: new Float32Array(NS * 3), origin: formula ? [0, 0.9, 0.6] : [0, Pf.T(0.12) + 0.05, Pf.z(0.12)] };
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NS * 4), 4));
    const sp = new THREE.Points(sg, smokeMat()); sp.visible = false; sp.frustumCulled = false;
    this.body.add(sp); this._smoke.points = sp;

    // daño: posiciones originales y desplazamiento por posición (los vértices coincidentes se mueven igual)
    const zm = (Pf.zF + Pf.zR) / 2, hl = Pf.L / 2, hwd = Pf.W / 2, yc = Pf.H * 0.45;
    for (const g of this._dmg) {
      const p = g.attributes.position.array, d = new Float32Array(p.length);
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        const nz = Math.abs(z - zm) / hl, nx = Math.abs(x) / hwd;
        const w = Math.max(0, nz - 0.5) / 0.5 * 0.85 + Math.max(0, nx - 0.75) / 0.25 * 0.35 + (y > Pf.H * 0.85 ? 0.12 : 0);
        const n = ihash(Math.round(x * 7), Math.round(y * 7), Math.round(z * 7));
        const amp = 0.11 * w * (0.25 + 0.75 * n);
        let dx = -Math.sign(x) * 0.5, dy = (yc - y) * 0.6, dz = -Math.sign(z - zm) * nz;
        const l = Math.hypot(dx, dy, dz) || 1;
        d[i] = dx / l * amp; d[i + 1] = dy / l * amp; d[i + 2] = dz / l * amp;
      }
      g.userData.orig = Float32Array.from(p); g.userData.disp = d;
    }

    // luces
    this._spots = null;
    this.lightsOn = false;
    this._siren = !!out.siren; this._t = 0;
    this._headPos = out.headPos || [];
    this._palKey = '';
    this._brake = false; this._rev = false;
    this.damage = 0;
    this._nameSprite = null;
    this._opacity = 1;
    this._steerRatio = formula ? 7 : 13;
    this._writePalette();
  }

  // ───── API ─────
  update(dt, state) {
    const s = state || IDLE;
    dt = Math.min(0.1, Math.max(0, dt || 0));
    if (Number.isFinite(s.pitch)) { this.group.rotation.x = s.pitch; this.group.rotation.z = Number.isFinite(s.roll) ? s.roll : 0; }
    const sp = s.speed || 0, steerA = s.steerAngle || 0, ws = s.wheelSpin || 0;
    for (const w of this.wheels) {
      let av = sp / w.radius;
      if (w.driven && ws > 0.05) av += ws * 38 * (sp < -0.5 ? -1 : 1);
      w._a = (w._a - av * dt) % (Math.PI * 2);
      w.spin.rotation.x = w._a;
      if (w.front) w.mesh.rotation.y = -steerA;
    }
    this.cockpit.steeringWheel.rotation.z = -steerA * this._steerRatio;
    if (this._needles) {
      const n = this._needles;
      n.speed.rotation.z = 0.75 * Math.PI - 1.5 * Math.PI * clamp(Math.abs(sp) * 3.6 / n.maxKmh, 0, 1);
      n.rpm.rotation.z = 0.75 * Math.PI - 1.5 * Math.PI * clamp((s.rpm || 0) / n.maxRpm, 0, 1);
    }
    this._brake = (s.brake || 0) > 0.05;
    this._rev = s.gear === -1;
    this._t += dt;
    this._writePalette();
    if (this._popup) {
      const p = this._popup, target = this.lightsOn ? p.open : 0;
      p.angle += clamp(target - p.angle, -dt * 2.5, dt * 2.5);
      p.pivot.rotation.x = p.angle;
    }
    if (this._flame) {
      this._flame.visible = !!s.nitroActive;
      if (s.nitroActive) this._flame.scale[this._flame.userData.axis] = 0.7 + Math.random() * 0.6;
    }
    if (this.damage > 0.5) this._updateSmoke(dt, sp);
  }

  setLights(on, opts = {}) {
    this.lightsOn = !!on;
    this._pool.visible = this.lightsOn && !opts.castLight;
    if (opts.castLight && !this._spots) this._makeSpots();
    if (this._spots) for (const sl of this._spots) sl.intensity = this.lightsOn && opts.castLight !== false ? 28 : 0;
    this._writePalette();
  }
  setSiren(on) { this._siren = !!on; this._writePalette(); }

  setOpacity(o) {
    if (!this.ghostable) return;
    o = clamp(+o || 0, 0, 1);
    const ghost = o < 0.995;
    if (!ghost && this._opacity >= 0.995) return;
    this._opacity = o;
    for (const m of this._meshes) {
      const base = m.userData.baseMat;
      m.material = !ghost ? base : Array.isArray(base) ? base.map(b => ghostOf(b, o)) : ghostOf(base, o);
    }
    this._shadow.visible = !ghost;
  }

  setDamage(d) {
    d = clamp(+d || 0, 0, 1);
    if (Math.abs(d - this.damage) < 0.004) return;
    this.damage = d;
    for (const g of this._dmg) {
      const p = g.attributes.position.array, o = g.userData.orig, dp = g.userData.disp;
      for (let i = 0; i < p.length; i++) p[i] = o[i] + dp[i] * d;
      g.attributes.position.needsUpdate = true;
    }
    const k = 1 - 0.35 * d;
    this.paintMat.color.setScalar(k);
    const gc = ghostCache.get(this.paintMat);
    if (gc) for (const gm of gc.values()) gm.color.setScalar(k);
    if (d <= 0.5) this._smoke.points.visible = false;
  }

  setNameTag(text, color = '#ff5a1f') {
    if (this._nameSprite) {
      this.group.remove(this._nameSprite);
      this._nameSprite.material.map.dispose(); this._nameSprite.material.dispose();
      this._nameSprite = null;
    }
    if (!text) return;
    const t = nameTagTexture(String(text).slice(0, 18), color);
    const m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false });
    const sp = new THREE.Sprite(m);
    sp.scale.set(2.4, 0.6, 1);
    sp.position.set(0, this.dims.height + 0.75, 0);
    sp.renderOrder = 20;
    this.group.add(sp);
    this._nameSprite = sp;
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    this.setNameTag(null);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this._ownMats) { disposeGhosts(m); m.dispose(); liveReflective.delete(m); }
    for (const t of this._ownTex) t.dispose();
    this._meshes.length = 0;
  }

  // ───── interno ─────
  _makeSpots() {
    this._spots = [];
    const col = new THREE.Color(this.custom.lights);
    const hp = this._headPos.length ? this._headPos : [[0.6, 0.6, this.profile.zF], [-0.6, 0.6, this.profile.zF]];
    for (const p of [hp[0], hp[hp.length - 1]]) {
      const sl = new THREE.SpotLight(col, 0, 80, 0.55, 0.55, 1);
      sl.position.set(p[0], p[1], p[2]);
      sl.target.position.set(p[0] * 1.6, -0.6, p[2] - 18);
      this.body.add(sl, sl.target);
      this._spots.push(sl);
    }
  }
  _writePalette() {
    const head = this.lightsOn ? this.custom.lights : '#aab3bd';
    const tail = this._brake ? '#ff2020' : this.lightsOn ? '#b81616' : '#5c0d0d';
    const rev = this._rev ? '#ffffff' : '#5a5a5a';
    let red = '#5a1010', blue = '#10205a';
    if (this._siren) { const ph = Math.floor(this._t * 7) % 4; red = ph < 2 ? '#ff2020' : '#3a0808'; blue = ph < 2 ? '#0a1440' : '#2060ff'; }
    const key = head + tail + rev + red + blue;
    if (key === this._palKey) return;
    this._palKey = key;
    const d = this._palette.image.data;
    const put = (i, hex) => { const c = hexRGB(hex); d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; };
    put(PAL.head, head); put(PAL.tail, tail); put(PAL.rev, rev); put(PAL.red, red); put(PAL.blue, blue); put(PAL.amber, '#ffaa00'); put(PAL.white, '#ffffff');
    this._palette.needsUpdate = true;
  }
  _updateSmoke(dt, speed) {
    const S = this._smoke, pts = S.points;
    pts.visible = this._opacity >= 0.995;
    const pos = pts.geometry.attributes.position.array, col = pts.geometry.attributes.color.array;
    const dark = this.damage > 0.8 ? 0.25 : 0.55, rate = (this.damage - 0.5) * 2;
    for (let i = 0; i < S.n; i++) {
      S.life[i] -= dt / 1.6;
      if (S.life[i] <= 0) {
        if (Math.random() > rate * 0.5 + 0.1) { col[i * 4 + 3] = 0; continue; }
        S.life[i] = 0.6 + Math.random() * 0.4;
        pos[i * 3] = S.origin[0] + (Math.random() - 0.5) * 0.4; pos[i * 3 + 1] = S.origin[1]; pos[i * 3 + 2] = S.origin[2] + (Math.random() - 0.5) * 0.3;
        S.vel[i * 3] = (Math.random() - 0.5) * 0.3; S.vel[i * 3 + 1] = 0.6 + Math.random() * 0.5; S.vel[i * 3 + 2] = 0.5 + Math.abs(speed) * 0.4;
      }
      pos[i * 3] += S.vel[i * 3] * dt; pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt; pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
      const l = S.life[i];
      col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = dark; col[i * 4 + 3] = Math.max(0, l) * 0.6;
    }
    pts.geometry.attributes.position.needsUpdate = true; pts.geometry.attributes.color.needsUpdate = true;
  }
}
