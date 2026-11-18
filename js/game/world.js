// Mundo 3D: renderer, sala de exhibición de los menús y la sesión de carrera (autos, red, reglas, cámara, audio).
import * as THREE from 'three';
import { CAR_BY_ID, CARS, computeSpec } from '../data/cars.js';
import { defaultCustom, resolveCustom } from '../data/parts.js';
import { buildCarModel } from './carmodel.js';
import { Effects } from './effects.js';
import { buildTrack } from './track.js';
import { setupEnvironment } from './environment.js';
import { VehiclePhysics } from './physics.js';
import { CameraRig } from './camera.js';
import { AIDriver } from './ai.js';
import { Race, makeTraffic, trafficPose } from './race.js';
import { audio } from '../core/audio.js';
import { music } from '../core/music.js';
import { narrator } from '../core/narrator.js';
import { rng, clamp, lerp, wrapAngle } from '../core/util.js';
import { NET_RATE_P2P, INTERP_DELAY_MS } from '../config.js';

const START_CAR = 'nissan-tsuru';
export const PLAYER_COLORS = ['#ff5a1f', '#3fa7ff', '#ffd23f', '#5ce17a', '#e05cff', '#ff4d6d', '#38e0d0', '#f0f0f0'];
const SURF_CODES = ['asfalto', 'piano', 'pasto', 'tierra', 'grava', 'arena', 'nieve', 'hielo'];

export function carDefOf(id) { return CAR_BY_ID[id] || CAR_BY_ID[START_CAR] || CARS[0]; }

// =============================================================================================
export class World {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.rig = new CameraRig(this.renderer, { fov: settings.fov || 70 });
    this.session = null;
    this.showroom = null;
    this.applySettings(settings);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    this.fps = 60;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  get quality() { return this.settings.graphics === 'semi' ? 'semi' : 'lowpoly'; }

  applySettings(s) {
    this.settings = s;
    const scale = clamp(s.renderScale || 1, 0.4, 1);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5) * scale);
    this.renderer.shadowMap.enabled = this.quality === 'semi';
    if (this.rig) {
      this.rig.mirror = !!s.mirror;
      if (this.rig.camera && s.fov) { this.rig.baseFov = s.fov; this.rig.camera.fov = s.fov; this.rig.camera.updateProjectionMatrix(); }
    }
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.rig) this.rig.resize(w, h);
    if (this.showroom) { this.showroom.cam.aspect = w / h; this.showroom.cam.updateProjectionMatrix(); }
  }

  // ---- sala de exhibición (fondo de menús) ------------------------------------------------------
  showShowroom(entry) {
    if (this.session) return;
    if (!this.showroom) this.showroom = new Showroom(this);
    this.showroom.setCar(entry);
  }
  hideShowroom() { if (this.showroom) { this.showroom.dispose(); this.showroom = null; } }

  // ---- carrera ---------------------------------------------------------------------------------
  async startSession(cfg) {
    this.hideShowroom();
    if (this.session) this.endSession();
    const s = new Session(this, cfg);
    this.session = s;
    await s.load();
    return s;
  }
  endSession() {
    if (this.session) { this.session.dispose(); this.session = null; }
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    try {
      if (this.session && this.session.ready) this.session.frame(dt);
      else if (this.showroom) this.showroom.frame(dt);
      else this.renderer.clear();
    } catch (e) {
      console.error(e);
      if (!this._errShown && this.onError) { this._errShown = true; this.onError(e); }
    }
  }
}

// =============================================================================================
class Showroom {
  constructor(world) {
    this.world = world;
    const q = world.quality;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0f14');
    scene.fog = new THREE.Fog('#0d0f14', 14, 40);
    this.scene = scene;
    const w = world.container.clientWidth || innerWidth, h = world.container.clientHeight || innerHeight;
    this.cam = new THREE.PerspectiveCamera(38, w / h, 0.1, 200);
    scene.add(new THREE.HemisphereLight('#c8d4ff', '#2a1c14', 1.1));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(5, 8, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#ff7a3d', 1.6);
    rim.position.set(-6, 3, -5);
    scene.add(rim);
    // piso: disco giratorio con anillo naranja
    const mat = q === 'semi' ? new THREE.MeshStandardMaterial({ color: '#1a1d24', roughness: 0.4, metalness: 0.2 }) : new THREE.MeshLambertMaterial({ color: '#1a1d24' });
    this.disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.18, 48), mat);
    this.disc.position.y = -0.09;
    scene.add(this.disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.04, 6, 64), new THREE.MeshBasicMaterial({ color: '#ff5a1f' }));
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshLambertMaterial({ color: '#111318' }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    scene.add(floor);
    this.t = 0;
    this.model = null;
    this.key = null;
  }
  setCar(entry) {
    if (!entry) return;
    const key = JSON.stringify([entry.carId, entry.custom, this.world.quality]);
    if (key === this.key) return;
    this.key = key;
    if (this.model) { this.disc.remove(this.model.group); this.model.dispose(); this.model = null; }
    try {
      const def = carDefOf(entry.carId);
      this.model = buildCarModel(def, resolveCustom(def, entry.custom), { quality: this.world.quality, interior: false, ghostable: false });
      this.model.group.position.y = 0.09;
      this.disc.add(this.model.group);
      this.model.setLights && this.model.setLights(true, { castLight: false });
    } catch (e) { console.warn('Sala: no se pudo crear el auto', e); }
  }
  frame(dt) {
    this.t += dt;
    this.disc.rotation.y += dt * 0.35;
    if (this.model) this.model.update(dt, IDLE_STATE);
    // auto a la derecha del centro (el menú ocupa la izquierda), con algo de aire alrededor
    this.cam.position.set(-3.2, 2.5, 10.8);
    this.cam.lookAt(-2.6, 0.75, 0);
    this.world.renderer.render(this.scene, this.cam);
  }
  dispose() {
    if (this.model) this.model.dispose();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

const IDLE_STATE = {
  position: new THREE.Vector3(), velocity: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, speed: 0, steerAngle: 0,
  rpm: 900, gear: 0, throttle: 0, brake: 0, nitroActive: false, slipAngle: 0, drifting: false, wheelSpin: 0, onGround: true, surface: 'asfalto',
};

// =============================================================================================
// Sesión de carrera. cfg = {
//   trackDef, mode, settings:{laps,timeOfDay,weather}, seed, localId, participants:[{id,name,carId,custom,upgrades,isBot,role,color}],
//   isHost, net: { sendFast(data), send(ev,payload) } | null, hooks: { ui, onResults(results), onQuit }, save
// }
export class Session {
  constructor(world, cfg) {
    this.world = world;
    this.cfg = cfg;
    this.scene = new THREE.Scene();
    this.ready = false;
    this.entities = [];
    this.byId = new Map();
    this.traffic = [];
    this.ghost = null;
    this.paused = false;
    this.netAcc = 0;
    this.hudAcc = 0;
    this.seq = 0;
    this.messages = [];
    this.spectate = null;
  }

  get ui() { return this.cfg.hooks.ui; }
  get settings() { return this.world.settings; }

  async load() {
    const { trackDef, mode, settings } = this.cfg;
    const q = this.world.quality;
    const ui = this.ui;
    ui.showLoading('Construyendo pista…', 0.1);
    await new Promise(r => setTimeout(r, 30));
    this.track = await buildTrack(trackDef, { quality: q, timeOfDay: settings.timeOfDay, weather: settings.weather });
    this.scene.add(this.track.group);
    ui.showLoading('Ajustando el cielo…', 0.5);
    this.env = setupEnvironment(this.scene, this.world.renderer, { theme: trackDef.theme, timeOfDay: settings.timeOfDay, weather: settings.weather, quality: q });
    this.effects = new Effects(this.scene, { quality: q });

    const hooks = {
      message: (t, k) => this.ui.hud.message(t, k),
      say: (ev, p) => narrator.say(ev, p),
      sfx: n => audio.sfx(n),
      send: (ev, p) => this.cfg.net && this.cfg.net.send(ev, p),
      knock: id => this.track.knockProp && this.track.knockProp(id),
      newGhost: (lapMs, frames) => this._newGhost(lapMs, frames),
    };
    this.race = new Race({ track: this.track, mode, settings, localId: this.cfg.localId, isHost: this.cfg.isHost, hooks });

    ui.showLoading('Calentando motores…', 0.7);
    const n = this.cfg.participants.length;
    const slots = this.track.gridSlots(Math.max(n, 1));
    // Persecución: fugitivos adelante, patrullas atrás.
    const order = [...this.cfg.participants].sort((a, b) => (a.role === 'policia') - (b.role === 'policia'));
    order.forEach((p, i) => this._addEntity(p, slots[i] || slots[slots.length - 1], i));

    // tráfico determinista (Callejero)
    if (mode.traffic) {
      const r = rng(this.cfg.seed + ':trafico');
      const civ = CARS.filter(c => !c.hidden && c.tier <= 2);
      const list = makeTraffic(this.track, Math.round(this.track.length / 260), r);
      for (const tr of list) {
        const def = civ[Math.floor(r() * civ.length)] || carDefOf(START_CAR);
        const model = buildCarModel(def, { ...defaultCustom(def), paint: ['#d9d9d9', '#2b2b2b', '#8a1c1c', '#1c3f8a', '#e6e2d3', '#4c5a3a'][tr.idx % 6] }, { quality: q, interior: false });
        this.scene.add(model.group);
        const st = makeState();
        this.traffic.push({ tr, model, st, carDef: def, len: def.body.length || 4.3, wid: def.body.width || 1.8 });
      }
    }

    // fantasma de tu récord (Contrarreloj)
    if (mode.ghost) {
      const g = this.cfg.save.loadGhost(trackDef.id, mode.id);
      if (g && g.frames && g.frames.length > 5) this._makeGhost(g);
    }

    this.local = this.byId.get(this.cfg.localId) || null;
    this.rig = this.world.rig;
    this.rig.mirror = !!this.settings.mirror;
    this.rig.setMode(this.settings.camera ?? 2);
    if (this.local) this._follow(this.local);

    // luces de noche
    for (const e of this.entities) e.model.setLights && e.model.setLights(!!this.env.night, { castLight: e === this.local && this.env.night });
    for (const t of this.traffic) t.model.setLights && t.model.setLights(!!this.env.night, { castLight: false });

    ui.showLoading('¡Listo!', 1);
    music.play(trackDef.theme);
    audio.ambience(this._ambience());
    this.ready = true;
  }

  _ambience() {
    const { weather } = this.cfg.settings;
    if (weather === 'rain') return 'lluvia';
    const th = this.cfg.trackDef.theme;
    if (th === 'neon') return 'ciudad';
    if (th === 'autodromo' || th === 'ovalo') return 'gradas';
    if (th === 'costa') return 'mar';
    return 'viento';
  }

  _addEntity(p, slot, idx) {
    const q = this.world.quality;
    const mode = this.cfg.mode;
    let carId = p.carId;
    if (mode.forcedCar) carId = mode.forcedCar;
    if (p.role === 'policia') carId = 'patrulla';
    const carDef = carDefOf(carId);
    const custom = { ...(mode.forcedCar || p.role === 'policia' ? defaultCustom(carDef) : resolveCustom(carDef, p.custom)) };
    if (mode.forcedCar) { custom.paint = p.color || PLAYER_COLORS[idx % 8]; custom.number = idx + 1; }
    const isLocal = p.id === this.cfg.localId;
    const kind = isLocal ? 'local' : (p.isBot ? (this.cfg.isHost ? 'bot' : 'remote') : 'remote');
    const model = buildCarModel(carDef, custom, { quality: q, interior: isLocal, ghostable: true });
    this.scene.add(model.group);
    const upgrades = (mode.forcedCar || p.role === 'policia') ? {} : (p.upgrades || {});
    const ent = {
      id: p.id, name: p.name, kind, isBot: !!p.isBot, carDef, custom, upgrades, color: p.color || PLAYER_COLORS[idx % 8],
      model, physics: null, ai: null, voice: null, st: makeState(), surface: null, hint: undefined,
      damage: 0, appliedDamage: 0, role: p.role || null, snaps: [], len: carDef.body.length || 4.4, wid: carDef.body.width || 1.85,
      opacity: 1, lastNet: 0,
    };
    ent.st.position.copy(slot.pos);
    ent.st.yaw = slot.yaw;
    model.group.position.copy(slot.pos);
    model.group.rotation.y = slot.yaw;
    if (kind === 'local' || kind === 'bot') {
      ent.physics = new VehiclePhysics(computeSpec(carDef, upgrades, 0));
      ent.physics.gearbox = kind === 'local' ? (this.settings.gearbox || 'auto') : 'auto';
      ent.physics.reset(slot.pos.clone(), slot.yaw);
      if (kind === 'bot') ent.ai = new AIDriver(this.track, ent.physics, { skill: 'normal', seed: idx * 977 + 13, lateralOffset: ((idx % 3) - 1) * 0.3 });
    }
    if (!isLocal && this.settings.showNames !== false && model.setNameTag) model.setNameTag(p.name);
    if (p.role === 'policia' && model.setSiren) model.setSiren(true);
    try { ent.voice = audio.createEngine(carDef.engine, { local: isLocal }); } catch (e) { console.warn('motor', e); }
    this.race.add(ent);
    ent.prog.role = ent.role;
    this.entities.push(ent);
    this.byId.set(ent.id, ent);
    return ent;
  }

  _follow(ent) {
    this.spectate = ent === this.local ? null : ent;
    this.rig.setTarget({ model: ent.model, physics: ent.physics || ent.st });
  }

  // ---- salida ----------------------------------------------------------------------------------
  // Arranca la cuenta: startPerf = performance.now() en que se da el banderazo.
  beginCountdown(startPerf) {
    this.race.start(startPerf);
    this.countShown = 99;
  }

  _countdown() {
    const t = this.race.now();
    if (t >= 0) {
      if (this.countShown > 0) {
        this.countShown = 0;
        this.ui.hud.countdown('¡YA!'); audio.sfx('arranque'); narrator.say('arranque');
        this.track.setStartLights && this.track.setStartLights(0, true);
      }
      return;
    }
    const n = Math.ceil(-t / 1000);
    if (n <= 3 && n !== this.countShown) {
      this.countShown = n;
      this.track.setStartLights && this.track.setStartLights([0, 5, 4, 2][n] ?? 0, false);
      this.ui.hud.countdown(n);
      audio.sfx('cuenta');
      narrator.say('cuenta' + n);
    }
  }

  // ---- red ---------------------------------------------------------------------------------------
  onFast(d, from) {
    if (!Array.isArray(d)) return;
    const ent = this.byId.get(d[0]);
    if (!ent || ent.kind !== 'remote') return;
    // [id, t, x, y, z, yaw, pitch, roll, vx, vz, speed, steer, rpm, gear, flags, slip, damage, total, lapsDone, score, best, last, fin, finMs, surf, seq]
    const seq = d[25] || 0;
    if (seq && ent.lastSeq && seq <= ent.lastSeq && seq > ent.lastSeq - 1000) return;
    ent.lastSeq = seq;
    // Convierte el tiempo del remitente al reloj local con un filtro de mínimo (latencia + diferencia de relojes),
    // así la interpolación no depende de que las PCs tengan la hora sincronizada.
    let t = d[1];
    if (this.race.started && t !== 0) {
      const off = this.race.now() - t;
      if (ent.off == null || off < ent.off) ent.off = off;
      else ent.off += (off - ent.off) * 0.01;
      t += ent.off;
    } else t = this.race.now();
    if (ent.snaps.length && t < ent.snaps[ent.snaps.length - 1].t - 2000) ent.snaps.length = 0; // reinicio de reloj
    ent.snaps.push({ t, x: d[2], y: d[3], z: d[4], yaw: d[5], pitch: d[6], roll: d[7], vx: d[8], vz: d[9], speed: d[10], steer: d[11], rpm: d[12], gear: d[13], flags: d[14], slip: d[15], damage: d[16], surf: SURF_CODES[d[24]] || 'asfalto' });
    if (ent.snaps.length > 30) ent.snaps.splice(0, ent.snaps.length - 30);
    this.race.applyRemote(ent, { total: d[17], lapsDone: d[18], score: d[19], bestLapMs: d[20], lastLapMs: d[21], finished: !!d[22], finishMs: d[23] });
  }

  _pack(ent) {
    const s = ent.st, p = ent.prog;
    const flags = (s.brake > 0.1 ? 1 : 0) | (s.nitroActive ? 2 : 0) | (s.drifting ? 4 : 0) | (s.throttle > 0.5 ? 8 : 0);
    const r2 = v => Math.round(v * 100) / 100;
    return [ent.id, Math.round(this.race.now()), r2(s.position.x), r2(s.position.y), r2(s.position.z), r2(s.yaw), r2(s.pitch || 0), r2(s.roll || 0),
      r2(s.velocity.x), r2(s.velocity.z), r2(s.speed), r2(s.steerAngle || 0), Math.round(s.rpm || 0), s.gear || 0, flags, r2(s.slipAngle || 0),
      r2(ent.damage), Math.round(p.total * 10) / 10, p.lapsDone, Math.round(p.score), p.bestLapMs, p.lastLapMs, p.finished ? 1 : 0, p.finishMs,
      Math.max(0, SURF_CODES.indexOf(s.surface)), ++this.seq];
  }

  onMessage(ev, payload) {
    const r = this.race;
    if (ev === 'fin') r.remoteFinished(payload.id, payload.ms, payload.prog);
    else if (ev === 'elim') r.eliminate(payload.id);
    else if (ev === 'bust') r.markBusted(payload.id, payload.by);
  }

  // Un jugador se fue a media carrera.
  removePlayer(id) {
    const e = this.byId.get(id);
    if (!e || e === this.local) return;
    this.scene.remove(e.model.group);
    e.model.dispose();
    e.voice && e.voice.stop();
    this.entities = this.entities.filter(x => x !== e);
    this.byId.delete(id);
    this.race.remove(id);
    this.ui.hud.message(`${e.name} salió`, 'info');
  }

  // El nuevo anfitrión toma los bots (los simula desde su última posición conocida).
  adoptBots() {
    this.cfg.isHost = true;
    this.race.isHost = true;
    for (const e of this.entities) {
      if (!e.isBot || e.kind !== 'remote') continue;
      e.kind = 'bot';
      e.physics = new VehiclePhysics(computeSpec(e.carDef, e.upgrades, e.damage));
      e.physics.reset(e.st.position.clone(), e.st.yaw);
      e.ai = new AIDriver(this.track, e.physics, { skill: 'normal', seed: e.id.length * 31 });
    }
  }

  // ---- bucle -------------------------------------------------------------------------------------
  frame(dt) {
    const input = this.cfg.input;
    input.update(dt);
    const ctl = input.state;
    const race = this.race;

    if (ctl.pause) this.cfg.hooks.onPause();
    if (ctl.camera) { this.rig.cycle(); this.cfg.hooks.onCamera && this.cfg.hooks.onCamera(this.rig.mode); }
    if (ctl.mirror) { this.rig.mirror = !this.rig.mirror; }

    if (this.paused) { this._render(dt); return; }
    if (race.started) this._countdown();

    const envGrip = this.env.gripFactor ?? 1;
    const tNow = race.now();

    // 1) autos simulados aquí (local y bots)
    for (const e of this.entities) {
      if (!e.physics) continue;
      if (!e.surface) e.surface = this.track.query(e.physics.position);
      let c;
      if (e.kind === 'local') {
        const done = e.prog.finished || e.prog.eliminated || e.prog.busted;
        if (done) c = this._autopilot(e, dt);
        else c = { ...ctl };
        if (ctl.reset && !done) this._respawn(e);
      } else {
        const others = this.entities.filter(o => o !== e).map(o => ({ position: o.st.position, speed: o.st.speed }));
        c = e.ai.controls(dt, e.surface, others);
        if (e.prog.finished || e.prog.eliminated || e.prog.busted) c = this._autopilot(e, dt);
        if (e.ai.needsReset) { e.ai.needsReset = false; this._respawn(e); }
      }
      c = race.filterControls(e, c);
      if (race.isFrozen(e)) {
        // en la parrilla: el motor se acelera pero el auto no se mueve
        e.revRpm = lerp(e.revRpm || 900, 900 + (c.throttle || 0) * 5200, 1 - Math.exp(-6 * dt));
        e.physics.reset(e.physics.position, e.physics.yaw);
        this._syncState(e);
        e.st.rpm = e.revRpm; e.st.throttle = c.throttle || 0;
        continue;
      }
      // rebufo
      e.physics.slipstream = this._slipstream(e);
      e.physics.step(dt, c, e.surface, envGrip * race.gripFactor(e));
      const lim = race.pitSpeedLimit(e);
      if (lim != null) e.physics.slowTo(lim);
      if (!this.track.closed && e.surface && e.surface.distance > this.track.finishDistance + 60) e.physics.slowTo(Math.max(0, Math.abs(e.physics.speed) - 25 * dt));
      e.surface = this.track.query(e.physics.position, e.surface.index);
      this._syncState(e);
      // golpes y daño
      if (e.st.wallHit > 0.05) {
        e.damage = Math.min(1, e.damage + e.st.wallHit * 0.06);
        if (e.st.wallHit > 0.2) {
          this.effects.sparks && this.effects.sparks(e.st.position.clone().add(new THREE.Vector3(0, 0.4, 0)), e.surface.right, e.st.wallHit);
          if (e === this.local) audio.sfx('muro', { volume: Math.min(1, e.st.wallHit + 0.3) });
        }
      }
      race.updateEntity(e, dt, e.surface, e.st);
    }

    // 2) autos remotos: interpolación
    for (const e of this.entities) if (e.kind === 'remote') this._interp(e, tNow);

    // 3) tráfico y fantasma
    for (const t of this.traffic) {
      const p = trafficPose(this.track, t.tr, tNow);
      t.st.position.set(p.x, p.y, p.z);
      t.st.yaw = p.yaw;
      t.st.speed = p.speed;
      t.st.velocity.set(-Math.sin(p.yaw) * p.speed, 0, -Math.cos(p.yaw) * p.speed);
      t.st.rpm = 1800; t.st.gear = 2;
      t.model.group.position.copy(t.st.position);
      t.model.group.rotation.y = p.yaw;
      t.model.update(dt, t.st);
    }
    if (this.ghost) this._ghostFrame(tNow);

    // 4) regla de fantasmas: atravesarse sí, alcanzar por detrás no
    this._contacts(dt);

    // 5) daño aplicado a la física y al modelo
    for (const e of this.entities) {
      if (Math.abs(e.damage - e.appliedDamage) > 0.04) {
        e.appliedDamage = e.damage;
        if (e.physics) e.physics.setSpec(computeSpec(e.carDef, e.upgrades, e.damage));
        e.model.setDamage && e.model.setDamage(e.damage);
      }
    }

    // 6) modelos, efectos, audio
    const cam = this.rig.camera;
    for (const e of this.entities) {
      e.model.group.position.copy(e.st.position);
      e.model.group.rotation.set(0, e.st.yaw, 0);
      e.model.update(dt, e.st);
      const near = cam.position.distanceToSquared(e.st.position) < 90 * 90;
      if (near) this.effects.updateCar(e.model, e.st, dt, e.custom.smoke || '#ffffff');
    }
    this._voices(dt);
    if (this.local) {
      const s = this.local.st;
      const skid = this.local.prog.finished && race.isFrozen(this.local) ? 0 : clamp((Math.abs(s.slipAngle || 0) - 0.12) * 2.5, 0, 1) * clamp(Math.abs(s.speed) / 12, 0, 1);
      audio.skid(Math.max(skid, (s.wheelSpin || 0) * 0.8));
      if (ctl.horn && !this._horn) audio.sfx('claxon');
      this._horn = ctl.horn;
    }

    race.trackOvertakes(dt);

    // 7) red
    if (this.cfg.net) {
      this.netAcc += dt;
      if (this.netAcc >= 1 / NET_RATE_P2P) {
        this.netAcc = 0;
        for (const e of this.entities) if (e.kind === 'local' || e.kind === 'bot') this.cfg.net.sendFast(this._pack(e));
      }
    }
    if (race.checkEnd()) this.cfg.hooks.onRaceOver(race.buildResults());

    // espectador: si quedaste fuera, sigue al líder
    if (this.local && (this.local.prog.eliminated || this.local.prog.busted) && !this.spectate) {
      const lead = race.standings().find(e => !e.prog.eliminated && !e.prog.busted && e !== this.local);
      if (lead) this._follow(lead);
    }

    this.track.update(dt, cam);
    this.env.update(dt, cam);
    this.effects.update(dt, cam);
    this.hudAcc += dt;
    if (this.hudAcc >= 1 / 15) { this.hudAcc = 0; this._hud(); }
    this._render(dt, ctl.lookBack);
  }

  _render(dt, lookBack = false) {
    this.rig.update(dt, { lookBack });
    audio.updateListener(this.rig.camera);
    this.rig.render(this.world.renderer, this.scene);
  }

  _syncState(e) {
    const p = e.physics, s = e.st;
    s.position.copy(p.position);
    s.velocity.copy(p.velocity);
    s.yaw = p.yaw; s.pitch = p.pitch || 0; s.roll = p.roll || 0;
    s.speed = p.speed; s.rpm = p.rpm; s.gear = p.gear; s.steerAngle = p.steerAngle;
    s.throttle = p.throttle; s.brake = p.brake; s.slipAngle = p.slipAngle; s.drifting = p.drifting;
    s.wheelSpin = p.wheelSpin; s.onGround = p.onGround; s.nitroActive = p.nitroActive; s.nitro = p.nitro;
    s.wallHit = p.wallHit || 0; s.surface = p.surface || (e.surface && e.surface.surface) || 'asfalto';
    s.redlineRpm = e.physics.spec?.redlineRpm || e.carDef.spec.redlineRpm; s.idleRpm = e.carDef.spec.idleRpm;
  }

  _interp(e, tNow) {
    const snaps = e.snaps;
    if (!snaps.length) return;
    const rt = tNow - INTERP_DELAY_MS;
    let a = null, b = null;
    for (let i = snaps.length - 1; i >= 0; i--) { if (snaps[i].t <= rt) { a = snaps[i]; b = snaps[i + 1] || null; break; } }
    const s = e.st;
    let src;
    if (a && b) {
      const k = clamp((rt - a.t) / Math.max(1, b.t - a.t), 0, 1);
      s.position.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
      s.yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * k;
      s.pitch = lerp(a.pitch, b.pitch, k); s.roll = lerp(a.roll, b.roll, k);
      src = k < 0.5 ? a : b;
    } else {
      // sin datos nuevos: extrapola un poco con la velocidad
      const last = a || snaps[snaps.length - 1];
      const ex = clamp((rt - last.t) / 1000, 0, 0.35);
      s.position.set(last.x + last.vx * ex, last.y, last.z + last.vz * ex);
      s.yaw = last.yaw; s.pitch = last.pitch; s.roll = last.roll;
      src = last;
    }
    s.velocity.set(src.vx, 0, src.vz);
    s.speed = src.speed; s.steerAngle = src.steer; s.rpm = src.rpm; s.gear = src.gear;
    s.brake = src.flags & 1 ? 1 : 0; s.nitroActive = !!(src.flags & 2); s.drifting = !!(src.flags & 4); s.throttle = src.flags & 8 ? 1 : 0.2;
    s.slipAngle = src.slip; s.surface = src.surf; s.onGround = true;
    s.redlineRpm = e.carDef.spec.redlineRpm; s.idleRpm = e.carDef.spec.idleRpm;
    if (src.damage != null) e.damage = src.damage;
  }

  // Alcance por detrás: el que va atrás se frena y pierde puntos. Todos se ven transparentes al encimarse.
  _contacts(dt) {
    const others = [...this.entities.map(e => ({ e, st: e.st, len: e.len, wid: e.wid, ghostOnly: e.prog.eliminated || e.prog.busted })),
      ...this.traffic.map(t => ({ e: null, st: t.st, len: t.len, wid: t.wid, ghostOnly: false }))];
    const me = this.local;
    for (const e of this.entities) e.opacityTarget = 1;
    for (const a of this.entities) {
      if (!a.physics || a.prog.eliminated || a.prog.busted || a.prog.finished) continue;
      const pa = a.st.position;
      for (const o of others) {
        if (o.e === a || o.ghostOnly) continue;
        const pb = o.st.position;
        const dx = pa.x - pb.x, dz = pa.z - pb.z;
        if (dx * dx + dz * dz > 100) continue;
        // posición de a en el marco del otro auto
        const fx = -Math.sin(o.st.yaw), fz = -Math.cos(o.st.yaw);
        const along = dx * fx + dz * fz;
        const side = dx * -fz + dz * fx;
        const overlap = Math.abs(along) < (a.len + o.len) * 0.47 && Math.abs(side) < (a.wid + o.wid) * 0.45;
        if (!overlap) continue;
        if (a === me || o.e === me) { a.opacityTarget = 0.4; if (o.e) o.e.opacityTarget = 0.4; }
        // ¿a va detrás, bien alineado y más rápido? → no lo deja pasar y lo penaliza.
        // Si ya se abrió a un lado (poco traslape lateral) puede rebasar; a un auto detenido se le puede
        // rodear a vuelta de rueda (piso de 2.5 m/s) para que nadie quede atorado detrás.
        const behind = along < -o.len * 0.2 && Math.abs(side) < (a.wid + o.wid) * 0.33;
        const va = a.physics.speed, vb = o.st.speed || 0;
        if (behind && va > vb * 0.95 - 0.5) {
          a.physics.slowTo(Math.max(2.5, vb * 0.92));
          if (this.race.penalty(a)) a.damage = Math.min(1, a.damage + 0.03);
        }
      }
    }
    // transparencia también al acercarse (de vista)
    if (me) {
      for (const e of this.entities) {
        if (e === me) continue;
        const d = e.st.position.distanceTo(me.st.position);
        if (d < 9) e.opacityTarget = Math.min(e.opacityTarget, clamp((d - 2.5) / 6.5, 0.35, 1));
        if (e.prog.eliminated || e.prog.busted) e.opacityTarget = 0.25;
      }
    }
    for (const e of this.entities) {
      const t = e.opacityTarget;
      if (Math.abs(e.opacity - t) > 0.02) {
        e.opacity += (t - e.opacity) * Math.min(1, dt * 10);
        e.model.setOpacity && e.model.setOpacity(e.opacity > 0.97 ? 1 : e.opacity);
      }
    }
  }

  _slipstream(a) {
    const mult = this.cfg.mode.slipstream || 1;
    let best = 0;
    const pa = a.st.position;
    const fx = -Math.sin(a.st.yaw), fz = -Math.cos(a.st.yaw);
    for (const o of this.entities) {
      if (o === a) continue;
      const dx = o.st.position.x - pa.x, dz = o.st.position.z - pa.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 3 || ahead > 28) continue;
      const side = Math.abs(dx * -fz + dz * fx);
      if (side > 2.4) continue;
      best = Math.max(best, (1 - ahead / 28) * (1 - side / 2.4));
    }
    return clamp(best * 0.5 * mult, 0, 1);
  }

  _autopilot(e, dt) {
    // pista abierta: frena hasta detenerse y se queda con freno de mano (sostener el freno metería reversa)
    if (!this.track.closed) {
      const moving = Math.abs(e.physics.speed) > 0.6;
      return { throttle: 0, brake: moving ? 1 : 0, steer: 0, handbrake: !moving, nitro: false };
    }
    if (!e.autoAI) e.autoAI = new AIDriver(this.track, e.physics, { skill: 'trafico', maxSpeed: 22, seed: 7 });
    return e.autoAI.controls(dt, e.surface, []);
  }

  _respawn(e) {
    const now = performance.now();
    if (e.lastRespawn && now - e.lastRespawn < 2500) return;
    e.lastRespawn = now;
    const s = this.track.sampleAt(Math.max(0, e.surface ? e.surface.distance : 0));
    const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
    const pos = s.pos.clone();
    pos.y = s.height ?? pos.y;
    e.physics.reset(pos, yaw);
    e.surface = this.track.query(pos);
    if (e === this.local) this.ui.hud.message('DE REGRESO A LA PISTA', 'info');
  }

  _voices() {
    const cam = this.rig.camera.position;
    const list = this.entities.filter(e => e.voice).map(e => ({ e, d: e === this.local ? -1 : e.st.position.distanceToSquared(cam) }));
    list.sort((a, b) => a.d - b.d);
    list.forEach((x, i) => {
      const e = x.e;
      const v = e.voice;
      const active = i < 5;
      v.setGain && v.setGain(active ? 1 : 0);
      if (!active) return;
      if (e !== this.local) v.setPosition && v.setPosition(e.st.position);
      v.update(e.st);
    });
  }

  // ---- fantasma ----------------------------------------------------------------------------------
  _makeGhost(g) {
    const def = carDefOf(g.carId || (this.local && this.local.carDef.id));
    const model = buildCarModel(def, defaultCustom(def), { quality: this.world.quality, interior: false, ghostable: true });
    model.setOpacity && model.setOpacity(0.3);
    this.scene.add(model.group);
    this.ghost = { frames: g.frames, ms: g.ms, model, st: makeState() };
  }
  _newGhost(lapMs, frames) {
    const { trackDef, mode } = this.cfg;
    const cur = this.cfg.save.loadGhost(trackDef.id, mode.id);
    if (cur && cur.ms <= lapMs) { this._restartGhost(); return; }
    const g = { ms: lapMs, frames, carId: this.local ? this.local.carDef.id : null };
    this.cfg.save.saveGhost(trackDef.id, mode.id, g);
    if (this.ghost) { this.scene.remove(this.ghost.model.group); this.ghost.model.dispose(); this.ghost = null; }
    this._makeGhost(g);
    this._restartGhost();
  }
  _restartGhost() { if (this.ghost) this.ghost.lapStart = this.race.now(); }
  _ghostFrame(tNow) {
    const g = this.ghost;
    if (!this.local) return;
    const lapStart = this.local.prog.lapStartMs;
    const t = (tNow - lapStart) / 100;
    const i = Math.floor(t);
    if (this.local.prog.lapsDone < 1 && tNow < 0) { g.model.group.visible = false; return; }
    if (i >= g.frames.length - 1 || i < 0) { g.model.group.visible = false; return; }
    g.model.group.visible = true;
    const a = g.frames[i], b = g.frames[i + 1], k = t - i;
    g.model.group.position.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
    g.model.group.rotation.y = a[3] + wrapAngle(b[3] - a[3]) * k;
  }

  // ---- HUD ------------------------------------------------------------------------------------------
  _hud() {
    const me = this.spectate || this.local;
    if (!me) return;
    const race = this.race, p = me.prog, s = me.st, mode = this.cfg.mode;
    const list = race.standings();
    const t = race.now();
    let modeInfo = '';
    if (race.timeLimitMs) {
      const left = Math.max(0, race.timeLimitMs + race.copDelayMs - t);
      modeInfo = 'Tiempo ' + Math.floor(left / 60000) + ':' + String(Math.floor(left / 1000) % 60).padStart(2, '0');
    }
    if (mode.roles) {
      modeInfo = (p.role === 'policia' ? 'PATRULLA · atrapa fugitivos' : 'FUGITIVO · escapa') + (modeInfo ? ' · ' + modeInfo : '');
      if (p.role === 'policia' && t < race.copDelayMs) modeInfo = 'Sales en ' + Math.ceil((race.copDelayMs - t) / 1000) + ' s';
    }
    if (mode.eliminate) modeInfo = `Quedan ${list.filter(e => !e.prog.eliminated).length}`;
    if (this.spectate) modeInfo = 'Viendo a ' + this.spectate.name;
    this.ui.hud.update({
      speedKmh: Math.abs(s.speed) * 3.6, rpm: s.rpm, redline: s.redlineRpm || me.carDef.spec.redlineRpm, gear: s.gear,
      gearbox: me.physics ? me.physics.gearbox : 'auto',
      lap: Math.min(race.laps || 1, p.lapsDone + 1), laps: race.laps, position: p.position, total: list.length,
      raceMs: Math.max(0, t), lapMs: Math.max(0, t - p.lapStartMs), bestLapMs: p.bestLapMs, lastLapMs: p.lastLapMs,
      nitro: mode.nitro ? (s.nitro ?? (me.physics ? me.physics.nitro : 0)) : null, damage: me.damage, score: Math.round(p.score),
      combo: Math.round(p.comboPts), comboMult: p.comboMult, mode: mode.id, modeInfo,
      fuel: mode.wear ? p.fuel : null, tires: mode.wear ? p.tires : null,
      timeLeftMs: race.timeLimitMs ? Math.max(0, race.timeLimitMs + race.copDelayMs - t) : null,
      role: p.role || null, nitroActive: !!s.nitroActive,
      fps: this.settings.showFps ? Math.round(this.world.fps) : null,
      cars: [...this.entities.map(e => ({ x: e.st.position.x, z: e.st.position.z, color: e.color, isLocal: e === this.local })),
        ...this.traffic.map(tr => ({ x: tr.st.position.x, z: tr.st.position.z, color: '#777', isLocal: false }))],
    });
    const leader = list[0];
    this.ui.hud.standings(list.map(e => ({
      pos: e.prog.position, name: e.name, isLocal: e === this.local, color: e.color,
      gap: this._gapText(e, leader), out: e.prog.eliminated || e.prog.busted, role: e.prog.role,
    })));
  }
  _gapText(e, leader) {
    const m = this.cfg.mode;
    if (m.ranking === 'score') return Math.round(e.prog.score) + ' pts';
    if (m.ranking === 'bestLap') return e.prog.bestLapMs ? fmt(e.prog.bestLapMs) : '—';
    if (e.prog.eliminated) return 'fuera';
    if (e.prog.busted) return 'atrapado';
    if (e.prog.finished) return 'meta';
    if (e === leader) return 'líder';
    const gap = leader.prog.total - e.prog.total;
    if (this.track.closed && gap > this.track.length) return '+' + Math.floor(gap / this.track.length) + ' v';
    return '+' + Math.round(gap) + ' m';
  }

  setPaused(p) {
    if (this.cfg.net) { this.paused = false; return; } // en línea no se pausa el mundo
    if (p && !this.paused) { this.paused = true; this.pauseAt = performance.now(); }
    else if (!p && this.paused) { this.paused = false; this.race.startPerf += performance.now() - this.pauseAt; }
  }

  dispose() {
    this.ready = false;
    audio.skid(0);
    audio.ambience(null);
    for (const e of this.entities) { e.voice && e.voice.stop(); e.model.dispose(); }
    for (const t of this.traffic) t.model.dispose();
    if (this.ghost) this.ghost.model.dispose();
    this.effects && this.effects.dispose();
    this.env && this.env.dispose();
    this.track && this.track.dispose();
    this.scene.clear();
  }
}

function makeState() {
  return {
    position: new THREE.Vector3(), velocity: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, speed: 0, steerAngle: 0,
    rpm: 900, gear: 1, throttle: 0, brake: 0, nitroActive: false, nitro: 0, slipAngle: 0, drifting: false, wheelSpin: 0,
    onGround: true, surface: 'asfalto', wallHit: 0, redlineRpm: 7000, idleRpm: 900,
  };
}
function fmt(ms) { const s = ms / 1000; return Math.floor(s / 60) + ':' + (s % 60).toFixed(3).padStart(6, '0'); }
