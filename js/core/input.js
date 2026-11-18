// Entrada del jugador: teclado (con suavizado de dirección) y control (Gamepad API, mapeo estándar).
// Las acciones de un toque (shiftUp, shiftDown, camera, reset, pause, mirror) valen true solo en el update()
// en que se presionaron.

// Teclas que se mantienen (por e.code, así funciona igual con teclado latinoamericano o español).
const HOLD = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  nitro: ['ShiftLeft', 'ShiftRight', 'KeyN'],
  lookBack: ['KeyB'],
  horn: ['KeyH'],
};
// Teclas de un toque.
const TAP = {
  KeyE: 'shiftUp', KeyQ: 'shiftDown', KeyC: 'camera', KeyR: 'reset', Escape: 'pause', KeyP: 'pause', KeyM: 'mirror',
};
const TAP_ACTIONS = ['shiftUp', 'shiftDown', 'camera', 'reset', 'pause', 'mirror'];
// Teclas cuyo comportamiento normal del navegador (desplazar la página, «clic» en botones) se bloquea al jugar.
const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

// Botones del mapeo estándar de la Gamepad API.
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const PAD_TAP = [[B.RB, 'shiftUp'], [B.LB, 'shiftDown'], [B.Y, 'camera'], [B.BACK, 'reset'], [B.START, 'pause'], [B.UP, 'mirror']];

// Suavizado de la dirección con teclado (unidades de dirección por segundo).
const STEER_RISE = 5.5;      // de 0 a tope en ~0.18 s
const STEER_RETURN = 9;      // regreso al centro en ~0.11 s
const STEER_SWAP = 11;       // de un lado al otro
const THR_RISE = 8, THR_FALL = 14, BRK_RISE = 9, BRK_FALL = 16;
const STICK_DEAD = 0.12, TRIGGER_DEAD = 0.05;

function blankState() {
  return {
    throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, lookBack: false, horn: false,
    shiftUp: false, shiftDown: false, camera: false, reset: false, pause: false, mirror: false,
  };
}

function toward(cur, target, rate, dt) {
  const d = target - cur, m = rate * dt;
  return Math.abs(d) <= m ? target : cur + Math.sign(d) * m;
}

function isTyping(el) {
  if (!el || !el.tagName) return false;
  const t = el.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable === true;
}

function btn(gp, i) {
  const b = gp.buttons && gp.buttons[i];
  if (!b) return 0;
  return typeof b === 'object' ? (typeof b.value === 'number' && b.value > 0 ? b.value : (b.pressed ? 1 : 0)) : Number(b) || 0;
}

export class Input {
  constructor(target = window) {
    this.target = target;
    this.enabled = true;
    this.device = 'teclado';
    this.state = blankState();
    this._down = new Set();
    this._taps = new Set();
    this._kSteer = 0; this._kThr = 0; this._kBrk = 0;
    this._padPrev = [];
    this._padIndex = -1;

    this._onKeyDown = e => {
      if (isTyping(e.target) || (typeof document !== 'undefined' && isTyping(document.activeElement))) return;
      this._down.add(e.code);
      if (!e.repeat && TAP[e.code]) this._taps.add(TAP[e.code]);
      this.device = 'teclado';
      if (this.enabled && BLOCK.has(e.code)) e.preventDefault();
    };
    this._onKeyUp = e => {
      this._down.delete(e.code);
      if (this.enabled && BLOCK.has(e.code) && !isTyping(e.target)) e.preventDefault();
    };
    this._onBlur = () => { this._down.clear(); };
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    if (typeof window !== 'undefined') window.addEventListener('blur', this._onBlur);
  }

  _held(action) {
    const codes = HOLD[action];
    for (let i = 0; i < codes.length; i++) if (this._down.has(codes[i])) return true;
    return false;
  }

  _pad() {
    let pads = null;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { pads = null; }
    if (!pads) return null;
    let gp = this._padIndex >= 0 ? pads[this._padIndex] : null;
    if (!gp || !gp.connected) {
      gp = null;
      for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { gp = pads[i]; this._padIndex = i; break; }
    }
    return gp;
  }

  update(dt = 1 / 60) {
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.1);
    const st = this.state;
    for (const a of TAP_ACTIONS) st[a] = false;

    const gp = this._pad();
    const prev = this._padPrev;
    const now = [];
    if (gp) for (let i = 0; i < gp.buttons.length; i++) now[i] = btn(gp, i) > 0.5;

    if (!this.enabled) {
      st.throttle = 0; st.brake = 0; st.steer = 0;
      st.handbrake = st.nitro = st.lookBack = st.horn = false;
      this._kSteer = this._kThr = this._kBrk = 0;
      this._taps.clear();
      this._padPrev = now;
      return st;
    }

    // --- teclado
    const tgt = (this._held('right') ? 1 : 0) - (this._held('left') ? 1 : 0);
    const ks = this._kSteer;
    let rate;
    if (tgt === 0) rate = STEER_RETURN;
    else if (ks !== 0 && Math.sign(ks) !== tgt) rate = STEER_SWAP;
    else rate = STEER_RISE;
    this._kSteer = toward(ks, tgt, rate, dt);
    this._kThr = this._held('throttle') ? toward(this._kThr, 1, THR_RISE, dt) : toward(this._kThr, 0, THR_FALL, dt);
    this._kBrk = this._held('brake') ? toward(this._kBrk, 1, BRK_RISE, dt) : toward(this._kBrk, 0, BRK_FALL, dt);

    let steer = this._kSteer, thr = this._kThr, brk = this._kBrk;
    let hb = this._held('handbrake'), nitro = this._held('nitro'), look = this._held('lookBack'), horn = this._held('horn');

    // --- control
    if (gp) {
      let x = (gp.axes && gp.axes[0]) || 0;
      const ax = Math.abs(x);
      x = ax < STICK_DEAD ? 0 : Math.sign(x) * Math.pow((ax - STICK_DEAD) / (1 - STICK_DEAD), 1.35);
      let rt = btn(gp, B.RT), lt = btn(gp, B.LT);
      rt = rt < TRIGGER_DEAD ? 0 : (rt - TRIGGER_DEAD) / (1 - TRIGGER_DEAD);
      lt = lt < TRIGGER_DEAD ? 0 : (lt - TRIGGER_DEAD) / (1 - TRIGGER_DEAD);
      let active = Math.abs(x) > 0.3 || rt > 0.1 || lt > 0.1;
      for (let i = 0; i < now.length && !active; i++) if (now[i]) active = true;
      if (active) this.device = 'control';
      if (Math.abs(x) > Math.abs(steer)) steer = x;
      thr = Math.max(thr, rt);
      brk = Math.max(brk, lt);
      hb = hb || !!now[B.A];
      nitro = nitro || !!now[B.X];
      look = look || !!now[B.B];
      horn = horn || !!now[B.L3];
      for (const [i, a] of PAD_TAP) if (now[i] && !prev[i]) this._taps.add(a);
    }
    this._padPrev = now;

    st.steer = Math.max(-1, Math.min(1, steer));
    st.throttle = Math.max(0, Math.min(1, thr));
    st.brake = Math.max(0, Math.min(1, brk));
    st.handbrake = hb; st.nitro = nitro; st.lookBack = look; st.horn = horn;
    for (const a of this._taps) st[a] = true;
    this._taps.clear();
    return st;
  }

  // Vibración del control (si el navegador la permite). strong/weak 0..1.
  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    const gp = this._pad();
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    try { act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* sin vibración */ }
  }

  bindingsText() {
    return [
      { accion: 'Acelerar', teclado: 'W / ↑', control: 'RT' },
      { accion: 'Frenar / reversa', teclado: 'S / ↓', control: 'LT' },
      { accion: 'Dirección', teclado: 'A D / ← →', control: 'Stick izquierdo' },
      { accion: 'Freno de mano', teclado: 'Espacio', control: 'A' },
      { accion: 'Nitro', teclado: 'Shift / N', control: 'X' },
      { accion: 'Subir cambio (manual)', teclado: 'E', control: 'RB' },
      { accion: 'Bajar cambio (manual)', teclado: 'Q', control: 'LB' },
      { accion: 'Cambiar cámara', teclado: 'C', control: 'Y' },
      { accion: 'Mirar atrás', teclado: 'B', control: 'B' },
      { accion: 'Retrovisor', teclado: 'M', control: 'Cruceta arriba' },
      { accion: 'Claxon', teclado: 'H', control: 'Clic del stick izquierdo' },
      { accion: 'Regresar a la pista', teclado: 'R', control: 'Back / View' },
      { accion: 'Pausa', teclado: 'Esc / P', control: 'Start / Menu' },
    ];
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    if (typeof window !== 'undefined') window.removeEventListener('blur', this._onBlur);
  }
}
