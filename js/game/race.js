// Reglas de carrera: vueltas, posiciones, puntos, penalizaciones y la lógica de cada modo.
// Corre en todos los clientes para su auto; el anfitrión además decide eliminaciones, fin de carrera y bots.
import { prizeFor } from '../data/modes.js';
import { clamp } from '../core/util.js';

const STYLE_FACTOR = 0.15;      // fracción de puntos de derrape en modos que no son de derrape
export const PENALTY_ALCANCE = 100;
const OVERTAKE_PTS = 50;
const WALL_PTS = 20;
const RECORD_MODES = new Set(['circuito', 'formula', 'callejero', 'contrarreloj', 'ovalo', 'eliminacion', 'resistencia', 'arrancones', 'touge', 'rally']);

export function newProgress(role = null) {
  return {
    total: 0, lastDist: null, lapsDone: 0, lapStartMs: 0, lastLapMs: null, bestLapMs: null,
    finished: false, finishMs: null, dnf: false, eliminated: false, elimOrder: 0,
    score: 0, comboPts: 0, comboMult: 1, driftT: 0, noDriftT: 0,
    wrongT: 0, penaltyCd: 0, position: 0, role, busted: false, bustT: 0, busts: 0,
    fuel: 1, tires: 1, inPit: false, clean: true, topSpeed: 0, donutYaw: 0,
  };
}

export class Race {
  // opts: { track, mode, settings:{laps,…}, localId, isHost, hooks }
  // hooks: message(text, kind), say(event, params), sfx(name), send(ev, payload), onEnd(results), knock(id)
  constructor({ track, mode, settings, localId, isHost, hooks }) {
    this.track = track;
    this.mode = mode;
    this.settings = settings;
    this.localId = localId;
    this.isHost = isHost;
    this.hooks = hooks;
    this.entities = [];          // participantes (sin tráfico ni fantasma)
    this.closed = track.closed;
    this.L = track.length;
    this.laps = this._laps(settings);
    this.started = false;
    this.ended = false;
    this.startPerf = 0;
    this.firstFinishMs = null;
    this.elimCount = 0;
    this.lastPositions = new Map();
    this.timeLimitMs = mode.timeLimitS ? mode.timeLimitS * 1000 : null;
    this.copDelayMs = mode.roles ? 5000 : 0;
    this.ghostRec = [];          // cuadros de la vuelta en curso (contrarreloj)
    this.ghostRecT = 0;
    this.gateCd = new Map();
    this.results = null;
  }

  _laps(settings) {
    const m = this.mode;
    if (!this.track.closed) return 1;
    if (m.id === 'eliminacion') return 99;
    if (m.laps.max === 0) return 0; // sin vueltas (gymkhana, persecución, libre)
    return clamp(settings.laps || m.laps.def, m.laps.min, m.laps.max);
  }

  add(ent) { ent.prog = ent.prog || newProgress(ent.role); this.entities.push(ent); }
  remove(id) { this.entities = this.entities.filter(e => e.id !== id); }
  byId(id) { return this.entities.find(e => e.id === id); }
  get local() { return this.byId(this.localId); }

  start(perfStart) { this.startPerf = perfStart; this.started = true; }
  now() { return this.started ? performance.now() - this.startPerf : 0; }
  // Antes de la salida (o patrullas esperando) no se mueve el auto.
  isFrozen(ent) {
    if (!this.started) return true;
    const t = this.now();
    if (t < 0) return true;
    if (ent.prog.role === 'policia' && t < this.copDelayMs) return true;
    return false;
  }

  // ---- progreso ------------------------------------------------------------------------------
  // Para autos que simula este cliente (local y bots del anfitrión). surface = track.query del cuadro.
  updateEntity(ent, dt, surface, state) {
    const p = ent.prog;
    if (!this.started || this.ended || p.finished || p.eliminated || p.busted) { if (surface) p.lastDist = surface.distance; return; }
    const t = this.now();
    if (t < 0) { p.lastDist = surface.distance; return; }
    const isLocal = ent.id === this.localId;
    const d = surface.distance;
    if (p.lastDist == null) p.lastDist = d;
    let delta = d - p.lastDist;
    if (this.closed) { if (delta < -this.L / 2) delta += this.L; else if (delta > this.L / 2) delta -= this.L; }
    p.lastDist = d;
    const before = p.total;
    p.total += delta;
    p.topSpeed = Math.max(p.topSpeed, Math.abs(state.speed || 0));

    // vueltas
    if (this.closed) {
      const done = Math.max(0, Math.floor(p.total / this.L));
      if (done > p.lapsDone && p.total > before) {
        p.lapsDone = done;
        const lapMs = t - p.lapStartMs;
        p.lapStartMs = t;
        p.lastLapMs = lapMs;
        const best = p.bestLapMs == null || lapMs < p.bestLapMs;
        if (best) p.bestLapMs = lapMs;
        if (isLocal) this._onLocalLap(ent, lapMs, best);
        if (this.isHost && this.mode.eliminate) this._checkElimination(ent);
        if (this.laps > 0 && p.lapsDone >= this.laps) this._finish(ent, t);
        else if (isLocal && this.laps > 1 && p.lapsDone === this.laps - 1) { this.hooks.message('¡ÚLTIMA VUELTA!', 'big'); this.hooks.say('ultimaVuelta'); }
      }
    } else if (d >= this.track.finishDistance && p.total > 0) {
      p.lapsDone = 1;
      p.lastLapMs = p.bestLapMs = t;
      this._finish(ent, t);
    }

    // sentido contrario
    if (isLocal && surface.tangent && state.velocity) {
      const along = state.velocity.x * surface.tangent.x + state.velocity.z * surface.tangent.z;
      p.wrongT = along < -3 ? p.wrongT + dt : 0;
      if (p.wrongT > 2 && p.wrongT - dt <= 2) { this.hooks.message('SENTIDO CONTRARIO', 'warn'); this.hooks.say('sentidoContrario'); }
    }

    if (isLocal) {
      this._scoreDrift(ent, dt, state);
      if (state.wallHit > 0.25) this.wallPenalty(ent, state.wallHit);
      if (this.mode.ghost) this._recordGhost(dt, state);
      if (this.mode.id === 'gymkhana') this._gymkhana(ent, dt, state);
      if (this.mode.wear) this._wear(ent, dt, delta, surface, state);
      if (this.mode.roles && p.role === 'fugitivo') this._checkBust(ent, dt);
    }
    p.penaltyCd = Math.max(0, p.penaltyCd - dt);
  }

  // Progreso de autos remotos (llega por red).
  applyRemote(ent, r) {
    const p = ent.prog;
    p.total = r.total; p.lapsDone = r.lapsDone; p.score = r.score;
    p.bestLapMs = r.bestLapMs; p.lastLapMs = r.lastLapMs;
    if (r.finished && !p.finished) { p.finished = true; p.finishMs = r.finishMs; }
  }
  // Lo que se manda por red del progreso propio (o de un bot).
  packProgress(ent) {
    const p = ent.prog;
    return { total: Math.round(p.total * 10) / 10, lapsDone: p.lapsDone, score: Math.round(p.score), bestLapMs: p.bestLapMs, lastLapMs: p.lastLapMs, finished: p.finished, finishMs: p.finishMs };
  }

  _onLocalLap(ent, lapMs, best) {
    if (this.mode.ghost) this._lapGhost(lapMs);
    if (best && ent.prog.lapsDone > 1) { this.hooks.message('MEJOR VUELTA', 'good'); this.hooks.say('mejorVuelta'); }
    this.hooks.sfx('vuelta');
  }

  _finish(ent, t) {
    const p = ent.prog;
    if (p.finished) return;
    p.finished = true;
    p.finishMs = t;
    if (this.firstFinishMs == null) this.firstFinishMs = t;
    if (ent.id === this.localId || ent.isBot) this.hooks.send('fin', { id: ent.id, ms: t, prog: this.packProgress(ent) });
    if (ent.id === this.localId) {
      this.hooks.sfx('meta');
      const pos = this.positionOf(ent);
      if (this.mode.ranking === 'position' || this.mode.ranking === 'time') {
        if (pos === 1) { this.hooks.message('¡GANASTE!', 'big'); this.hooks.say('ganador', { name: ent.name }); }
        else if (pos <= 3) { this.hooks.message(`¡PODIO! LUGAR ${pos}`, 'big'); this.hooks.say('podio', { position: pos }); }
        else { this.hooks.message(`META · LUGAR ${pos}`, 'big'); this.hooks.say('meta', { position: pos }); }
      } else { this.hooks.message('¡META!', 'big'); this.hooks.say('meta', { position: pos }); }
    }
  }
  // Llegó por red que otro terminó.
  remoteFinished(id, ms, prog) {
    const e = this.byId(id);
    if (!e) return;
    if (prog) this.applyRemote(e, prog);
    if (!e.prog.finished) { e.prog.finished = true; e.prog.finishMs = ms; }
    if (this.firstFinishMs == null) this.firstFinishMs = ms;
  }

  // ---- puntos ------------------------------------------------------------------------------
  addScore(ent, n, text, kind = 'good') {
    ent.prog.score += n;
    if (ent.id === this.localId && text) this.hooks.message(text, kind);
  }
  // Alcance por detrás (regla de fantasmas).
  penalty(ent, kind = 'alcance') {
    const p = ent.prog;
    if (p.penaltyCd > 0) return false;
    if (this.now() < 4000) return false; // en la arrancada todos salen pegados: frena pero no castiga
    p.penaltyCd = 1.2;
    p.clean = false;
    p.score -= PENALTY_ALCANCE;
    p.comboPts = 0; p.comboMult = 1;
    if (ent.id === this.localId) {
      this.hooks.message(`−${PENALTY_ALCANCE} ALCANCE`, 'bad');
      this.hooks.sfx('alcance');
      this.hooks.say('alcance');
    }
    return true;
  }
  wallPenalty(ent, intensity) {
    const p = ent.prog;
    if (p.wallCd > 0) return;
    p.wallCd = 0.8;
    p.clean = false;
    p.score -= Math.round(WALL_PTS * intensity);
    if (p.comboPts > 0) {
      p.comboPts = 0; p.comboMult = 1;
      if (ent.id === this.localId) this.hooks.message('COMBO PERDIDO', 'bad');
    }
  }

  _scoreDrift(ent, dt, st) {
    const p = ent.prog;
    p.wallCd = Math.max(0, (p.wallCd || 0) - dt);
    const factor = (this.mode.id === 'drift' || this.mode.id === 'gymkhana') ? 1 : STYLE_FACTOR;
    const slip = Math.abs(st.slipAngle || 0);
    const speed = Math.abs(st.speed || 0);
    if (st.drifting && speed > 8 && slip > 0.2) {
      p.comboPts += slip * speed * dt * 12 * p.comboMult * (this._inZone(st) ? 2 : 1);
      p.driftT += dt;
      p.noDriftT = 0;
      if (p.driftT > 2.2 * p.comboMult && p.comboMult < 5) { p.comboMult++; this.hooks.sfx('punto'); }
      if (this.mode.nitro && ent.physics && ent.physics.addNitro) ent.physics.addNitro(dt * 0.04);
    } else {
      p.noDriftT += dt;
      if (p.noDriftT > 1.2 && p.comboPts > 0) {
        const pts = Math.round(p.comboPts * factor);
        if (pts >= 5) {
          p.score += pts;
          if (factor === 1) this.hooks.message(`+${pts} DRIFT ×${p.comboMult}`, 'drift');
          if (factor === 1 && p.comboMult >= 4) this.hooks.say('combo', { value: pts });
        }
        p.comboPts = 0; p.comboMult = 1; p.driftT = 0;
      }
    }
  }
  _inZone(st) {
    if (!this.track.props) return false;
    for (const pr of this.track.props) {
      if (pr.type !== 'zone') continue;
      const dx = st.position.x - pr.pos.x, dz = st.position.z - pr.pos.z;
      if (dx * dx + dz * dz < pr.radius * pr.radius) return true;
    }
    return false;
  }

  // Gymkhana: conos (restan), puertas (+250), donas alrededor de postes (+400).
  _gymkhana(ent, dt, st) {
    const p = ent.prog;
    const props = this.track.props || [];
    let nearPost = null;
    for (const pr of props) {
      if (pr.knocked) continue;
      const dx = st.position.x - pr.pos.x, dz = st.position.z - pr.pos.z;
      const d2 = dx * dx + dz * dz;
      if (pr.type === 'cone' && d2 < (pr.radius + 1.1) ** 2) {
        pr.knocked = true;
        this.hooks.knock(pr.id);
        this.addScore(ent, -100, '−100 CONO', 'bad');
        this.hooks.sfx('cono');
      } else if (pr.type === 'gate' && d2 < pr.radius * pr.radius) {
        const last = this.gateCd.get(pr.id) || -1e9;
        const t = this.now();
        if (t - last > 8000) { this.gateCd.set(pr.id, t); this.addScore(ent, 250, '+250 PUERTA'); this.hooks.sfx('punto'); }
      } else if (pr.type === 'post' && d2 < 81) nearPost = pr;
    }
    if (nearPost && st.drifting) {
      const yawRate = (st.yaw - (p.prevYaw ?? st.yaw));
      let dy = yawRate; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
      p.donutYaw += Math.abs(dy);
      if (p.donutYaw >= Math.PI * 2) { p.donutYaw -= Math.PI * 2; this.addScore(ent, 400, '+400 ¡DONA!'); this.hooks.sfx('punto'); }
    } else p.donutYaw = Math.max(0, p.donutYaw - dt * 2);
    p.prevYaw = st.yaw;
  }

  // Resistencia: gasolina, llantas y pits.
  _wear(ent, dt, delta, surface, st) {
    const p = ent.prog;
    const raceLen = Math.max(1, this.laps) * this.L;
    if (delta > 0) {
      p.fuel = Math.max(0, p.fuel - delta / (raceLen * 0.55));
      const slip = Math.abs(st.slipAngle || 0);
      p.tires = Math.max(0, p.tires - delta / (raceLen * 0.6) * (1 + slip * 3));
    }
    const wasPit = p.inPit;
    p.inPit = !!surface.inPit;
    if (p.inPit) {
      if (!wasPit) { this.hooks.message('PITS · LÍMITE 60 KM/H', 'info'); this.hooks.say('pits'); }
      if (Math.abs(st.speed) < 18) {
        p.fuel = Math.min(1, p.fuel + dt * 0.22);
        p.tires = Math.min(1, p.tires + dt * 0.22);
        if (ent.damage) ent.damage = Math.max(0, ent.damage - dt * 0.15);
      }
    }
    if (p.fuel < 0.15 && !p.fuelWarned) { p.fuelWarned = true; this.hooks.message('GASOLINA BAJA · ENTRA A PITS', 'warn'); this.hooks.say('gasolina'); }
    if (p.fuel > 0.3) p.fuelWarned = false;
  }
  // Multiplicador de agarre y filtro de controles por reglas del modo.
  gripFactor(ent) { return this.mode.wear ? 0.78 + 0.22 * ent.prog.tires : 1; }
  filterControls(ent, c) {
    if (this.mode.wear && ent.prog.fuel <= 0) c.throttle = Math.min(c.throttle, 0.12);
    if (!this.mode.nitro) c.nitro = false;
    return c;
  }
  pitSpeedLimit(ent) { return this.mode.wear && ent.prog.inPit ? 60 / 3.6 : null; }

  // Persecución: el fugitivo es atrapado si una patrulla se le mantiene pegada.
  _checkBust(ent, dt) {
    const p = ent.prog;
    let near = null;
    for (const o of this.entities) {
      if (o === ent || o.prog.role !== 'policia' || !o.st) continue;
      const dx = o.st.position.x - ent.st.position.x, dz = o.st.position.z - ent.st.position.z;
      if (dx * dx + dz * dz < 6.5 * 6.5) { near = o; break; }
    }
    if (near) {
      if (p.bustT === 0) this.hooks.sfx('sirena');
      p.bustT += dt;
      if (p.bustT > 2) {
        p.busted = true;
        this.hooks.send('bust', { id: ent.id, by: near.id });
        this.markBusted(ent.id, near.id);
      }
    } else p.bustT = Math.max(0, p.bustT - dt * 0.6);
  }
  markBusted(id, by) {
    const e = this.byId(id), c = this.byId(by);
    if (e && !e.prog.bustedDone) {
      e.prog.busted = true; e.prog.bustedDone = true; e.prog.finishMs = this.now();
      if (e.id === this.localId) { this.hooks.message('¡TE ATRAPARON!', 'bad'); this.hooks.say('atrapado'); }
      if (c) { c.prog.busts++; c.prog.score += 600; if (c.id === this.localId) { this.hooks.message('+600 ¡ATRAPADO!', 'good'); this.hooks.say('atrapado', { name: e.name }); } }
    }
  }

  // Eliminación (anfitrión): cuando el líder completa una vuelta, sale el último.
  _checkElimination(ent) {
    const active = this.entities.filter(e => !e.prog.eliminated);
    if (active.length <= 1) return;
    const leader = active.reduce((a, b) => (b.prog.total > a.prog.total ? b : a));
    if (leader !== ent) return;
    const last = active.reduce((a, b) => (b.prog.total < a.prog.total ? b : a));
    this.eliminate(last.id);
    this.hooks.send('elim', { id: last.id });
  }
  eliminate(id) {
    const e = this.byId(id);
    if (!e || e.prog.eliminated) return;
    e.prog.eliminated = true;
    e.prog.elimOrder = ++this.elimCount;
    e.prog.finishMs = this.now();
    this.hooks.message(`${e.name} ELIMINADO`, e.id === this.localId ? 'bad' : 'info');
    if (e.id === this.localId) this.hooks.say('eliminado');
    this.hooks.sfx('eliminado');
  }

  // ---- fantasma de contrarreloj ----------------------------------------------------------------
  _recordGhost(dt, st) {
    this.ghostRecT += dt;
    if (this.ghostRecT >= 0.1) {
      this.ghostRecT = 0;
      this.ghostRec.push([+st.position.x.toFixed(2), +st.position.y.toFixed(2), +st.position.z.toFixed(2), +st.yaw.toFixed(3)]);
    }
  }
  _lapGhost(lapMs) {
    const frames = this.ghostRec;
    this.ghostRec = [];
    this.ghostRecT = 0;
    if (frames.length > 5 && this.hooks.newGhost) this.hooks.newGhost(lapMs, frames);
  }

  // ---- posiciones y fin ----------------------------------------------------------------------
  standings() {
    const m = this.mode;
    const list = [...this.entities];
    const key = e => {
      const p = e.prog;
      if (m.ranking === 'score') return [p.finished ? 0 : 1, -p.score];
      if (m.ranking === 'bestLap') return [p.bestLapMs == null ? 1 : 0, p.bestLapMs ?? 0];
      if (m.ranking === 'survival') {
        if (p.role === 'fugitivo') return [p.busted ? 2 : 0, -p.score];
        return [1, -p.busts, -p.score];
      }
      if (m.eliminate) return [p.eliminated ? 1 : 0, p.eliminated ? -p.elimOrder : -p.total];
      // posición / tiempo
      if (p.finished) return [0, p.finishMs];
      return [1, -p.total];
    };
    list.sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < Math.max(ka.length, kb.length); i++) { const d = (ka[i] ?? 0) - (kb[i] ?? 0); if (d) return d; }
      return 0;
    });
    list.forEach((e, i) => { e.prog.position = i + 1; });
    return list;
  }
  positionOf(ent) { this.standings(); return ent.prog.position; }

  // Avisos de rebase del jugador local (cada medio segundo).
  trackOvertakes(dt) {
    this._otT = (this._otT || 0) + dt;
    if (this._otT < 0.5) return;
    this._otT = 0;
    const me = this.local;
    if (!me || !this.started || this.now() < 3000 || me.prog.finished) return;
    if (!['position', 'time'].includes(this.mode.ranking) && !this.mode.eliminate) return;
    const list = this.standings();
    const leaderId = list[0] && list[0].id;
    if (this._lastLeader && leaderId !== this._lastLeader && list[0].prog.total > 50) this.hooks.say('nuevoLider', { name: list[0].name });
    this._lastLeader = leaderId;
    const pos = me.prog.position;
    const prev = this._lastPos;
    this._lastPos = pos;
    if (prev && pos < prev) { this.addScore(me, OVERTAKE_PTS * (prev - pos), `+${OVERTAKE_PTS * (prev - pos)} REBASE`); this.hooks.say('subePosicion', { position: pos }); }
    else if (prev && pos > prev) this.hooks.say('bajaPosicion', { position: pos });
  }

  // El anfitrión revisa si ya terminó la carrera. Devuelve true cuando hay que publicar resultados.
  checkEnd() {
    if (!this.isHost || this.ended || !this.started) return false;
    const t = this.now();
    const m = this.mode;
    const humans = this.entities.filter(e => !e.isBot);
    if (m.id === 'libre') return false;
    if (this.timeLimitMs && t >= this.timeLimitMs + this.copDelayMs) return true;
    if (m.roles) {
      const fug = this.entities.filter(e => e.prog.role === 'fugitivo');
      return fug.length > 0 && fug.every(e => e.prog.busted);
    }
    if (m.eliminate) return this.entities.filter(e => !e.prog.eliminated).length <= 1;
    if (this.timeLimitMs) return false;
    const allDone = this.entities.every(e => e.prog.finished || e.prog.eliminated);
    if (allDone) return true;
    // todos los humanos llegaron: los bots tienen 20 s para cruzar la meta
    if (humans.length && humans.every(e => e.prog.finished)) {
      if (this.humansDoneAt == null) this.humansDoneAt = t;
      if (t - this.humansDoneAt > 20000) return true;
    }
    if (this.firstFinishMs != null && t - this.firstFinishMs > 45000) return true;
    return false;
  }

  // Tabla final (la arma el anfitrión y la manda; cada quien calcula su dinero).
  buildResults() {
    const list = this.standings();
    return list.map((e, i) => {
      const p = e.prog;
      const dnf = !(p.finished || this.mode.ranking === 'score' || this.mode.ranking === 'bestLap' || this.mode.roles || this.mode.eliminate || this.timeLimitMs);
      return {
        id: e.id, pos: i + 1, name: e.name, car: e.carDef ? `${e.carDef.brand} ${e.carDef.model}` : '', isBot: !!e.isBot,
        time: p.finished ? p.finishMs : null, best: p.bestLapMs, score: Math.round(p.score), dnf,
        clean: p.clean, role: p.role, busted: p.busted, busts: p.busts,
      };
    });
  }

  end(results) {
    this.ended = true;
    this.results = results;
  }

  // Premio del jugador local según la tabla.
  localPrize(results) {
    const row = results.find(r => r.id === this.localId);
    if (!row) return 0;
    let pos = row.pos;
    if (this.mode.roles && row.role === 'fugitivo' && !row.busted) pos = 1;
    return prizeFor(this.mode, pos, results.length, { score: row.score, clean: row.clean, dnf: row.dnf });
  }

  // Récord personal a guardar al terminar: { ms } o null.
  localRecord() {
    const me = this.local;
    if (!me || !RECORD_MODES.has(this.mode.id)) return null;
    if (this.closed) return me.prog.bestLapMs != null ? { ms: me.prog.bestLapMs } : null;
    return me.prog.finished ? { ms: me.prog.finishMs } : null;
  }
}

// Tráfico determinista (Callejero): cada cliente calcula lo mismo a partir del tiempo de carrera.
export function makeTraffic(track, count, seedRand) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const lane = (seedRand() < 0.5 ? -1 : 1) * (0.25 + seedRand() * 0.3);
    list.push({ d0: (i + 0.5) / count * track.length + 200, speed: 9 + seedRand() * 6, lane, idx: i });
  }
  return list;
}
export function trafficPose(track, tr, tMs) {
  const L = track.length;
  let d = (tr.d0 + tr.speed * Math.max(0, tMs) / 1000) % L;
  const s = track.sampleAt(d);
  const lat = tr.lane * s.halfWidth;
  return {
    x: s.pos.x + s.right.x * lat, y: s.height ?? s.pos.y, z: s.pos.z + s.right.z * lat,
    yaw: Math.atan2(-s.tangent.x, -s.tangent.z), speed: tr.speed, dist: d,
  };
}
