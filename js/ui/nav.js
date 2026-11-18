// Navegación de menús con teclado y control: foco propio por geometría (flechas / D-pad / stick), Tab, Enter / A,
// Esc / B = atrás, LB/RB (o Q/E) = cambiar pestaña. El sondeo del control solo corre mientras hay un menú visible.
import { h } from './dom.js';

const SEL = 'button, input, textarea, select, a[href], [tabindex]';
const TEXT_TYPES = new Set(['text', 'search', 'email', 'password', 'number', 'url', 'tel']);
export const isTyping = el => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_TYPES.has(el.type)) || el.isContentEditable);
const gap = (a0, a1, b0, b1) => Math.max(0, b0 - a1, a0 - b1);

export class Nav {
  constructor(ui) {
    this.ui = ui;
    this.device = 'keyboard';
    this.running = false;
    this.prev = {};
    this.rep = {};
    this.armed = {};
    this.lastHover = 0;
    this._loop = this._loop.bind(this);
    window.addEventListener('keydown', e => this._onKey(e), true);
    ui.root.addEventListener('mouseover', e => this._onOver(e));
    ui.root.addEventListener('click', e => this._onClick(e), true);
    ui.root.addEventListener('mousemove', e => { if (this.device !== 'keyboard' && (e.movementX || e.movementY)) this._setDevice('keyboard'); });
    window.addEventListener('gamepadconnected', () => this.refresh());
    // Clase propia de foco: el resaltado se ve aunque la ventana no tenga el foco del sistema.
    ui.root.addEventListener('focusin', e => this._mark(e.target));
    ui.root.addEventListener('focusout', e => { e.target.classList.remove('is-focus'); if (this.cur === e.target) this.cur = null; });
    ui.root.dataset.device = this.device;
  }

  _mark(el) {
    if (this.cur && this.cur !== el) this.cur.classList.remove('is-focus');
    this.cur = el;
    if (el && el.classList) el.classList.add('is-focus');
  }

  layer() { return this.ui._activeLayer(); }

  items(root) {
    if (!root) return [];
    const out = [];
    for (const el of root.querySelectorAll(SEL)) {
      if (el.disabled || el.tabIndex < 0) continue;
      if (el.closest('[inert], .is-hidden, .leaving, [hidden]')) continue;
      if (!el.getClientRects().length) continue;
      out.push(el);
    }
    return out;
  }

  // Arranca o detiene el sondeo según haya un menú activo.
  refresh() {
    const L = this.layer();
    if (L && !this.running) this._start();
    else if (!L && this.running) this._stop();
  }

  focus(el, sound = true) {
    if (!el) return;
    el.focus({ preventScroll: true });
    this._mark(el);
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch { /* viejo */ }
    if (sound) this.ui.sfx('hover');
  }

  focusDefault(sound = false) {
    const L = this.layer();
    if (!L) return;
    const items = this.items(L.el);
    const pref = [...L.el.querySelectorAll('[data-autofocus]')].find(e => items.includes(e));
    this.focus(pref || items[0], sound);
  }

  // Restaura el foco a un elemento con data-fkey (tras re-dibujar una lista).
  restore(fkey) {
    if (!fkey) return false;
    const L = this.layer();
    if (!L) return false;
    const el = L.el.querySelector(`[data-fkey="${CSS.escape(fkey)}"]`);
    if (el && this.items(L.el).includes(el)) { el.focus({ preventScroll: true }); this._mark(el); return true; }
    return false;
  }

  move(dir) {
    const L = this.layer();
    if (!L) return;
    const items = this.items(L.el);
    if (!items.length) return;
    const a = document.activeElement;
    if (!items.includes(a)) { this.focusDefault(true); return; }
    const r = a.getBoundingClientRect();
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    let best = null, bs = Infinity;
    for (const el of items) {
      if (el === a || el.contains(a) || a.contains(el)) continue;
      const q = el.getBoundingClientRect();
      if (!q.width && !q.height) continue;
      const qx = (q.left + q.right) / 2, qy = (q.top + q.bottom) / 2;
      let main, orth, off;
      if (dir === 'down') {
        if (qy <= cy + 1 || q.bottom <= r.bottom || q.top < cy) continue;
        main = Math.max(0, q.top - r.bottom); orth = gap(r.left, r.right, q.left, q.right); off = Math.abs(q.left - r.left);
      } else if (dir === 'up') {
        if (qy >= cy - 1 || q.top >= r.top || q.bottom > cy) continue;
        main = Math.max(0, r.top - q.bottom); orth = gap(r.left, r.right, q.left, q.right); off = Math.abs(q.left - r.left);
      } else if (dir === 'right') {
        if (qx <= cx + 1 || q.right <= r.right || q.left < cx) continue;
        main = Math.max(0, q.left - r.right); orth = gap(r.top, r.bottom, q.top, q.bottom); off = Math.abs(qy - cy);
      } else {
        if (qx >= cx - 1 || q.left >= r.left || q.right > cx) continue;
        main = Math.max(0, r.left - q.right); orth = gap(r.top, r.bottom, q.top, q.bottom); off = Math.abs(qy - cy);
      }
      // primero los que se traslapan en el eje perpendicular (misma fila / columna)
      const s = (orth > 0 ? 1e5 : 0) + main + orth * 3 + off * 0.08;
      if (s < bs) { bs = s; best = el; }
    }
    if (best) this.focus(best);
  }

  cycle(d) {
    const L = this.layer();
    if (!L) return;
    const items = this.items(L.el);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    this.focus(items[i < 0 ? 0 : (i + d + items.length) % items.length]);
  }

  _back(L) {
    if (!L || !L.back) return;
    this.ui.sfx('click');
    L.back();
  }

  _tab(d) {
    const L = this.layer();
    if (!L) return;
    L.el.dispatchEvent(new CustomEvent('ar-tab', { detail: d }));
  }

  _activate() {
    const L = this.layer();
    if (!L) return;
    const a = document.activeElement;
    if (!a || !L.el.contains(a) || a === L.el) { this.focusDefault(true); return; }
    if (a.arActivate) { this.ui.sfx('click'); a.arActivate(); return; }
    if (isTyping(a) || a.type === 'range') return;
    a.click();
  }

  _onKey(e) {
    const L = this.layer();
    if (!L || e.isComposing) return;
    if (!this.ui._unlocked) { this.ui._unlocked = true; try { this.ui.d.audio && this.ui.d.audio.unlock && this.ui.d.audio.unlock(); } catch { /* nada */ } }
    const a = document.activeElement;
    const inLayer = a && a !== L.el && L.el.contains(a);
    const typing = inLayer && isTyping(a);
    const k = e.key;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'Escape') {
      stop();
      if (!e.repeat) { this._setDevice('keyboard'); this._back(L); }
      return;
    }
    if (k === 'Tab') { stop(); this._setDevice('keyboard'); this.cycle(e.shiftKey ? -1 : 1); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      if (a && a.tagName === 'TEXTAREA') return;
      stop(); this._setDevice('keyboard');
      this.move(k === 'ArrowUp' ? 'up' : 'down');
      return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      if (typing) return;
      stop(); this._setDevice('keyboard');
      const d = k === 'ArrowLeft' ? -1 : 1;
      if (inLayer && a.arStep) a.arStep(d); else this.move(d < 0 ? 'left' : 'right');
      return;
    }
    if (!typing && (k === 'q' || k === 'Q' || k === 'e' || k === 'E') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      stop(); this._tab(k.toLowerCase() === 'q' ? -1 : 1);
      return;
    }
    if ((k === 'Enter' || k === ' ') && !inLayer && !typing) { stop(); this.focusDefault(true); }
  }

  _onOver(e) {
    const L = this.layer();
    if (!L) return;
    const t = e.target.closest && e.target.closest(SEL);
    if (!t || !L.el.contains(t) || t.disabled || t.tabIndex < 0) return;
    const a = document.activeElement;
    if (t === a) return;
    if (isTyping(a) && L.el.contains(a)) return; // no robar el foco mientras se escribe
    t.focus({ preventScroll: true });
    this._mark(t);
    const now = performance.now();
    if (now - this.lastHover > 45) { this.lastHover = now; this.ui.sfx('hover'); }
  }

  _onClick(e) {
    const b = e.target.closest && e.target.closest('button, .ar-step, [role="button"]');
    if (!b || b.disabled) return;
    if (!this.ui._unlocked) { this.ui._unlocked = true; try { this.ui.d.audio && this.ui.d.audio.unlock && this.ui.d.audio.unlock(); } catch { /* nada */ } }
    this.ui.sfx('click');
  }

  _setDevice(dev) {
    if (this.device === dev) return;
    this.device = dev;
    this.ui.root.dataset.device = dev;
    this.ui._onDevice();
  }

  // ---- control (Gamepad API) ----------------------------------------------------------------
  _read() {
    const o = { up: false, down: false, left: false, right: false, a: false, b: false, start: false, lb: false, rb: false };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const B = i => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      o.up = o.up || B(12) || ay < -0.6;
      o.down = o.down || B(13) || ay > 0.6;
      o.left = o.left || B(14) || ax < -0.6;
      o.right = o.right || B(15) || ax > 0.6;
      o.a = o.a || B(0); o.b = o.b || B(1); o.start = o.start || B(9);
      o.lb = o.lb || B(4); o.rb = o.rb || B(5);
    }
    return o;
  }
  _start() {
    this.running = true;
    this.prev = this._read();   // lo que ya estaba presionado no cuenta
    this.armed = {};
    this.rep = {};
    this.raf = requestAnimationFrame(this._loop);
  }
  _stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  _loop(t) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._loop);
    if (!this.layer()) { this._stop(); return; }
    const s = this._read(), p = this.prev;
    this.prev = s;
    let any = false;
    for (const d of ['up', 'down', 'left', 'right']) {
      if (!s[d]) continue;
      if (!p[d]) { any = true; this._dir(d); this.rep[d] = t + 380; }
      else if (t >= this.rep[d]) { this._dir(d); this.rep[d] = t + 110; }
    }
    if (s.a && !p.a) { any = true; this._setDevice('gamepad'); this._activate(); }
    // B y Start actúan al soltar (así el botón no «se filtra» al juego al cerrar la pausa)
    for (const k of ['b', 'start']) {
      if (s[k] && !p[k]) { this.armed[k] = true; any = true; }
      if (!s[k] && p[k] && this.armed[k]) {
        this.armed[k] = false;
        this._setDevice('gamepad');
        const L = this.layer();
        if (k === 'b' || (L && L.start)) this._back(L);
      }
    }
    if (s.lb && !p.lb) { any = true; this._tab(-1); }
    if (s.rb && !p.rb) { any = true; this._tab(1); }
    if (any) this._setDevice('gamepad');
  }
  _dir(d) {
    this._setDevice('gamepad');
    const L = this.layer();
    if (!L) return;
    const a = document.activeElement;
    const inLayer = a && a !== L.el && L.el.contains(a);
    if ((d === 'left' || d === 'right') && inLayer && a.arStep) a.arStep(d === 'left' ? -1 : 1);
    else this.move(d);
  }

  // ---- ayudas de botones al pie de cada pantalla ---------------------------------------------
  // list: [['ok','Aceptar'], ['back','Atrás'], ['tabs','Pestañas'], ['move','Mover'], ['adjust','Ajustar']]
  renderHints(el, list) {
    if (!el) return;
    el.textContent = '';
    const pad = this.device === 'gamepad';
    const cap = (txt, cls = '') => h('kbd.ar-kbd' + (cls ? '.' + cls : ''), txt);
    for (const [k, label] of list || []) {
      let keys;
      if (k === 'ok') keys = pad ? [cap('A', 'gp gp-a')] : [cap('Enter')];
      else if (k === 'back') keys = pad ? [cap('B', 'gp gp-b')] : [cap('Esc')];
      else if (k === 'tabs') keys = pad ? [cap('LB', 'gp-sh'), cap('RB', 'gp-sh')] : [cap('Q'), cap('E')];
      else if (k === 'move') keys = pad ? [cap('D-pad', 'gp-sh')] : [cap('↑↓←→')];
      else if (k === 'adjust') keys = pad ? [cap('◄ ►', 'gp-sh')] : [cap('←'), cap('→')];
      else if (k === 'start') keys = pad ? [cap('Start', 'gp-sh')] : [cap('Esc')];
      else keys = [cap(k)];
      el.append(h('span.ar-hint', keys, h('span', label)));
    }
  }
}
