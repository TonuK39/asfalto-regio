// Cámaras: cabina, cofre, persecución cerca/lejos, mirar atrás, retrovisor y órbita lenta para menús.
// El retrovisor se dibuja en un rectángulo arriba al centro (con marco) usando scissor; la imagen se
// renderiza a una textura pequeña (cada 2 cuadros) y se voltea como un espejo de verdad.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _size = new THREE.Vector2();
const Q_BACK = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
const Q_MIRROR_TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.05);

// Persecución: distancia, altura de la cámara, altura del punto que se mira, cuánto se mira adelante.
const CHASE = {
  2: { dist: 5.6, height: 1.75, look: 1.05, ahead: 3.0 },
  3: { dist: 8.8, height: 2.7, look: 1.15, ahead: 4.0 },
};
const NEAR = [0.05, 0.08, 0.25, 0.3];
const EYE_FALLBACK = new THREE.Vector3(-0.36, 1.12, 0.2);
const HOOD_FALLBACK = new THREE.Vector3(0, 1.0, -0.9);
const MIRROR_W = 0.28, MIRROR_H = 0.11, MIRROR_BORDER = 3;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const k = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class CameraRig {
  constructor(renderer, { fov = 70 } = {}) {
    this.renderer = renderer;
    this.baseFov = fov;
    this.camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.25, 4000);
    this.camera.position.set(0, 20, 40);
    this.mirrorCamera = new THREE.PerspectiveCamera(42, 4, 2.0, 700);
    this.mode = 2;
    this.mirror = false;
    this.target = null;
    this._W = 0; this._H = 0;
    this._snap = true;
    this._camYaw = 0; this._camPitch = 0;
    this._off = new THREE.Vector3();        // cámara − auto (persecución)
    this._lastCar = new THREE.Vector3();
    this._head = new THREE.Vector3();
    this._headYaw = 0;
    this._fov = fov;
    this._t = 0; this._kick = 0; this._frame = 0;
    this._orbitA = 0;
    this._roof = 1.45;
    this._rt = null; this._ov = null;
    if (renderer && renderer.getSize) { renderer.getSize(_size); this.resize(_size.x, _size.y); }
  }

  setFov(f) { this.baseFov = f; }

  setTarget(carEntity) {
    this.target = carEntity && carEntity.physics ? carEntity : null;
    this._snap = true;
    this._roof = 1.45;
    const m = this.target && this.target.model;
    const eye = m && m.cockpit && m.cockpit.eye;
    if (eye && eye.position) this._roof = Math.max(1.1, eye.position.y + 0.32);
  }

  cycle() { this.setMode((this.mode + 1) % 4); }

  setMode(i) {
    this.mode = (((i | 0) % 4) + 4) % 4;
    this._snap = true;
  }

  resize(w, h) {
    if (!(w > 0 && h > 0)) return;
    this._W = w; this._H = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Cámara libre que gira despacio alrededor de un punto (menús, vista previa de pista).
  orbit(center, radius = 40, height = 15, dt = 1 / 60) {
    this._orbitA += dt * 0.12;
    const cam = this.camera;
    cam.position.set(center.x + Math.cos(this._orbitA) * radius, center.y + height, center.z + Math.sin(this._orbitA) * radius);
    cam.lookAt(center);
    if (cam.fov !== this.baseFov || cam.near !== 0.25) { cam.fov = this.baseFov; cam.near = 0.25; cam.updateProjectionMatrix(); }
    this._fov = this.baseFov;
    this._snap = true;
  }

  update(dt, { lookBack = false } = {}) {
    if (!this.target) return;
    dt = clamp(dt || 0, 0, 0.1);
    this._t += dt;
    const ph = this.target.physics, model = this.target.model;
    const cam = this.camera;
    const pos = ph.position;
    const speed = Math.abs(ph.speed || 0);
    const vmax = ph.topSpeed > 10 ? ph.topSpeed : 80;
    if (this._lastCar.distanceToSquared(pos) > 900) this._snap = true;
    this._lastCar.copy(pos);
    const snap = this._snap;
    this._snap = false;

    _e.set(ph.pitch || 0, ph.yaw || 0, ph.roll || 0, 'YXZ');
    const qCar = _q1.setFromEuler(_e);

    // vibración: mucha velocidad, fuera de pista o golpe
    this._kick = Math.max(this._kick * Math.exp(-6 * dt), ph.wallHit || 0);
    const off = ph.surface && ph.surface !== 'asfalto' && ph.surface !== 'piano';
    let shake = Math.max(0, speed / vmax - 0.72) * 0.09 + (off ? Math.min(1, speed / 25) * 0.035 : 0) + this._kick * 0.12;
    const t = this._t;
    const sx = shake * (Math.sin(t * 41.3) * 0.6 + Math.sin(t * 23.7 + 1.3) * 0.4);
    const sy = shake * (Math.sin(t * 37.1 + 0.7) * 0.6 + Math.sin(t * 19.3 + 2.1) * 0.4);

    let fovT = this.baseFov;
    if (this.mode >= 2) {
      // --- persecución
      const P = CHASE[this.mode];
      const yaw = ph.yaw || 0;
      let desired = yaw;
      const vx = ph.velocity.x, vz = ph.velocity.z;
      if ((ph.speed || 0) > 3) {
        const velYaw = Math.atan2(-vx, -vz);
        desired = yaw + clamp(wrap(velYaw - yaw), -0.9, 0.9) * 0.65;   // sigue la dirección de movimiento
      }
      if (snap) { this._camYaw = desired; this._camPitch = ph.pitch || 0; }
      else {
        this._camYaw += wrap(desired - this._camYaw) * k(5, dt);
        this._camPitch += ((ph.pitch || 0) - this._camPitch) * k(3, dt);
      }
      const cy = this._camYaw + (lookBack ? Math.PI : 0);
      const dist = P.dist + speed * 0.012;
      const fx = -Math.sin(cy), fz = -Math.cos(cy);
      _v1.set(-fx * dist, P.height - dist * Math.sin(this._camPitch) * 0.7, -fz * dist);
      if (snap || lookBack !== this._lastLookBack) this._off.copy(_v1);
      else this._off.lerp(_v1, k(9, dt));
      this._lastLookBack = lookBack;
      cam.position.copy(pos).add(this._off);
      cam.position.x += sx * 0.5; cam.position.y += sy * 0.5;
      _v2.set(pos.x + fx * P.ahead, pos.y + P.look, pos.z + fz * P.ahead);
      cam.up.copy(UP);
      cam.lookAt(_v2);
      const r = clamp(speed / vmax, 0, 1);
      fovT = this.baseFov + 10 * Math.pow(r, 1.5) + (ph.nitroActive ? 3 : 0);
    } else {
      // --- cabina (0) o cofre (1)
      const node = this.mode === 0
        ? (model && model.cockpit && model.cockpit.eye)
        : (model && model.hood);
      if (node && node.getWorldPosition) {
        node.updateWorldMatrix(true, false);
        node.getWorldPosition(_v1);
        node.getWorldQuaternion(_q2);
      } else {
        _v1.copy(this.mode === 0 ? EYE_FALLBACK : HOOD_FALLBACK).applyQuaternion(qCar).add(pos);
        _q2.copy(qCar);
      }
      // cabeza: se mueve contra las fuerzas G y mira un poco hacia la curva
      const ax = ph.accelLong || 0, ay = ph.accelLat || 0;
      const hx = this.mode === 0 ? clamp(-ay * 0.006, -0.07, 0.07) : 0;
      const hz = this.mode === 0 ? clamp(ax * 0.005, -0.05, 0.05) : 0;
      const hy = this.mode === 0 ? clamp(-Math.abs(ax) * 0.001, -0.02, 0) : 0;
      _v3.set(hx, hy, hz);
      if (snap) this._head.copy(_v3); else this._head.lerp(_v3, k(6, dt));
      const lookYaw = -(ph.steerAngle || 0) * (this.mode === 0 ? 0.35 : 0.15);
      this._headYaw += (lookYaw - this._headYaw) * k(5, dt);
      _v3.copy(this._head).applyQuaternion(_q2);
      cam.position.copy(_v1).add(_v3);
      cam.position.x += sx * 0.15; cam.position.y += sy * 0.15;
      cam.quaternion.copy(_q2);
      cam.rotateY(this._headYaw + (lookBack ? Math.PI : 0));
      const r = clamp(speed / vmax, 0, 1);
      fovT = this.baseFov + 4 * r * r;
    }

    if (snap) this._fov = fovT; else this._fov += (fovT - this._fov) * k(3, dt);
    const near = NEAR[this.mode];
    if (Math.abs(cam.fov - this._fov) > 0.01 || cam.near !== near) {
      cam.fov = this._fov; cam.near = near; cam.updateProjectionMatrix();
    }

    // --- retrovisor: desde el techo, mirando hacia atrás
    if (this.mirror) {
      const mc = this.mirrorCamera;
      mc.position.set(0, this._roof, 0.4).applyQuaternion(qCar).add(pos);
      mc.quaternion.copy(qCar).multiply(Q_BACK).multiply(Q_MIRROR_TILT);
    }
  }

  _ensureMirror(W, H) {
    if (!this._ov) {
      const scene = new THREE.Scene();
      const camO = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({ color: 0x15171d, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
      const geo = new THREE.PlaneGeometry(2, 2);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));   // espejo: izquierda ↔ derecha
      const img = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, fog: false }));
      img.renderOrder = 1;
      scene.add(frame, img);
      this._ov = { scene, cam: camO, img };
    }
    const mw = Math.max(64, Math.round(W * MIRROR_W)), mh = Math.max(24, Math.round(H * MIRROR_H));
    if (mw !== this._mw || mh !== this._mh) {
      this._mw = mw; this._mh = mh;
      const pr = Math.min(this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : 1, 1);
      const rw = Math.min(640, Math.round(mw * pr)), rh = Math.min(220, Math.round(mh * pr));
      if (this._rt) this._rt.setSize(rw, rh);
      else {
        this._rt = new THREE.WebGLRenderTarget(rw, rh, { depthBuffer: true });
        this._ov.img.material.map = this._rt.texture;
        this._ov.img.material.needsUpdate = true;
      }
      this.mirrorCamera.aspect = mw / mh;
      this.mirrorCamera.updateProjectionMatrix();
      const b = MIRROR_BORDER;
      this._ov.img.scale.set(mw / (mw + 2 * b), mh / (mh + 2 * b), 1);
      this._mirrorFresh = true;
    }
  }

  render(renderer, scene) {
    renderer = renderer || this.renderer;
    renderer.getSize(_size);
    const W = _size.x, H = _size.y;
    if (W !== this._W || H !== this._H) this.resize(W, H);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.render(scene, this.camera);
    if (!this.mirror || !this.target) return;

    this._ensureMirror(W, H);
    this._frame++;
    if (this._mirrorFresh || (this._frame & 1) === 0) {
      this._mirrorFresh = false;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(this._rt);
      renderer.clear();
      renderer.render(scene, this.mirrorCamera);
      renderer.setRenderTarget(prev);
    }
    const b = MIRROR_BORDER, mw = this._mw, mh = this._mh;
    const x = Math.round((W - mw) / 2) - b, y = Math.round(H - mh - H * 0.018) - b;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, mw + 2 * b, mh + 2 * b);
    renderer.setViewport(x, y, mw + 2 * b, mh + 2 * b);
    renderer.clearDepth();
    renderer.render(this._ov.scene, this._ov.cam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.autoClear = ac;
  }

  dispose() {
    if (this._rt) this._rt.dispose();
    if (this._ov) this._ov.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this._rt = null; this._ov = null;
  }
}
