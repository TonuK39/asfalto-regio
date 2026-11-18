// Efectos de llantas y choques: humo (color personalizado), polvo en tierra/nieve, chispas y marcas de
// derrape. Todo en pools fijos: no se crean objetos por cuadro.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const LOOSE = { tierra: '#9a7b55', grava: '#a59a8a', arena: '#d9c08c', nieve: '#f2f6ff', pasto: '#8f9c66', hielo: '#e8f0ff' };
const MARK = {
  asfalto: [0.03, 0.03, 0.03, 0.6], piano: [0.05, 0.05, 0.05, 0.5], tierra: [0.26, 0.19, 0.12, 0.45], grava: [0.3, 0.28, 0.25, 0.4],
  arena: [0.5, 0.42, 0.3, 0.35], nieve: [0.5, 0.56, 0.64, 0.5], hielo: [0.6, 0.66, 0.74, 0.3], pasto: [0.16, 0.22, 0.08, 0.45],
};
function hexF(hex, out) { const n = parseInt(String(hex || '#ffffff').slice(1), 16) || 0; out[0] = ((n >> 16) & 255) / 255; out[1] = ((n >> 8) & 255) / 255; out[2] = (n & 255) / 255; return out; }

const VERT = `
attribute vec3 iPos; attribute float iSize; attribute vec4 iColor; attribute float iRot; attribute vec3 iVel;
uniform float uStreak;
varying vec4 vColor; varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = position.xy + 0.5;
  vColor = iColor;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy;
  if (uStreak > 0.5) {
    vec2 d = (modelViewMatrix * vec4(iVel, 0.0)).xy;
    float l = length(d);
    vec2 dir = l > 1e-4 ? d / l : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    mvPosition.xy += dir * c.x * (iSize + l * 0.035) + nrm * c.y * iSize * 0.3;
  } else {
    float cs = cos(iRot), sn = sin(iRot);
    mvPosition.xy += vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y) * iSize;
  }
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = `
uniform float uSoft;
varying vec4 vColor; varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = uSoft > 0.5 ? (1.0 - smoothstep(0.15, 1.0, d)) : (1.0 - smoothstep(0.5, 1.0, d));
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  if (gl_FragColor.a < 0.004) discard;
  #include <fog_fragment>
}`;

// Partículas como cuadros instanciados que miran a la cámara (una llamada de dibujo por pool).
class Pool {
  constructor(scene, max, { additive = false, streak = false } = {}) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.dur = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c = new Float32Array(max * 4); this.rot = new Float32Array(max); this.rs = new Float32Array(max);
    this.g = new Float32Array(max); this.drag = new Float32Array(max); this.fadeIn = new Float32Array(max);
    const geo = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    geo.index = q.index; geo.setAttribute('position', q.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iSize', this.aSize); geo.setAttribute('iColor', this.aCol);
    geo.setAttribute('iRot', this.aRot); geo.setAttribute('iVel', this.aVel);
    geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uStreak: { value: streak ? 1 : 0 }, uSoft: { value: streak ? 0 : 1 } }]),
      vertexShader: VERT, fragmentShader: FRAG, fog: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 3 : 2;
    scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, dur, s0, s1, r, g, b, a, grav, drag, fadeIn = 0.1) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); else this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = 0; this.dur[i] = dur; this.s0[i] = s0; this.s1[i] = s1;
    this.c[i * 4] = r; this.c[i * 4 + 1] = g; this.c[i * 4 + 2] = b; this.c[i * 4 + 3] = a;
    this.rot[i] = Math.random() * 6.28; this.rs[i] = (Math.random() - 0.5) * 1.2;
    this.g[i] = grav; this.drag[i] = drag; this.fadeIn[i] = fadeIn;
  }
  step(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.dur[i]) { n--; this.copy(n, i); i--; continue; }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k + this.g[i] * dt; this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.rot[i] += this.rs[i] * dt;
    }
    this.n = n;
    const P = this.aPos.array, S = this.aSize.array, C = this.aCol.array, R = this.aRot.array, V = this.aVel.array;
    for (let i = 0; i < n; i++) {
      const t = this.life[i] / this.dur[i];
      P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
      V[i * 3] = this.v[i * 3]; V[i * 3 + 1] = this.v[i * 3 + 1]; V[i * 3 + 2] = this.v[i * 3 + 2];
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      C[i * 4] = this.c[i * 4]; C[i * 4 + 1] = this.c[i * 4 + 1]; C[i * 4 + 2] = this.c[i * 4 + 2];
      C[i * 4 + 3] = this.c[i * 4 + 3] * Math.pow(1 - t, 1.3) * Math.min(1, t / Math.max(0.001, this.fadeIn[i]));
      R[i] = this.rot[i];
    }
    for (const a of [this.aPos, this.aSize, this.aCol, this.aRot, this.aVel]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
    this.mesh.geometry.instanceCount = n;
  }
  copy(from, to) {
    if (from === to) return;
    for (let k = 0; k < 3; k++) { this.p[to * 3 + k] = this.p[from * 3 + k]; this.v[to * 3 + k] = this.v[from * 3 + k]; }
    for (let k = 0; k < 4; k++) this.c[to * 4 + k] = this.c[from * 4 + k];
    this.life[to] = this.life[from]; this.dur[to] = this.dur[from]; this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from];
    this.rot[to] = this.rot[from]; this.rs[to] = this.rs[from]; this.g[to] = this.g[from]; this.drag[to] = this.drag[from]; this.fadeIn[to] = this.fadeIn[from];
  }
  clear() { this.n = 0; this.mesh.geometry.instanceCount = 0; }
  dispose() { this.mesh.parent && this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// Búfer circular de cuadros sobre el piso.
class Skids {
  constructor(scene, max) {
    this.max = max; this.head = 0; this.lo = Infinity; this.hi = -1;
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 12), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(max * 16), 4).setUsage(THREE.DynamicDrawUsage);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) { const v = i * 4; idx.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6); }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setAttribute('position', this.pos); geo.setAttribute('color', this.col);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  add(a, b, c, d, rgba, a0, a1) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    const P = this.pos.array, C = this.col.array, o = i * 12;
    P.set([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], o);
    for (let k = 0; k < 4; k++) { const q = i * 16 + k * 4; C[q] = rgba[0]; C[q + 1] = rgba[1]; C[q + 2] = rgba[2]; C[q + 3] = rgba[3] * (k < 2 ? a0 : a1); }
    this.lo = Math.min(this.lo, i); this.hi = Math.max(this.hi, i);
  }
  flush() {
    if (this.hi < 0) return;
    for (const [a, per] of [[this.pos, 12], [this.col, 16]]) { a.clearUpdateRanges(); a.addUpdateRange(this.lo * per, (this.hi - this.lo + 1) * per); a.needsUpdate = true; }
    this.lo = Infinity; this.hi = -1;
  }
  clear() { this.pos.array.fill(0); this.col.array.fill(0); this.lo = 0; this.hi = this.max - 1; this.flush(); this.head = 0; }
  dispose() { this.mesh.parent && this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

const _c = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3(), _l = new THREE.Vector3(), _rr = new THREE.Vector3();
const _col = [1, 1, 1], _mk = [0, 0, 0, 0];

export class Effects {
  constructor(scene, { quality = 'lowpoly' } = {}) {
    this.scene = scene;
    const semi = quality === 'semi';
    this.semi = semi;
    this.smoke = new Pool(scene, semi ? 480 : 260);
    this.sparkPool = new Pool(scene, semi ? 320 : 180, { additive: true, streak: true });
    this.skids = new Skids(scene, semi ? 1800 : 900);
    this.per = new WeakMap();
  }

  // Humo, marcas y polvo de un auto. Llamar después de colocar model.group en su posición del cuadro.
  updateCar(model, state, dt, smokeColor = '#ffffff') {
    if (!model || !state || !model.wheels || dt <= 0) return;
    const g = model.group;
    if (!g.visible) return;
    g.updateMatrixWorld();
    let rec = this.per.get(model);
    if (!rec) { rec = { last: model.wheels.map(() => ({ ok: false, l: new THREE.Vector3(), r: new THREE.Vector3() })), acc: new Float32Array(model.wheels.length), dust: new Float32Array(model.wheels.length), scrape: 0 }; this.per.set(model, rec); }
    const e = g.matrixWorld.elements;
    _r.set(e[0], e[1], e[2]).normalize(); _f.set(-e[8], -e[9], -e[10]).normalize();
    const speed = Math.abs(state.speed || 0), vel = state.velocity;
    const surf = state.surface || 'asfalto', loose = LOOSE[surf];
    const slip = Math.abs(state.slipAngle || 0);
    const drift = state.drifting ? clamp((slip - 0.1) * 3, 0.35, 1) : 0;
    const spin = state.wheelSpin || 0;
    const grounded = state.onGround !== false;
    hexF(smokeColor, _col);
    const mk = MARK[surf] || MARK.asfalto;
    const rate = this.semi ? 46 : 26;
    for (let i = 0; i < model.wheels.length; i++) {
      const w = model.wheels[i], L = rec.last[i];
      let inten = w.front ? (w.driven && spin > 0.3 ? spin * 0.8 : drift * 0.3) : Math.max(drift, w.driven ? spin * 0.9 : 0);
      if (!grounded) inten = 0;
      w.contactPos(_c);
      const markOn = grounded && ((inten > 0.25 && speed > 0.8) || (loose && speed > 3 && surf !== 'pasto'));
      if (markOn) {
        const hw = (w.width || 0.22) * 0.5;
        _l.copy(_c).addScaledVector(_r, -hw); _rr.copy(_c).addScaledVector(_r, hw);
        _l.y += 0.012; _rr.y += 0.012;
        if (!L.ok) { L.l.copy(_l); L.r.copy(_rr); L.ok = true; }
        else if (L.l.distanceToSquared(_l) > 0.09) {
          if (L.l.distanceToSquared(_l) < 9) {
            _mk[0] = mk[0]; _mk[1] = mk[1]; _mk[2] = mk[2]; _mk[3] = mk[3] * (loose && inten < 0.25 ? 0.5 : clamp(inten + 0.3, 0.4, 1));
            this.skids.add(L.l, L.r, _rr, _l, _mk, 1, 1);
          }
          L.l.copy(_l); L.r.copy(_rr);
        }
      } else L.ok = false;
      // humo de llanta
      if (!loose && inten > 0.2 && (speed > 0.6 || spin > 0.3)) {
        rec.acc[i] += inten * rate * dt;
        while (rec.acc[i] >= 1) {
          rec.acc[i] -= 1;
          const vx = (vel ? vel.x * 0.25 : 0) + (Math.random() - 0.5) * 1.2, vz = (vel ? vel.z * 0.25 : 0) + (Math.random() - 0.5) * 1.2;
          this.smoke.emit(_c.x + (Math.random() - 0.5) * 0.3, _c.y + 0.2, _c.z + (Math.random() - 0.5) * 0.3, vx, 0.6 + Math.random() * 0.6, vz,
            1.6 + Math.random() * 1.1, 0.5, 2.6 + Math.random() * 1.2, _col[0], _col[1], _col[2], 0.42 + inten * 0.2, 0.35, 1.3, 0.12);
        }
      }
      // polvo o nieve
      if (loose && grounded && speed > 4 && !w.front) {
        rec.dust[i] += clamp(speed / 22, 0, 1.4) * (this.semi ? 30 : 17) * dt * (0.6 + inten);
        hexF(loose, _col);
        while (rec.dust[i] >= 1) {
          rec.dust[i] -= 1;
          this.smoke.emit(_c.x + (Math.random() - 0.5) * 0.4, _c.y + 0.15, _c.z + (Math.random() - 0.5) * 0.4,
            (vel ? vel.x * 0.15 : 0) + (Math.random() - 0.5) * 2 - _f.x * 1.5, 0.5 + Math.random() * 1.2, (vel ? vel.z * 0.15 : 0) + (Math.random() - 0.5) * 2 - _f.z * 1.5,
            0.9 + Math.random() * 0.8, 0.4, 1.9, _col[0], _col[1], _col[2], surf === 'nieve' ? 0.55 : 0.45, -0.4, 1.8, 0.05);
        }
        hexF(smokeColor, _col);
      }
    }
    // chispas de raspón contra el muro (los golpes fuertes los manda el núcleo con sparks())
    const hit = state.wallHit || 0;
    if (hit > 0.03 && hit <= 0.2 && vel) {
      rec.scrape += (6 + hit * 60) * dt * (this.semi ? 2 : 1.2);
      const side = vel.x * _r.x + vel.z * _r.z >= 0 ? 1 : -1;
      const W = (model.dims && model.dims.width) || 1.8, Ln = (model.dims && model.dims.length) || 4.4;
      while (rec.scrape >= 1) {
        rec.scrape -= 1;
        _c.setFromMatrixPosition(g.matrixWorld).addScaledVector(_r, side * W * 0.5).addScaledVector(_f, (Math.random() - 0.3) * Ln * 0.5);
        _c.y += 0.3;
        _l.copy(_r).multiplyScalar(-side);
        this._spark(_c, _l, vel, 0.4);
      }
    }
  }

  sparks(pos, normal, intensity = 0.5) {
    if (!pos) return;
    const n = Math.round(clamp(6 + 34 * intensity, 4, this.semi ? 40 : 24));
    _l.copy(normal && normal.isVector3 ? normal : _l.set(0, 1, 0));
    for (let i = 0; i < n; i++) this._spark(pos, _l, null, intensity);
  }
  _spark(pos, nrm, vel, k) {
    const sp = 2 + Math.random() * (3 + 5 * k);
    const vx = nrm.x * sp + (Math.random() - 0.5) * 4 + (vel ? vel.x * 0.6 : 0);
    const vy = Math.abs(nrm.y) * sp + 1 + Math.random() * 3;
    const vz = nrm.z * sp + (Math.random() - 0.5) * 4 + (vel ? vel.z * 0.6 : 0);
    const hot = Math.random();
    this.sparkPool.emit(pos.x, pos.y, pos.z, vx, vy, vz, 0.25 + Math.random() * 0.45, 0.05, 0.03, 1, 0.75 + hot * 0.25, 0.35 + hot * 0.35, 1, -9.8, 0.6, 0.001);
  }

  update(dt) {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    this.smoke.step(dt);
    this.sparkPool.step(dt);
    this.skids.flush();
  }
  clear() { this.smoke.clear(); this.sparkPool.clear(); this.skids.clear(); this.per = new WeakMap(); }
  dispose() { this.smoke.dispose(); this.sparkPool.dispose(); this.skids.dispose(); this.per = new WeakMap(); }
}
