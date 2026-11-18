// Física del auto, «intermedia entre arcade y simulación».
// Modelo de bicicleta (un eje delantero y uno trasero) sobre un cuerpo plano (x, z, yaw):
//  - llantas con curva que satura (Pacejka simplificada) y círculo de fricción por eje,
//  - transferencia de peso longitudinal, downforce que crece con la velocidad²,
//  - motor con curva de par/potencia, corte de inyección, caja automática o manual, reversa,
//  - asistencias suaves: autocontravolante (caster) y amortiguación del giro cuando el auto se cruza,
//  - muros de la pista (Surface), altura y pendiente del piso, nitro, rebufo y slowTo().
// Paso fijo interno de 1/120 s con acumulador; la posición pública se extrapola el resto del paso
// para que el movimiento se vea fluido a cualquier tasa de cuadros. Solo depende de THREE.Vector3.
import * as THREE from 'three';

const G = 9.81;
const STEP = 1 / 120;
const MAX_SUBSTEPS = 30;
const AIR = 0.62;            // ½·densidad del aire (kg/m³): arrastre = AIR·dragCoef·v²
const DRIVE_EFF = 0.85;      // eficiencia de la transmisión
const CRR = 0.013;           // resistencia a la rodadura
const DOWNFORCE_K = 1.6;     // N por (m/s)² por unidad de downforce
const U_MIN = 5.5;           // piso del denominador del ángulo de deslizamiento (estable a baja velocidad)
const RPM2RAD = Math.PI / 30;
const SURF_DRAG_K = 0.42;   // surface.drag 1 ≈ 0.42 g de frenado a velocidad (grava 1.2, pasto 0.6, tierra 0.15)
const NITRO_REFILL = 0.02;   // fracción por segundo (recarga lenta, ~50 s)
const ENGINE_BRAKE = 0.16;   // fracción del par máximo como freno de motor
// Curvas de llanta sin(C·atan(B·α)): pico ~8–9°, pierden 15–25 % al deslizar de lado.
const TIRE_F = { B: 14.5, C: 1.35 };
const TIRE_R = { B: 15.5, C: 1.4 };
const REAR_GRIP = 1.06;       // un poco más de agarre atrás: estable al soltar el acelerador
const REVERSE_MAX = 11;      // m/s (~40 km/h) en reversa

export const DEFAULT_SPEC = {
  massKg: 1200, powerKw: 100, torqueNm: 180, redlineRpm: 6500, idleRpm: 850,
  gears: [3.5, 2.1, 1.45, 1.1, 0.87], reverseRatio: 3.3, finalDrive: 4.1, drivetrain: 'FWD',
  tireGrip: 1, brakeG: 1, downforce: 0, dragCoef: 0.75, steerLockDeg: 34, wheelbase: 2.6,
  trackWidth: 1.55, cgHeight: 0.5, weightFront: 0.56, wheelRadius: 0.31,
  nitroCapacity: 0, nitroBoost: 1.3, shiftTime: 0.25,
};

const NO_CONTROLS = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothK = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// Forma de la curva de par (1 = par máximo) según la fracción de rpm.
function torqueShape(r, rIdle) {
  if (r < 0.5) {
    const t = clamp((r - rIdle * 0.8) / (0.5 - rIdle * 0.8), 0, 1);
    return 0.66 + 0.34 * t * t * (3 - 2 * t);
  }
  const t = (r - 0.5) / 0.5;
  return 1 - 0.1 * t * t;
}

// Reparte la fuerza longitudinal y lateral de un eje en su círculo de fricción.
// Prioridad longitudinal: acelerar o frenar fuerte quita agarre lateral (subviraje en FWD, sobreviraje en RWD).
const AX = { fx: 0, fy: 0, spin: 0 };
function combine(fx0, fy0, muN, abs) {
  if (muN <= 1e-3) { AX.fx = 0; AX.fy = 0; AX.spin = fx0 !== 0 ? 1 : 0; return AX; }
  let k = Math.abs(fx0) / muN;
  if (abs && k > 0.92) { fx0 *= 0.92 / k; k = 0.92; }   // ABS: no bloquea
  let cap;
  if (k <= 1) { AX.fx = fx0; cap = muN * Math.sqrt(1 - 0.75 * k * k); AX.spin = 0; }
  else {
    const s = Math.min(1, (k - 1) * 1.5);                 // patina: la llanta pierde agarre lateral
    AX.fx = Math.sign(fx0) * muN * (1 - 0.12 * s);
    cap = muN * 0.5 * (1 - 0.3 * s);
    AX.spin = s;
  }
  AX.fy = fy0 > cap ? cap : fy0 < -cap ? -cap : fy0;
  return AX;
}

export class VehiclePhysics {
  constructor(spec) {
    // --- estado público
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.speed = 0; this.rpm = 900; this.gear = 1;
    this.steerAngle = 0; this.throttle = 0; this.brake = 0; this.handbrake = false;
    this.slipAngle = 0; this.drifting = false; this.wheelSpin = 0; this.onGround = true;
    this.nitroActive = false; this.nitro = 1; this.wallHit = 0; this.wallContact = false; this.surface = 'asfalto';
    this.slipstream = 0;
    this.gearbox = 'auto';
    this.shifting = false;
    this.yawRate = 0;          // rad/s, + = girando a la derecha
    this.accelLong = 0;        // m/s² en el cuerpo (+ = acelerando)
    this.accelLat = 0;         // m/s² en el cuerpo (+ = hacia la derecha)
    this.steerLimit = 0.6;     // ángulo máximo de ruedas a la velocidad actual (rad)
    this.envGrip = 1;
    this.topSpeed = 50;        // m/s estimada (potencia contra arrastre y última marcha)
    // --- estado interno
    this._px = 0; this._py = 0; this._pz = 0; this._vx = 0; this._vy = 0; this._vz = 0;
    this._yaw = 0; this._om = 0; this._delta = 0;
    this._acc = 0; this._qx = 0; this._qz = 0;
    this._axF = 0; this._ayF = 0; this._bp = 0; this._br = 0;
    this._shiftT = 0; this._shiftCd = 0; this._revHold = 0; this._cut = false;
    this._spinVis = 0; this._cap = null; this._gp = 0; this._gr = 0;
    this._pub = [NaN, NaN, NaN, NaN, NaN, NaN, NaN];
    this.setSpec(spec || {});
    this.reset(new THREE.Vector3(), 0);
  }

  setSpec(spec) {
    const s = { ...DEFAULT_SPEC };
    for (const k in spec) if (spec[k] != null) s[k] = spec[k];
    s.massKg = Math.max(300, num(s.massKg, 1200));
    s.powerKw = Math.max(10, num(s.powerKw, 100));
    s.redlineRpm = Math.max(2000, num(s.redlineRpm, 6500));
    s.idleRpm = clamp(num(s.idleRpm, 850), 400, s.redlineRpm * 0.4);
    s.gears = Array.isArray(s.gears) && s.gears.length ? s.gears.map(g => Math.max(0.3, num(g, 1))) : DEFAULT_SPEC.gears.slice();
    s.reverseRatio = Math.abs(num(s.reverseRatio, 3.3)) || 3.3;
    s.finalDrive = Math.max(1, num(s.finalDrive, 4));
    s.wheelRadius = clamp(num(s.wheelRadius, 0.31), 0.2, 0.6);
    s.wheelbase = clamp(num(s.wheelbase, 2.6), 1.8, 4);
    s.trackWidth = clamp(num(s.trackWidth, 1.55), 1.1, 2.2);
    s.weightFront = clamp(num(s.weightFront, 0.55), 0.3, 0.7);
    s.cgHeight = clamp(num(s.cgHeight, 0.5), 0.2, 1.0);
    s.tireGrip = clamp(num(s.tireGrip, 1), 0.3, 2.5);
    s.brakeG = clamp(num(s.brakeG, 1), 0.3, 2.5);
    s.downforce = clamp(num(s.downforce, 0), 0, 3);
    s.dragCoef = clamp(num(s.dragCoef, 0.75), 0.15, 3);
    s.steerLockDeg = clamp(num(s.steerLockDeg, 34), 10, 60);
    s.shiftTime = clamp(num(s.shiftTime, 0.25), 0.02, 1);
    s.nitroCapacity = Math.max(0, num(s.nitroCapacity, 0));
    s.nitroBoost = Math.max(1, num(s.nitroBoost, 1.3));
    s.drivetrain = s.drivetrain === 'RWD' || s.drivetrain === 'AWD' ? s.drivetrain : 'FWD';
    this.spec = s;

    const L = s.wheelbase;
    this._a = L * (1 - s.weightFront);   // del centro de masa al eje delantero
    this._b = L * s.weightFront;         // del centro de masa al eje trasero
    this._I = s.massKg * this._a * this._b;
    this._lock = s.steerLockDeg * Math.PI / 180;
    this._frontShare = s.drivetrain === 'FWD' ? 1 : s.drivetrain === 'AWD' ? 0.4 : 0;
    this._hw = (num(s.bodyWidth, 0) > 0 ? s.bodyWidth / 2 : s.trackWidth / 2 + 0.17);
    this._hl = (num(s.bodyLength, 0) > 0 ? s.bodyLength / 2 : L * 0.5 + 0.85);
    // Par efectivo: garantiza que se alcance la potencia nominal antes del corte.
    const rI = s.idleRpm / s.redlineRpm, P = s.powerKw * 1000;
    const tNeed = P / (0.88 * s.redlineRpm * RPM2RAD) / torqueShape(0.88, rI);
    this._tq = Math.max(num(s.torqueNm, 0), tNeed);
    this._rI = rI;
    this._launch = Math.max(s.idleRpm * 1.5, s.redlineRpm * 0.5);
    if (this.gear > s.gears.length) this.gear = s.gears.length;
    this.topSpeed = this._estimateTop();
  }

  // Par del motor (N·m) a ciertas rpm, a plena carga.
  torqueAt(rpm) {
    const s = this.spec;
    const r = rpm / s.redlineRpm;
    let T = this._tq * torqueShape(r, this._rI);
    const w = Math.max(rpm * RPM2RAD, 1);
    T = Math.min(T, s.powerKw * 1000 / w);
    if (r > 0.94) T *= 1 - 0.6 * (r - 0.94);
    return T;
  }

  _estimateTop() {
    const s = this.spec, P = s.powerKw * 1000 * DRIVE_EFF, roll = CRR * s.massKg * G;
    let lo = 1, hi = 250;
    for (let i = 0; i < 40; i++) { const v = (lo + hi) / 2; if ((AIR * s.dragCoef * v * v + roll) * v > P) hi = v; else lo = v; }
    const top = s.gears[s.gears.length - 1] * s.finalDrive;
    const vGear = s.redlineRpm * RPM2RAD * s.wheelRadius / top;
    return Math.min(lo, vGear);
  }

  reset(pos, yaw = 0) {
    const x = pos ? pos.x : 0, y = pos ? pos.y : 0, z = pos ? pos.z : 0;
    this._px = x; this._py = y; this._pz = z;
    this._vx = this._vy = this._vz = 0;
    this._yaw = num(yaw, 0); this._om = 0; this._delta = 0;
    this._acc = 0; this._axF = this._ayF = 0; this._bp = this._br = 0;
    this._shiftT = 0; this._shiftCd = 0; this._revHold = 0; this._cut = false; this._spinVis = 0; this._cap = null;
    this.gear = 1; this.rpm = this.spec.idleRpm; this.shifting = false;
    this.throttle = 0; this.brake = 0; this.wallHit = 0; this.wallContact = false;
    this.drifting = false; this.wheelSpin = 0; this.slipAngle = 0; this.nitroActive = false;
    this._qx = x; this._qz = z;
    this._publish();
  }

  addNitro(fraction) { this.nitro = clamp(this.nitro + (fraction || 0), 0, 1); }

  // Limita la velocidad hacia adelante (alcance por detrás, pits, fin de pista abierta).
  slowTo(maxSpeed) {
    const cap = Math.max(0, num(maxSpeed, 0));
    this._cap = cap;
    this._applyCap(cap);
    this._publish();
  }

  _applyCap(cap) {
    const fx = -Math.sin(this._yaw), fz = -Math.cos(this._yaw);
    const u = this._vx * fx + this._vz * fz;
    if (u > cap) { const d = u - cap; this._vx -= fx * d; this._vz -= fz * d; }
  }

  // Si el núcleo movió position/yaw/velocity directamente, se adopta.
  _adopt() {
    const p = this.position, v = this.velocity, b = this._pub;
    if (p.x !== b[0] || p.y !== b[1] || p.z !== b[2]) { this._px = p.x; this._py = p.y; this._pz = p.z; this._acc = 0; }
    if (this.yaw !== b[3]) { this._yaw = this.yaw; this._acc = 0; }
    if (v.x !== b[4] || v.y !== b[5] || v.z !== b[6]) { this._vx = v.x; this._vy = v.y; this._vz = v.z; }
  }

  step(dt, controls, surface, envGrip = 1) {
    this._adopt();
    dt = dt > 0 ? Math.min(dt, 0.25) : 0;
    const c = controls || NO_CONTROLS;
    const s = surface && typeof surface === 'object' ? surface : null;
    this.envGrip = num(envGrip, 1);
    this._qx = this.position.x; this._qz = this.position.z;   // punto donde se consultó la superficie
    this.wallHit = 0; this.wallContact = false;
    if (s && s.surface) this.surface = s.surface;
    this._events(c);
    const backup = [this._px, this._py, this._pz, this._vx, this._vy, this._vz, this._yaw, this._om];
    this._acc += dt;
    let n = 0;
    while (this._acc >= STEP && n < MAX_SUBSTEPS) { this._substep(STEP, c, s); this._acc -= STEP; n++; }
    if (n >= MAX_SUBSTEPS) this._acc = 0;
    this._cap = null;
    if (!isFinite(this._px + this._py + this._pz + this._vx + this._vy + this._vz + this._yaw + this._om)) {
      [this._px, this._py, this._pz] = backup;
      this._vx = this._vy = this._vz = 0; this._om = 0; this._yaw = num(backup[6], 0); this._acc = 0;
    }
    this._publish();
  }

  // Cambios manuales (acciones de un toque, una vez por step).
  _events(c) {
    if (this.gearbox !== 'manual') { if (this.gear === 0) this.gear = 1; return; }
    const s = this.spec, n = s.gears.length;
    const u = -Math.sin(this._yaw) * this._vx - Math.cos(this._yaw) * this._vz;
    if (c.shiftUp) {
      if (this.gear === -1) this._shift(0);
      else if (this.gear < n) this._shift(this.gear + 1);
    } else if (c.shiftDown) {
      if (this.gear > 1) {
        const rDown = Math.abs(u) / s.wheelRadius * s.gears[this.gear - 2] * s.finalDrive / RPM2RAD;
        if (rDown < s.redlineRpm * 1.05) this._shift(this.gear - 1);
      } else if (this.gear === 1) this._shift(0);
      else if (this.gear === 0 && u < 1.5) this._shift(-1);
    }
  }

  _shift(g) {
    const changeTime = (g > 0 && this.gear > 0) ? this.spec.shiftTime : this.spec.shiftTime * 0.5;
    this.gear = g;
    this._shiftT = changeTime;
    this._shiftCd = changeTime + 0.6;
    this.shifting = true;
  }

  _substep(h, c, s) {
    const sp = this.spec, m = sp.massKg, R = sp.wheelRadius, L = sp.wheelbase, a = this._a, b = this._b;
    const yaw = this._yaw;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    let vx = this._vx, vz = this._vz, om = this._om;
    const u = vx * fx + vz * fz, w = vx * rx + vz * rz;
    const spd = Math.hypot(vx, vz);

    // --- piso (plano local de la superficie, extrapolado desde el punto de consulta)
    let nx = 0, ny = 1, nz = 0, hg = 0, grip = 1, sdrag = 0;
    if (s) {
      const n = s.normal;
      if (n) { nx = num(n.x, 0); ny = Math.max(0.3, num(n.y, 1)); nz = num(n.z, 0); }
      hg = num(s.height, this._py) - (nx * (this._px - this._qx) + nz * (this._pz - this._qz)) / ny;
      grip = clamp(num(s.grip, 1), 0.05, 2);
      sdrag = clamp(num(s.drag, 0), 0, 2);
    } else hg = 0;
    const gap = this._py - hg;
    const contact = gap <= 0.03 ? 1 : clamp(1 - (gap - 0.03) / 0.12, 0, 1);

    // --- controles efectivos (reversa automática)
    const thrIn = clamp(num(c.throttle, 0), 0, 1), brkIn = clamp(num(c.brake, 0), 0, 1);
    const hb = !!c.handbrake;
    let thr = thrIn, brk = brkIn;
    if (this.gearbox !== 'manual') {
      if (this.gear >= 0) {
        if (this.gear === 0) this.gear = 1;
        if (brkIn > 0.1 && thrIn < 0.1 && Math.abs(u) < 1) {
          this._revHold += h;
          if (this._revHold > 0.3) { this.gear = -1; this._revHold = 0; this._shiftT = 0; this.shifting = false; }
        } else this._revHold = 0;
      }
      if (this.gear === -1) {
        thr = brkIn; brk = thrIn;
        if (thrIn > 0.1 && u > -1) { this.gear = 1; thr = thrIn; brk = 0; this._shiftT = 0; this.shifting = false; }
      }
    }
    this.throttle = thr; this.brake = brk; this.handbrake = hb;

    // --- dirección (menos ángulo a alta velocidad; permite contravolante extra al derrapar)
    const uf = Math.max(0, u);
    const lim = this._lock / (1 + uf / 14);
    this.steerLimit = lim;
    const steerIn = clamp(num(c.steer, 0), -1, 1);
    const beta = u > 3 ? Math.atan2(w, u) : 0;
    let target = steerIn * lim;
    if (steerIn * beta > 0) target = steerIn * Math.min(this._lock, lim + Math.abs(beta));
    if (u > 4) target += beta * 0.38 * (1 - 0.6 * Math.abs(steerIn));     // las ruedas se alinean solas con la velocidad
    target = clamp(target, -this._lock, this._lock);
    const dmax = 3.2 * h;
    this._delta += clamp(target - this._delta, -dmax, dmax);
    const delta = this._delta;
    this.steerAngle = delta;

    // --- motor y caja
    const gears = sp.gears, nG = gears.length, red = sp.redlineRpm, idle = sp.idleRpm;
    if (this._shiftT > 0) { this._shiftT -= h; if (this._shiftT <= 0) { this._shiftT = 0; this.shifting = false; } }
    if (this._shiftCd > 0) this._shiftCd -= h;
    const ratio = this.gear > 0 ? gears[this.gear - 1] : this.gear < 0 ? -sp.reverseRatio : 0;
    const tr = ratio * sp.finalDrive;
    const rpmWheel = (u / R) * tr / RPM2RAD;     // con signo: + si el auto va en el sentido de la marcha
    const rw = Math.max(0, rpmWheel);

    // caja automática
    if (this.gearbox !== 'manual' && this.gear >= 1 && this._shiftT <= 0 && this._shiftCd <= 0 && contact > 0.5) {
      const upAt = red * (0.6 + 0.35 * thr);
      if (this.gear < nG && rw > upAt && this._spinVis < 0.6) this._shift(this.gear + 1);
      else if (this.gear > 1) {
        const rDown = rw * gears[this.gear - 2] / gears[this.gear - 1];
        const downAt = red * (brk > 0.2 ? 0.45 : 0.25 + 0.2 * thr);
        if (rw < downAt && rDown < upAt * 0.92) this._shift(this.gear - 1);
      }
    }

    const engaged = this.gear !== 0 && this._shiftT <= 0;
    let rpmEng, T = 0;
    if (engaged) {
      rpmEng = (rw < this._launch && thr > 0.05) ? Math.max(rw, idle + (this._launch - idle) * thr) : Math.max(rw, idle * 0.9);
      if (rpmEng >= red) this._cut = true; else if (rpmEng < red * 0.96) this._cut = false;
      // nitro
      const wantN = !!c.nitro && sp.nitroCapacity > 0 && this.nitro > 0 && thr > 0.2 && this.gear > 0 && contact > 0.5;
      this.nitroActive = wantN;
      if (thr > 0 && !this._cut) T = this.torqueAt(rpmEng) * thr * (wantN ? sp.nitroBoost : 1);
      if (this.gear < 0 && u < -REVERSE_MAX) T = Math.min(T, 0);
      if (rw > idle) T -= ENGINE_BRAKE * this._tq * (1 - thr) * Math.min(1.2, rw / red);
    } else {
      rpmEng = idle + thr * (red - idle);
      this.nitroActive = false;
      this._cut = false;
    }
    if (this.nitroActive) this.nitro = Math.max(0, this.nitro - h / sp.nitroCapacity);
    else if (sp.nitroCapacity > 0) this.nitro = Math.min(1, this.nitro + h * NITRO_REFILL);
    const Fdrive = T * tr * DRIVE_EFF / R;

    // --- cargas por eje
    const down = sp.downforce * DOWNFORCE_K * uf * uf;
    const transfer = m * this._axF * sp.cgHeight / L;
    const Fzf = Math.max(m * G * sp.weightFront * 0.15, m * G * sp.weightFront - transfer + down * 0.45) * contact;
    const Fzr = Math.max(m * G * (1 - sp.weightFront) * 0.15, m * G * (1 - sp.weightFront) + transfer + down * 0.55) * contact;
    const mu = sp.tireGrip * grip * this.envGrip;
    const muNf = mu * Fzf, muNr = mu * Fzr * REAR_GRIP;

    // --- velocidades de cada eje
    const cd = Math.cos(delta), sd = Math.sin(delta);
    const latF = w + a * om, latR = w - b * om;
    const vLongF = u * cd + latF * sd, vLatF = -u * sd + latF * cd;
    const vLongR = u, vLatR = latR;
    const alphaF = Math.atan2(vLatF, Math.max(Math.abs(vLongF), U_MIN));
    const alphaR = Math.atan2(vLatR, Math.max(Math.abs(vLongR), U_MIN));
    const FyF0 = -muNf * Math.sin(TIRE_F.C * Math.atan(TIRE_F.B * alphaF));
    let FyR0 = -muNr * Math.sin(TIRE_R.C * Math.atan(TIRE_R.B * alphaR));

    // frenos (62 % adelante) y freno de mano
    const Fb = brk * sp.brakeG * m * G;
    const sgnF = clamp(vLongF / 0.4, -1, 1), sgnR = clamp(vLongR / 0.4, -1, 1);
    const fs = this._frontShare;
    let dF = Fdrive * fs, dR = hb ? 0 : Fdrive * (1 - fs);
    // control de tracción suave a alta velocidad (si el auto no va cruzado): evita latigazos con potencia
    if (u > 18 && Math.abs(beta) < 0.12 && Fdrive > 0) {
      const kMax = 0.97 - 0.12 * clamp((u - 18) / 30, 0, 1);
      if (dF > muNf * kMax) dF = muNf * kMax;
      if (dR > muNr * kMax) dR = muNr * kMax;
    }
    let FxF0 = dF - Fb * 0.62 * sgnF;
    let FxR0 = dR - Fb * 0.38 * sgnR;
    let hbLat = 1;
    if (hb) {
      FxR0 -= (Math.abs(u) < 3 ? 1.2 : 0.35) * muNr * sgnR;
      hbLat = 0.3;
    }
    const absF = FxF0 * sgnF < 0, absR = !hb && FxR0 * sgnR < 0;
    combine(FxF0, FyF0, muNf, absF);
    const FxF = AX.fx, FyF = AX.fy, spinF = AX.spin;
    combine(FxR0, FyR0, muNr, absR);
    const FxR = AX.fx;
    let FyR = AX.fy;
    let spinR = AX.spin;
    if (hb) { FyR = clamp(FyR, -muNr * hbLat, muNr * hbLat); spinR = Math.max(spinR, Math.abs(u) > 3 ? 0.8 : 0); }

    // --- fuerzas en el cuerpo
    const FxB = FxF * cd - FyF * sd + FxR;
    const FyB = FxF * sd + FyF * cd + FyR;
    let Mz = a * (FxF * sd + FyF * cd) - b * FyR;

    // resistencias (mundo): aire, rodadura, superficie
    let ax = (FxB * fx + FyB * rx) / m, az = (FxB * fz + FyB * rz) / m;
    if (spd > 1e-4) {
      const ux = vx / spd, uz = vz / spd;
      const aero = AIR * sp.dragCoef * (1 - 0.35 * clamp(this.slipstream, 0, 1)) * spd * spd;
      const roll = (CRR * m * G + sdrag * SURF_DRAG_K * m * G * (0.2 + 0.8 * Math.min(1, spd / 25))) * Math.min(1, spd / 0.5) * contact;
      const Fr = (aero + roll) / m;
      ax -= ux * Fr; az -= uz * Fr;
    }
    // gravedad en pendiente
    ax += G * ny * nx * contact; az += G * ny * nz * contact;

    // --- asistencias (la mitad «arcade»)
    if (contact > 0.5 && u > 6 && !hb) {
      const ab = Math.abs(beta);
      if (om * beta < 0 && ab > 0.2) {               // el auto gira hacia el trompo
        const k = Math.min(1, (ab - 0.2) / 0.5);
        const damp = (3.5 + 12 * Math.max(0, ab - 0.85)) * k;
        Mz -= om * this._I * damp;
      }
    }
    // a muy baja velocidad, que no gire solo
    if (spd < 1.5 && Math.abs(steerIn) < 0.05) Mz -= om * this._I * 4;

    // --- integración
    vx += ax * h; vz += az * h;
    om += (Mz / this._I) * h;
    if (contact <= 0) om *= 1 - 0.5 * h;
    let nyaw = yaw - om * h;
    let px = this._px + vx * h, pz = this._pz + vz * h;

    // sostener detenido con freno
    {
      const nf = -Math.sin(nyaw), nfz = -Math.cos(nyaw);
      const u2 = vx * nf + vz * nfz;
      if ((brk > 0.3 || hb) && thr < 0.05 && Math.abs(u2) < 0.08) { vx -= nf * u2; vz -= nfz * u2; }
      if (this._cap != null && u2 > this._cap) { const d = u2 - this._cap; vx -= nf * d; vz -= nfz * d; }
    }

    // --- muros
    if (s && s.right && typeof s.lateral === 'number') {
      const Rx = s.right.x, Rz = s.right.z;
      const lat = s.lateral + (px - this._qx) * Rx + (pz - this._qz) * Rz;
      const nfx = -Math.sin(nyaw), nfz = -Math.cos(nyaw), nrx = Math.cos(nyaw), nrz = -Math.sin(nyaw);
      const ext = this._hw * Math.abs(nrx * Rx + nrz * Rz) + this._hl * Math.abs(nfx * Rx + nfz * Rz);
      const rW = num(s.rightWall, Infinity), lW = num(s.leftWall, Infinity);
      let hitN = 0, over = 0;
      if (isFinite(rW) && lat + ext > rW) { over = lat + ext - rW; hitN = 1; }
      else if (isFinite(lW) && lat - ext < -lW) { over = -lW - (lat - ext); hitN = -1; }
      if (hitN !== 0) {
        const Nx = Rx * hitN, Nz = Rz * hitN;      // normal hacia el muro
        px -= Nx * over; pz -= Nz * over;
        this.wallContact = true;
        const vn = vx * Nx + vz * Nz;
        if (vn > 0) {
          const e = 0.2;
          vx -= (1 + e) * vn * Nx; vz -= (1 + e) * vn * Nz;
          const tx = -Nz, tz = Nx;
          const vt = vx * tx + vz * tz;
          const dvt = Math.min(Math.abs(vt), 0.35 * (1 + e) * vn);
          vx -= Math.sign(vt) * dvt * tx; vz -= Math.sign(vt) * dvt * tz;
          if (vn > 0.6) this.wallHit = Math.max(this.wallHit, clamp(vn / 16, 0.02, 1));
          om *= 1 - 0.6 * clamp(vn / 8, 0, 1);
          // alinear el auto con el muro
          const vt2 = vx * tx + vz * tz;
          let dx = tx * Math.sign(vt2 || 1), dz = tz * Math.sign(vt2 || 1);
          if (vx * nfx + vz * nfz < 0) { dx = -dx; dz = -dz; }
          const tyaw = Math.atan2(-dx, -dz);
          nyaw += wrap(tyaw - nyaw) * clamp(vn / 30, 0, 0.3);
        }
      }
    }

    // --- vertical: sigue el piso; despega si el piso cae más rápido que la gravedad
    const groundVy = -(nx * vx + nz * vz) / ny;
    let py = this._py, vy = this._vy;
    if (s) {
      const hg2 = num(s.height, py) - (nx * (px - this._qx) + nz * (pz - this._qz)) / ny;
      if (py <= hg2 + 0.03) {
        const vyN = vy - G * h;
        if (vyN <= groundVy) { py = hg2; vy = groundVy; }
        else {
          // despegue: la suspensión absorbe parte del salto
          vy = groundVy + (vyN - groundVy) * 0.6; py += vy * h;
          if (py < hg2) { py = hg2; vy = groundVy; }
        }
      } else {
        vy -= G * 1.4 * h; py += vy * h;     // gravedad un poco más fuerte en el aire (saltos cortos)
        if (py <= hg2) { py = hg2; vy = Math.max(vy, groundVy); }
      }
    } else { py = 0; vy = 0; }

    // --- guardar
    this._px = px; this._py = py; this._pz = pz;
    this._vx = vx; this._vy = vy; this._vz = vz;
    this._om = om; this._yaw = wrap(nyaw);

    // --- valores para el exterior
    const axB = FxB / m, ayB = FyB / m;
    this._axF += (clamp(axB, -25, 25) - this._axF) * smoothK(10, h);
    this._ayF += (clamp(ayB, -30, 30) - this._ayF) * smoothK(10, h);
    const drivenSpin = fs >= 1 ? spinF : fs <= 0 ? spinR : Math.max(spinF, spinR);
    const spinNow = Math.max(drivenSpin, hb ? spinR : 0, brk > 0.5 && Math.abs(u) > 3 ? Math.max(spinF, spinR) * 0.5 : 0);
    this._spinVis += (spinNow - this._spinVis) * smoothK(spinNow > this._spinVis ? 20 : 6, h);
    // rpm visibles
    let rpmT = engaged ? rpmEng + drivenSpin * 0.3 * red : rpmEng;
    if (!engaged && this.gear !== 0 && this._shiftT > 0) rpmT = Math.max(idle, rw);
    rpmT = clamp(rpmT, idle * 0.85, red * 1.03);
    this.rpm += (rpmT - this.rpm) * smoothK(engaged ? 30 : 9, h);
    // cabeceo y alabeo de la carrocería
    this._bp += (clamp(this._axF * 0.0045, -0.05, 0.05) - this._bp) * smoothK(6, h);
    this._br += (clamp(this._ayF * 0.0055, -0.06, 0.06) - this._br) * smoothK(6, h);
    this._gp = -Math.asin(clamp(nx * fx + nz * fz, -1, 1));
    this._gr = -Math.asin(clamp(nx * rx + nz * rz, -1, 1));
    this.onGround = contact > 0.5;
    this.surfaceGrip = grip;
  }

  _publish() {
    const e = this._acc;
    const vx = this._vx, vz = this._vz;
    this.position.set(this._px + vx * e, this._py, this._pz + vz * e);
    this.velocity.set(vx, this._vy, vz);
    this.yaw = wrap(this._yaw - this._om * e);
    const fx = -Math.sin(this._yaw), fz = -Math.cos(this._yaw);
    const u = vx * fx + vz * fz, w = vx * Math.cos(this._yaw) - vz * Math.sin(this._yaw);
    this.speed = u;
    this.yawRate = this._om;
    const spd = Math.hypot(vx, vz);
    this.slipAngle = spd > 2 ? Math.atan2(w, Math.abs(u)) * Math.min(1, (spd - 2) / 3) : 0;
    this.drifting = this.onGround && spd > 7 && Math.abs(this.slipAngle) > 0.17;
    this.wheelSpin = clamp(this._spinVis, 0, 1);
    this.accelLong = this._axF; this.accelLat = this._ayF;
    this.pitch = this._gp + this._bp;
    this.roll = this._gr + this._br;
    const b = this._pub, p = this.position, v = this.velocity;
    b[0] = p.x; b[1] = p.y; b[2] = p.z; b[3] = this.yaw; b[4] = v.x; b[5] = v.y; b[6] = v.z;
  }

  // Coloca un Object3D según el estado (orden de rotación YXZ: yaw, luego cabeceo y alabeo).
  applyTo(obj) {
    obj.position.copy(this.position);
    obj.rotation.order = 'YXZ';
    obj.rotation.set(this.pitch, this.yaw, this.roll);
  }

  // Objeto plano con el estado público (para red, modelo y audio). Reutiliza `out` si se pasa.
  getState(out = {}) {
    const p = this.position, v = this.velocity;
    out.position = out.position || {}; out.position.x = p.x; out.position.y = p.y; out.position.z = p.z;
    out.velocity = out.velocity || {}; out.velocity.x = v.x; out.velocity.y = v.y; out.velocity.z = v.z;
    out.yaw = this.yaw; out.pitch = this.pitch; out.roll = this.roll;
    out.speed = this.speed; out.rpm = this.rpm; out.gear = this.gear; out.gearbox = this.gearbox;
    out.steerAngle = this.steerAngle; out.throttle = this.throttle; out.brake = this.brake; out.handbrake = this.handbrake;
    out.slipAngle = this.slipAngle; out.drifting = this.drifting; out.wheelSpin = this.wheelSpin; out.onGround = this.onGround;
    out.nitroActive = this.nitroActive; out.nitro = this.nitro; out.wallHit = this.wallHit; out.surface = this.surface;
    out.yawRate = this.yawRate; out.accelLong = this.accelLong; out.accelLat = this.accelLat; out.shifting = this.shifting;
    out.redlineRpm = this.spec.redlineRpm; out.idleRpm = this.spec.idleRpm;
    return out;
  }
}
