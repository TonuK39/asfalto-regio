// Interfaz de Asfalto Regio (contrato «Interfaz» de DISENO.md): menús, garaje, concesionaria, salas, HUD,
// pausa, resultados, carga, modales y avisos. Navegable con mouse, teclado y control.
import { h, icon, clear, moneyPill, fmtMoney, fmtTime, fmtNum, countUp } from './dom.js';
import { Nav } from './nav.js';
import { HUD } from './hud.js';
import { CarPreview } from './preview3d.js';
import * as menus from './menus.js';
import * as shop from './shop.js';
import * as online from './online.js';
import { MODES as MODES0, modeFitsTrack as fits0 } from '../data/modes.js';
import { save as save0, EMPTY_UPGRADES } from '../core/save.js';

const BASE_TIPS = [
  'Mantén Shift o N (X en el control) para soltar el nitro en las rectas.',
  'En caja manual cambia con E / Q (RB / LB) cuando se encienden todas las luces del tacómetro.',
  'Si te sales o te volteas, presiona R (Back en el control) para regresar a la pista.',
  'Los autos no chocan entre sí, pero si alcanzas a uno por detrás pierdes puntos y velocidad: rebasa por un lado.',
  'Los golpes contra el muro dañan la carrocería y le quitan potencia al motor.',
  'C (Y en el control) cambia la cámara; M muestra u oculta el retrovisor; B mira hacia atrás.',
  'Con el freno de mano (Espacio o A) provocas derrapes en las curvas cerradas.',
  'En el garaje puedes probar pinturas y rines en vivo antes de pagar.',
  'Guarda tu código de partida en Ajustes › Código de partida para no perder tu progreso.',
];

function normalizeDeps(deps) {
  const d = { ...deps };
  d.save = deps.save || save0;
  d.CARS = deps.CARS || [];
  d.CAR_BY_ID = deps.CAR_BY_ID || Object.fromEntries(d.CARS.map(c => [c.id, c]));
  d.COUNTRIES = deps.COUNTRIES || {};
  d.UPGRADES = deps.UPGRADES || {};
  d.CUSTOM_OPTIONS = deps.CUSTOM_OPTIONS || {};
  d.TRACKS = deps.TRACKS || [];
  d.TRACK_BY_ID = deps.TRACK_BY_ID || Object.fromEntries(d.TRACKS.map(t => [t.id, t]));
  d.MODES = deps.MODES || MODES0;
  d.MODE_BY_ID = deps.MODE_BY_ID || Object.fromEntries(d.MODES.map(m => [m.id, m]));
  d.modeFitsTrack = deps.modeFitsTrack || fits0;
  if (typeof d.defaultCustom !== 'function') {
    d.defaultCustom = def => ({ paint: (def && def.color) || '#c81e1e', finish: 'brillante', vinyl: 'ninguno', vinylColor: '#ffffff', number: null, rims: 'serie', rimColor: '#c0c4cc', caliper: '#cc0000', spoiler: 'ninguno', bodykit: 0, tint: 0, underglow: null, smoke: '#ffffff', lights: '#ffffff', plate: 'NL-' + String(Math.floor(Math.random() * 900 + 100)), ride: 1 });
  }
  return d;
}

export class UI {
  constructor(root, deps = {}) {
    this.root = root;
    this.d = normalizeDeps(deps);
    this.save = this.d.save;
    this.deps = deps;
    root.classList.add('ar-root');
    this.hudEl = h('div.ar-hud');
    this.screensEl = h('div.ar-screens');
    this.modalEl = h('div.ar-modals');
    this.toastEl = h('div.ar-toasts', { 'aria-live': 'polite' });
    root.append(this.hudEl, this.screensEl, this.modalEl, this.toastEl);
    this.screen = null;
    this.modals = [];
    this.loading = null;
    this.hud = new HUD(this, this.hudEl);
    this.nav = new Nav(this);
    this.save.onChange(() => this._onSave());
  }

  // ---- utilidades internas -------------------------------------------------------------------
  get preview() { return this._preview || (this._preview = new CarPreview(this)); }
  quality() {
    const q = this.deps.quality;
    if (typeof q === 'function') return q();
    return (this.save.data.settings && this.save.data.settings.graphics) || q || 'lowpoly';
  }
  stats(def, upg) {
    if (!def) return {};
    try { if (this.d.carStats) return this.d.carStats(def, { ...EMPTY_UPGRADES, ...(upg || {}) }) || {}; } catch (e) { console.warn('[ui] carStats:', e); }
    const s = def.spec || {}, t = def.tier || 2;
    const pw = s.powerKw && s.massKg ? s.powerKw / s.massKg : 0.08 + t * 0.03;
    return { velocidad: Math.min(10, 2 + t * 1.5), aceleracion: Math.min(10, pw * 40), manejo: Math.min(10, (s.tireGrip || 1) * 6), frenado: Math.min(10, (s.brakeG || 1) * 5.5) };
  }
  spec(def, upg) {
    if (!def) return null;
    try { if (this.d.computeSpec) return this.d.computeSpec(def, { ...EMPTY_UPGRADES, ...(upg || {}) }, 0); } catch (e) { console.warn('[ui] computeSpec:', e); }
    return def.spec || null;
  }
  sfx(name) {
    try { const a = this.d.audio; if (a && a.sfx) a.sfx(name); } catch { /* sin audio */ }
  }

  // Marco común de pantalla: atrás, títulos, dinero y ayudas de botones.
  frame({ name, title, kicker, onBack }) {
    const back = onBack ? h('button.ar-back', { type: 'button', 'data-fkey': 'back', onclick: () => onBack() }, icon('back'), h('span', 'Atrás')) : null;
    const head = h('header.ar-head', back, h('div.ar-titles', kicker ? h('div.ar-kicker', kicker) : null, h('h1.ar-title', title)), moneyPill(this.save.data.money));
    const body = h('div.ar-body');
    const foot = h('footer.ar-hints');
    const el = h('section.ar-screen.sc-' + name, head, body, foot);
    return { el, head, body, foot };
  }

  _activeLayer() {
    if (this.modals.length) { const m = this.modals[this.modals.length - 1]; return { el: m.el, back: m.back }; }
    if (this.loading) return null;
    if (this.screen) return { el: this.screen.el, back: this.screen.back, start: this.screen.start };
    return null;
  }

  _dropScreen() {
    const old = this.screen;
    if (!old) return;
    this.screen = null;
    try { old.dispose && old.dispose(); } catch (e) { console.error(e); }
    if (old.el.contains(document.activeElement)) document.activeElement.blur();
    old.el.classList.add('leaving');
    setTimeout(() => old.el.remove(), 260);
    this.root.classList.remove('ar-menu', 'ar-paused');
  }

  _setScreen(obj) {
    this._hideLoading();
    this._dropScreen();
    this.screen = obj;
    this.screensEl.append(obj.el);
    this.root.classList.add(obj.overHud ? 'ar-paused' : 'ar-menu');
    if (obj.foot) this.nav.renderHints(obj.foot, obj.hints);
    this.nav.refresh();
    if (!this.modals.length) this.nav.focusDefault();
    return obj;
  }

  _onSave() {
    const m = fmtMoney(this.save.data.money);
    this.root.querySelectorAll('.ar-money-v').forEach(el => { el.textContent = m; });
    if (this.screen && this.screen.onSave) { try { this.screen.onSave(); } catch (e) { console.error(e); } }
  }

  _onDevice() {
    if (this.screen && this.screen.foot) this.nav.renderHints(this.screen.foot, this.screen.hints);
  }

  // ---- pantallas del contrato -----------------------------------------------------------------
  showMain(hd = {}) { this._lastMain = hd; return void this._setScreen(menus.mainScreen(this, hd)); }
  showDealer(hd = {}) { this._setScreen(shop.dealerScreen(this, hd)); }
  showGarage(hd = {}) { this._setScreen(shop.garageScreen(this, hd)); }
  showSettings(hd = {}) { this._setScreen(menus.settingsScreen(this, hd)); }
  showSaveCode(hd = {}) { this._setScreen(menus.saveCodeScreen(this, hd)); }
  showRecords(hd = {}) { this._setScreen(menus.recordsScreen(this, hd)); }
  showControls(hd = {}) { this._setScreen(menus.controlsScreen(this, hd)); }
  showLobby(hd = {}) { this._setScreen(online.lobbyScreen(this, hd)); }
  showPractice(hd = {}) { this._setScreen(online.practiceScreen(this, hd)); }
  showRoom(hd = {}) { this._roomView = null; this._setScreen(online.roomScreen(this, hd)); }
  updateRoom(view) {
    this._roomView = view;
    if (this.screen && this.screen.name === 'room') this.screen.update(view);
  }

  showLoading(text, progress) {
    if (!this.loading) {
      const bar = h('i.ar-load-fill'), pct = h('b.ar-load-pct'), txt = h('div.ar-load-txt'), tip = h('p.ar-load-tip');
      const el = h('div.ar-loading', h('div.ar-load-in',
        h('div.ar-logo.small', h('span.l1', 'ASFALTO'), h('span.l2', 'REGIO')),
        txt, h('div.ar-load-bar', bar), pct,
        h('div.ar-load-tipbox', h('span.ar-lbl', icon('info'), 'Consejo'), tip)));
      const tips = BASE_TIPS.concat((this.d.MODES || []).filter(m => m.desc).map(m => `${m.name}: ${m.desc}`));
      let ti = Math.floor(Math.random() * tips.length);
      const nextTip = () => { tip.classList.remove('in'); void tip.offsetWidth; tip.textContent = tips[ti++ % tips.length]; tip.classList.add('in'); };
      nextTip();
      this.loading = { el, bar, pct, txt, timer: setInterval(nextTip, 5000) };
      this.root.append(el);
      if (document.activeElement && this.root.contains(document.activeElement)) document.activeElement.blur();
      this.nav.refresh();
    }
    const L = this.loading;
    if (text != null) L.txt.textContent = text;
    const indet = progress == null || !isFinite(progress);
    L.el.classList.toggle('indet', indet);
    if (!indet) {
      const p = Math.max(0, Math.min(1, progress));
      L.bar.style.transform = `scaleX(${p})`;
      L.pct.textContent = Math.round(p * 100) + '%';
    } else L.pct.textContent = '';
  }
  _hideLoading() {
    if (!this.loading) return;
    const L = this.loading;
    this.loading = null;
    clearInterval(L.timer);
    L.el.classList.add('leaving');
    setTimeout(() => L.el.remove(), 300);
    this.nav.refresh();
  }

  showPause(hd = {}) {
    const resume = () => hd.onResume && hd.onResume();
    const settings = () => hd.onSettings ? hd.onSettings() : this.showSettings({ onBack: () => this.showPause(hd) });
    const quit = async () => {
      if (await this.confirm({ title: 'Salir de la carrera', text: '¿Salir al menú? Perderás el progreso de esta carrera.', ok: 'Salir', danger: true })) hd.onQuit && hd.onQuit();
    };
    const b = (ic, t, fn, cls = '') => h('button.ar-pbtn' + cls, { type: 'button', onclick: fn, 'data-fkey': 'p-' + t }, icon(ic), h('span', t));
    const foot = h('footer.ar-hints');
    const cont = b('play', 'Continuar', resume, '.primary');
    cont.dataset.autofocus = '';
    const el = h('section.ar-screen.sc-pause', h('div.ar-pausebox',
      h('div.ar-kicker', 'Carrera en pausa'), h('h1.ar-title', 'PAUSA'),
      h('div.ar-pbtns', cont, hd.onRestart ? b('restart', 'Reiniciar', () => hd.onRestart()) : null, b('gear', 'Ajustes', settings),
        b('gamepad', 'Controles', () => this.showControls({ onBack: () => this.showPause(hd) })), b('exit', 'Salir al menú', quit, '.danger')),
      foot));
    this._setScreen({ name: 'pause', el, foot, back: resume, start: true, overHud: true, hints: [['move', 'Mover'], ['ok', 'Aceptar'], ['back', 'Continuar']] });
  }

  showResults(view = {}, hd = {}) {
    const d = this.d;
    const mode = typeof view.mode === 'string' ? d.MODE_BY_ID[view.mode] : view.mode;
    const rows = [...(view.rows || [])].sort((a, b) => (a.pos || 99) - (b.pos || 99));
    const hasScore = (mode && mode.ranking === 'score') || rows.some(r => r.score > 0);
    const me = rows.find(r => r.isLocal);
    const timeTxt = r => r.dnf ? 'No terminó' : r.busted ? 'Atrapado' : r.out ? 'Eliminado' : typeof r.time === 'number' ? fmtTime(r.time) : (r.time || '—');
    const head = h('div.ar-res-row.head', h('span', 'Pos'), h('span', 'Piloto'), h('span', 'Auto'), h('span', 'Tiempo'), h('span', 'Mejor vuelta'), hasScore ? h('span', 'Puntos') : null, h('span', 'Ganancia'));
    const list = h('div.ar-res-list', head);
    rows.forEach((r, i) => {
      const money = h('b.ar-res-money');
      const role = r.role === 'policia' ? h('span.ar-role.cop', icon('shield'), 'Policía') : r.role === 'fugitivo' ? h('span.ar-role.fug', icon('mask'), 'Fugitivo') : null;
      list.append(h('div.ar-res-row' + (r.isLocal ? '.me' : '') + (r.pos <= 3 ? '.p' + r.pos : ''), { style: { animationDelay: (0.15 + i * 0.07) + 's' } },
        h('b.ar-res-pos', String(r.pos ?? i + 1)),
        h('span.ar-res-name', h('b', r.name || '—'), role),
        h('span.dim', r.car || ''),
        h('span.ar-res-t', timeTxt(r)),
        h('span.dim', typeof r.best === 'number' ? fmtTime(r.best) : '—'),
        hasScore ? h('span', fmtNum(r.score)) : null,
        money));
      if (typeof r.money === 'number') countUp(money, r.money, { delay: 500 + i * 70, ms: 1100 });
      else money.textContent = '—';
    });
    const earned = h('b.ar-res-earned');
    const posTxt = me ? (rows.length > 1 ? `Terminaste en ${me.pos}.º lugar de ${rows.length}` : 'Carrera terminada') : 'Carrera terminada';
    const cont = h('button.ar-btn.primary.ar-go', { type: 'button', 'data-autofocus': true, onclick: () => hd.onContinue && hd.onContinue() }, h('span', 'Continuar'), icon('right'));
    const foot = h('footer.ar-hints');
    const el = h('section.ar-screen.sc-results', h('div.ar-resbox',
      h('div.ar-res-head', h('div', h('div.ar-kicker', [mode && mode.name, view.track].filter(Boolean).join(' · ') || 'Resultados'), h('h1.ar-title', 'Resultados')),
        h('div.ar-res-me', h('span', posTxt), me && me.pos === 1 && rows.length > 1 ? h('b.win', icon('trophy'), '¡Ganaste!') : null)),
      h('div.ar-panel.ar-res-table', list),
      h('div.ar-res-foot', h('div.ar-res-earn', h('span.ar-lbl', 'Ganaste'), earned, view.newRecord ? h('span.ar-newrec', icon('star'), 'Nuevo récord') : null), cont),
      foot));
    countUp(earned, view.earned || 0, { delay: 600, ms: 1500, onDone: () => { if (view.earned > 0) this.sfx('compra'); } });
    this._setScreen({ name: 'results', el, foot, back: null, hints: [['ok', 'Continuar']] });
  }

  hideAll() {
    this._dropScreen();
    while (this.modals.length) this.modals[this.modals.length - 1].close(false);
    this._hideLoading();
    this.root.classList.remove('ar-menu', 'ar-paused');
    this.nav.refresh();
  }

  toast(text, kind = '') {
    const el = h('div.ar-toast' + (kind ? '.' + kind : ''), text);
    this.toastEl.append(el);
    while (this.toastEl.children.length > 4) this.toastEl.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 3200);
  }

  // ---- extras: modales ----------------------------------------------------------------------------
  // confirm({ title, text, ok, cancel, danger }) → Promise<boolean>
  confirm({ title = '¿Seguro?', text = '', ok = 'Aceptar', cancel = 'Cancelar', danger = false, alert = false } = {}) {
    return new Promise(res => {
      const prev = document.activeElement;
      const m = {};
      const close = v => {
        const i = this.modals.indexOf(m);
        if (i < 0) return;
        this.modals.splice(i, 1);
        m.el.classList.add('leaving');
        setTimeout(() => m.el.remove(), 200);
        this.nav.refresh();
        if (prev && prev.isConnected && !this.modals.length) prev.focus({ preventScroll: true });
        else if (!this.modals.length) requestAnimationFrame(() => this.nav.focusDefault());
        res(v);
      };
      const okB = h('button.ar-btn' + (danger ? '.danger' : '.primary'), { type: 'button', onclick: () => close(true) }, h('span', ok));
      const noB = alert ? null : h('button.ar-btn.ghost', { type: 'button', onclick: () => close(false) }, h('span', cancel));
      (danger && noB ? noB : okB).dataset.autofocus = '';
      m.el = h('div.ar-modal', { role: 'dialog', 'aria-modal': 'true' },
        h('div.ar-modal-box.ar-panel', h('h2.ar-modal-t', title), text ? h('p.ar-p', text) : null, h('div.ar-actions', noB, okB)));
      m.el.addEventListener('mousedown', e => { if (e.target === m.el) close(false); });
      m.back = () => close(false);
      m.close = close;
      this.modals.push(m);
      this.modalEl.append(m.el);
      this.nav.refresh();
      this.nav.focusDefault();
    });
  }
  alert({ title = 'Aviso', text = '', ok = 'Entendido' } = {}) { return this.confirm({ title, text, ok, alert: true }); }
}
