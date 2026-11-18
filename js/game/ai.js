// Pilotos de la computadora.
// 'normal': competente pero vencible (~90–93 % de la velocidad ideal de la trazada), rebasa por un lado,
//           evita muros y se desatasca solo. 'trafico': autos civiles tranquilos en su carril (Callejero).
// Persecución pura (pure pursuit) para la dirección y velocidad objetivo por curvatura con frenado anticipado.
import { rng, clamp, wrapAngle } from '../core/util.js';

const G = 9.81;
const SCAN_EVERY = 0.05;     // s entre análisis de la pista adelante

export class AIDriver {
  constructor(track, physics, { skill = 'normal', seed = 1, lateralOffset = 0, maxSpeed, direction = 1 } = {}) {
    this.track = track;
    this.physics = physics;
    this.skill = skill === 'trafico' ? 'trafico' : 'normal';
    this.traffic = this.skill === 'trafico';
    const r = rng(seed == null ? 1 : seed);
    this._r = r;
    this.pace = this.traffic ? 0.8 : 0.905 + r() * 0.025;        // fracción de la velocidad ideal
    this.lateralOffset = lateralOffset || 0;
    this.maxSpeed = maxSpeed != null ? maxSpeed : (this.traffic ? 14 : Infinity);
    this.direction = direction < 0 ? -1 : 1;                       // -1: tráfico en sentido contrario
    this.lineBias = this.traffic ? 0 : 0.25 + r() * 0.2;           // cuánto se cierra a la cuerda
    this.nitroWill = r();
    this.needsReset = false;
    if (physics) physics.gearbox = 'auto';
    this._out = {
      throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, lookBack: false, horn: false,
      shiftUp: false, shiftDown: false, camera: false, reset: false, pause: false, mirror: false,
    };
    this.reset();
  }

  reset() {
    this.needsReset = false;
    this._scanT = 0; this._vT = 10; this._curvAhead = 0;
    this._stuckT = 0; this._revT = 0; this._wrongT = 0; this._stuckCount = 0; this._stuckWin = 0;
    this._passT = 0; this._passLat = 0; this._steer = 0;
    this._lastDist = null; this._noProgT = 0; this._useNitro = false;
    this._lx = null; this._lz = null;
  }

  // Pide al núcleo que regrese el auto a la pista y limpia los contadores (el núcleo solo apaga needsReset).
  _trip() {
    this.needsReset = true;
    this._wrongT = 0; this._noProgT = 0; this._stuckT = 0; this._stuckCount = 0; this._revT = 0;
  }

  _wrapD(d) {
    const L = this.track.length || 1;
    if (this.track.closed) return ((d % L) + L) % L;
    return clamp(d, 0, L);
  }

  // Velocidad máxima en una curva de curvatura k (1/m), con el agarre y el downforce del auto.
  _curveSpeed(kAbs, mu) {
    if (kAbs < 1e-4) return 200;
    const sp = this.physics.spec;
    const kd = (sp.downforce || 0) * 1.6 / sp.massKg;     // igual que DOWNFORCE_K en physics.js
    const den = kAbs - mu * kd;
    if (den <= 1e-5) return 200;
    return Math.min(200, Math.sqrt(mu * G / den));
  }

  _scan(d, u, mu) {
    const sp = this.physics.spec;
    const dir = this.direction;
    const aBrake = Math.min(sp.brakeG || 1, mu) * G * (this.traffic ? 0.35 : 0.72);
    const horizon = Math.min(320, (u * u) / (2 * aBrake) + 30);
    let vAllow = 200, curvA = 0;
    const margin = u * 0.12;
    for (let s = 0; s <= horizon; s += s < 40 ? 5 : 10) {
      const smp = this.track.sampleAt(this._wrapD(d + s * dir));
      if (!smp) continue;
      const kAbs = Math.abs(smp.curvature || 0);
      const vC = this._curveSpeed(kAbs, mu) * this.pace;
      const v = Math.sqrt(vC * vC + 2 * aBrake * Math.max(0, s - margin));
      if (v < vAllow) vAllow = v;
      if (s >= 10 && s <= 10 + u * 1.2 && Math.abs(smp.curvature || 0) > Math.abs(curvA)) curvA = (smp.curvature || 0) * dir;
    }
    this._vT = vAllow;
    this._curvAhead = curvA;
    // sin pista abierta más allá: frenar al final
    if (!this.track.closed && dir > 0) {
      const left = this.track.length - d;
      if (left < 200) this._vT = Math.min(this._vT, Math.sqrt(Math.max(0, 2 * aBrake * Math.max(0, left - 20))));
    }
  }

  controls(dt, surface, others = []) {
    const out = this._out;
    const ph = this.physics, sp = ph.spec;
    dt = clamp(dt || 0, 0, 0.1);
    out.handbrake = false; out.nitro = false; out.horn = false;
    if (!surface || !this.track) { out.throttle = 0; out.brake = 1; out.steer = 0; return out; }

    const dir = this.direction;
    const d = surface.distance || 0;
    const u = ph.speed || 0;
    const yaw = ph.yaw || 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const px = ph.position.x, pz = ph.position.z;
    // si el núcleo lo teletransportó (regreso a la pista), empezar de cero
    if (this._lx != null && (px - this._lx) ** 2 + (pz - this._lz) ** 2 > 400) { const nr = this.needsReset; this.reset(); this.needsReset = nr; }
    this._lx = px; this._lz = pz;
    const hw = surface.halfWidth || 6;
    const mu = Math.max(0.2, (sp.tireGrip || 1) * (surface.grip ?? 1) * (ph.envGrip ?? 1));

    // --- progreso, sentido contrario y atascos
    const tg = surface.tangent;
    const along = tg ? (fx * tg.x + fz * tg.z) * dir : 1;
    if (along < -0.3 && Math.abs(u) > 1) this._wrongT += dt; else this._wrongT = Math.max(0, this._wrongT - dt * 2);
    if (this._wrongT > 4) this._trip();
    if (this._lastDist != null) {
      let dd = (d - this._lastDist) * dir;
      if (this.track.closed && Math.abs(dd) > this.track.length / 2) dd -= Math.sign(dd) * this.track.length;
      // solo cuenta si la física de verdad está acelerando (en la parrilla el núcleo la reinicia cada cuadro)
      if (dd > 0.02 * dt * 60 || (ph.throttle || 0) < 0.3) this._noProgT = Math.max(0, this._noProgT - dt * 3);
      else this._noProgT += dt;
      if (this._noProgT > 10) this._trip();
    }
    this._lastDist = d;
    this._stuckWin = Math.max(0, this._stuckWin - dt);
    if (this._stuckWin <= 0) this._stuckCount = 0;

    // --- análisis de la pista adelante
    this._scanT -= dt;
    if (this._scanT <= 0) { this._scanT = SCAN_EVERY; this._scan(d, Math.max(u, 0), mu); }
    let vT = Math.min(this._vT, this.maxSpeed);

    // --- carril objetivo
    const lim = Math.max(0.5, hw - 1.6);
    let latT = clamp(this.lateralOffset, -lim, lim);
    if (!this.traffic) {
      const ca = this._curvAhead;
      latT += Math.sign(ca) * Math.min(1, Math.abs(ca) * 35) * hw * this.lineBias;
    }

    // --- otros autos: rebasar o seguir
    let blocked = null, blockF = Infinity;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (!o || !o.position || o.position === ph.position) continue;
      const dx = o.position.x - px, dz = o.position.z - pz;
      const f = dx * fx + dz * fz, sd = dx * rx + dz * rz;
      // anticipación según velocidad: a 150 km/h mira ~40 m adelante
      if (f <= 0.5 || f > (this.traffic ? 18 : 10 + Math.max(u, 0) * 0.75) || Math.abs(sd) > 2.3) continue;
      if ((o.speed || 0) > u - 0.3 && !this.traffic) continue;
      if (f < blockF) { blockF = f; blocked = { f, sd, speed: o.speed || 0 }; }
    }
    if (blocked) {
      if (this.traffic) {
        vT = Math.min(vT, blocked.f < 7 ? 0 : Math.max(0, blocked.speed * 0.9));
      } else {
        const curLat = surface.lateral || 0;
        if (this._passT <= 0) {
          const oLat = curLat + blocked.sd;
          let side = oLat > 0 ? -1 : 1;
          let cand = oLat + side * 3.2;
          if (Math.abs(cand) > lim + 0.3) { side = -side; cand = oLat + side * 3.2; }
          if (Math.abs(cand) <= lim + 0.3) { this._passLat = cand; this._passT = 1.8; }
        }
        // sin carril para rebasar: lo sigue; con carril elegido y muy pegado: avanza despacio mientras se abre
        if (this._passT <= 0) vT = Math.min(vT, Math.max(0, blocked.speed - 0.5));
        else if (blocked.f < 7 && Math.abs(blocked.sd) < 1.9) vT = Math.min(vT, Math.max(3, blocked.speed - 0.5));
      }
    }
    if (this._passT > 0) { this._passT -= dt; latT = clamp(this._passLat, -lim - 0.3, lim + 0.3); }
    // lejos de los muros
    const lw = surface.leftWall, rw = surface.rightWall;
    if (isFinite(rw)) latT = Math.min(latT, rw - 2.0);
    if (isFinite(lw)) latT = Math.max(latT, -lw + 2.0);

    // --- dirección (pure pursuit)
    const Ld = clamp(7 + Math.max(u, 0) * 0.42, 8, 40);
    const smp = this.track.sampleAt(this._wrapD(d + Ld * dir));
    let steer = 0;
    if (smp) {
      const sgnLat = dir;
      const tx = smp.pos.x + smp.right.x * latT * sgnLat, tz = smp.pos.z + smp.right.z * latT * sgnLat;
      const dx = tx - px, dz = tz - pz;
      const f = dx * fx + dz * fz, side = dx * rx + dz * rz;
      const ld2 = Math.max(4, dx * dx + dz * dz);
      let delta = Math.atan(2 * side * (sp.wheelbase || 2.6) / ld2);
      if (f < 0) delta = Math.sign(side || 1) * 1;
      steer = delta / Math.max(0.05, ph.steerLimit || 0.5);
      // contravolante si se cruza
      if (Math.abs(ph.slipAngle || 0) > 0.12) steer += (ph.slipAngle || 0) * 1.2;
    }
    steer = clamp(steer, -1, 1);
    this._steer += (steer - this._steer) * (1 - Math.exp(-(this.traffic ? 6 : 14) * dt));

    // --- desatascarse: reversa 1 s
    if (this._revT > 0) {
      this._revT -= dt;
      out.throttle = 0; out.brake = 1; out.steer = -this._steer; out.nitro = false;
      return out;
    }

    // --- acelerador y freno
    const err = vT - u;
    let thr, brk;
    if (err > 3) { thr = 1; brk = 0; }
    else if (err > 0) { thr = 0.35 + err * 0.22; brk = 0; }
    else if (err > -1.5) { thr = Math.max(0, 0.25 + err * 0.15); brk = 0; }
    else { thr = 0; brk = clamp(-err * 0.16, 0.15, 1); }
    if (this.traffic) thr = Math.min(thr, 0.55);
    if ((ph.wheelSpin || 0) > 0.3) thr *= 0.6;
    if (Math.abs(ph.slipAngle || 0) > 0.22) thr *= 0.5;
    if (vT < 2 && u < 1) { thr = 0; brk = Math.max(brk, 0.4); }

    // nitro en rectas
    if (!this.traffic && ph.spec.nitroCapacity > 0 && this.nitroWill > 0.25) {
      if (!this._useNitro && ph.nitro > 0.5 && err > 8 && Math.abs(this._curvAhead) < 0.004 && u > 15) this._useNitro = true;
      if (this._useNitro && (ph.nitro < 0.08 || err < 2 || Math.abs(this._curvAhead) > 0.006)) this._useNitro = false;
    } else this._useNitro = false;

    // atasco: acelerando y casi detenido 2 s
    if (thr > 0.5 && (ph.throttle || 0) > 0.5 && Math.abs(u) < 1) this._stuckT += dt; else this._stuckT = Math.max(0, this._stuckT - dt * 2);
    if (this._stuckT > 2) {
      this._stuckT = 0; this._revT = 1.3;        // 0.3 s para que la caja meta reversa + 1 s de reversa
      this._stuckCount++; this._stuckWin = 15;
      if (this._stuckCount >= 3) this._trip();
    }

    out.throttle = clamp(thr, 0, 1);
    out.brake = clamp(brk, 0, 1);
    out.steer = this._steer;
    out.nitro = this._useNitro;
    return out;
  }
}
