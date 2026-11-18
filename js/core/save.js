// Progreso del jugador: se guarda en el navegador (localStorage) y se puede exportar/importar con un código.
import { uid, hashString } from './util.js';

// ?perfil=2 usa otra partida (para probar dos jugadores en el mismo navegador).
const PROFILE = (() => { try { return (new URLSearchParams(location.search).get('perfil') || '').replace(/[^a-z0-9]/gi, '').slice(0, 12); } catch { return ''; } })();
const KEY = 'asfalto-regio-save' + (PROFILE ? '-' + PROFILE : '');
const VERSION = 1;
const START_MONEY = 25000;
const START_CAR = 'nissan-tsuru';

export const DEFAULT_SETTINGS = {
  graphics: 'lowpoly',     // 'lowpoly' | 'semi'
  renderScale: 1,          // 0.5..1 (resolución interna)
  fov: 70,
  masterVol: 0.8, musicVol: 0.45, sfxVol: 0.8, engineVol: 0.8, voiceVol: 0.9,
  narrator: true,
  gearbox: 'auto',         // 'auto' | 'manual'
  camera: 2,               // 0 cabina, 1 cofre, 2 tercera cerca, 3 tercera lejos
  mirror: true,
  showNames: true,
  showFps: false,
};

export const EMPTY_UPGRADES = { motor: 0, turbo: 0, transmision: 0, llantas: 0, suspension: 0, frenos: 0, peso: 0, nitro: 0 };

function freshData() {
  const first = { uid: uid(), carId: START_CAR, upgrades: { ...EMPTY_UPGRADES }, custom: null };
  return {
    version: VERSION,
    playerId: uid(),
    playerName: 'Piloto' + Math.floor(100 + Math.random() * 900),
    money: START_MONEY,
    garage: [first],
    currentUid: first.uid,
    settings: { ...DEFAULT_SETTINGS },
    stats: { races: 0, wins: 0, podiums: 0, moneyEarned: 0, distanceKm: 0, bestDrift: 0, busts: 0, escapes: 0 },
    records: {},           // 'pista:modo' → { ms, carId, at }
    createdAt: Date.now(),
  };
}

// Completa campos que falten (partidas viejas o códigos importados).
function normalize(d) {
  const base = freshData();
  if (!d || typeof d !== 'object') return base;
  const out = { ...base, ...d };
  out.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  out.stats = { ...base.stats, ...(d.stats || {}) };
  out.records = d.records && typeof d.records === 'object' ? d.records : {};
  out.money = Math.max(0, Math.floor(Number(d.money) || 0));
  out.garage = Array.isArray(d.garage) ? d.garage.filter(c => c && c.carId).map(c => ({
    uid: c.uid || uid(), carId: c.carId, upgrades: { ...EMPTY_UPGRADES, ...(c.upgrades || {}) }, custom: c.custom || null,
  })) : [];
  if (!out.garage.length) out.garage = base.garage;
  if (!out.garage.some(c => c.uid === out.currentUid)) out.currentUid = out.garage[0].uid;
  out.playerName = String(out.playerName || base.playerName).slice(0, 16);
  out.version = VERSION;
  return out;
}

function encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

class SaveManager {
  constructor() {
    this.listeners = new Set();
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
    this.data = normalize(raw);
    this.persist();
  }

  persist() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* sin almacenamiento */ }
    for (const fn of this.listeners) { try { fn(this.data); } catch (e) { console.error(e); } }
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  addMoney(n) {
    n = Math.round(n);
    this.data.money = Math.max(0, this.data.money + n);
    if (n > 0) this.data.stats.moneyEarned += n;
    this.persist();
  }
  spend(n) {
    n = Math.round(n);
    if (n > this.data.money) return false;
    this.data.money -= n;
    this.persist();
    return true;
  }

  // Compra un auto: descuenta, lo agrega al garaje y lo deja como actual. Devuelve la entrada o null.
  buyCar(carId, price, custom = null) {
    if (!this.spend(price)) return null;
    const entry = { uid: uid(), carId, upgrades: { ...EMPTY_UPGRADES }, custom };
    this.data.garage.push(entry);
    this.data.currentUid = entry.uid;
    this.persist();
    return entry;
  }
  sellCar(carUid, refund) {
    if (this.data.garage.length <= 1) return false;
    const i = this.data.garage.findIndex(c => c.uid === carUid);
    if (i < 0) return false;
    this.data.garage.splice(i, 1);
    if (this.data.currentUid === carUid) this.data.currentUid = this.data.garage[0].uid;
    this.addMoney(refund);
    return true;
  }
  currentCar() { return this.data.garage.find(c => c.uid === this.data.currentUid) || this.data.garage[0]; }
  setCurrent(carUid) { if (this.data.garage.some(c => c.uid === carUid)) { this.data.currentUid = carUid; this.persist(); } }
  updateCar(carUid, patch) {
    const c = this.data.garage.find(x => x.uid === carUid);
    if (!c) return;
    if (patch.upgrades) c.upgrades = { ...c.upgrades, ...patch.upgrades };
    if (patch.custom) c.custom = { ...(c.custom || {}), ...patch.custom };
    this.persist();
  }
  setSettings(partial) { this.data.settings = { ...this.data.settings, ...partial }; this.persist(); }
  setName(name) { this.data.playerName = String(name || '').trim().slice(0, 16) || this.data.playerName; this.persist(); }

  // Récord personal; devuelve true si es nuevo.
  setRecord(trackId, modeId, ms, carId) {
    const k = trackId + ':' + modeId;
    const cur = this.data.records[k];
    if (cur && cur.ms <= ms) return false;
    this.data.records[k] = { ms: Math.round(ms), carId, at: Date.now() };
    this.persist();
    return true;
  }
  getRecord(trackId, modeId) { return this.data.records[trackId + ':' + modeId] || null; }

  // Fantasma de la mejor vuelta (aparte, porque pesa más).
  saveGhost(trackId, modeId, frames) {
    try { localStorage.setItem(`${KEY}-ghost-${trackId}-${modeId}`, JSON.stringify(frames)); } catch { /* lleno */ }
  }
  loadGhost(trackId, modeId) {
    try { return JSON.parse(localStorage.getItem(`${KEY}-ghost-${trackId}-${modeId}`) || 'null'); } catch { return null; }
  }

  // Código para llevar la partida a otro navegador (como Cookie Clicker).
  exportCode() {
    const json = JSON.stringify(this.data);
    const body = encode(json);
    return 'AR1-' + hashString(json).toString(36) + '-' + body;
  }
  importCode(code) {
    try {
      const s = String(code || '').trim().replace(/\s+/g, '');
      const m = /^AR1-([0-9a-z]+)-(.+)$/.exec(s);
      if (!m) return false;
      const json = decode(m[2]);
      if (hashString(json).toString(36) !== m[1]) return false;
      this.data = normalize(JSON.parse(json));
      this.persist();
      return true;
    } catch { return false; }
  }
  reset() { this.data = freshData(); this.persist(); }
}

export const save = new SaveManager();
