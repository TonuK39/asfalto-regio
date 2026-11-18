// HUD de carrera. Ligero: escribe en el DOM a ≤ 20 Hz, cachea textos, agujas con transform y minimapa en canvas.
// Deja libres el centro y la parte de arriba al centro (retrovisor).
import { h, icon, fmtTime, fmtNum, clamp } from './dom.js';
import { Minimap } from './trackmap.js';

const A0 = 135, SWEEP = 270;           // arco del tacómetro: de abajo-izquierda a abajo-derecha
const polar = (r, deg) => { const a = deg * Math.PI / 180; return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]; };
function arc(r, a0, a1) {
  const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const LED_AT = [0.70, 0.75, 0.80, 0.85, 0.89, 0.93, 0.96];
const ROLE = { policia: ['POLICÍA', 'shield', 'cop'], police: ['POLICÍA', 'shield', 'cop'], fugitivo: ['FUGITIVO', 'mask', 'fug'], fugitive: ['FUGITIVO', 'mask', 'fug'] };

export class HUD {
  constructor(ui, el) {
    this.ui = ui;
    this.el = el;
    this.on = false;
    this.last = 0;
    this.c = {};          // caché de textos/estados
    this.maxRpm = 0;
    this.local = null;
    this._build();
  }

  _build() {
    const el = this.el;
    const lbl = t => h('span.hud-lbl', t);
    // arriba a la izquierda
    this.modeEl = h('div.hud-mode');
    this.posV = h('b.hud-big'); this.posT = h('span.hud-of');
    this.posBox = h('div.hud-pos', lbl('POS'), h('div.hud-num', this.posV, this.posT));
    this.lapV = h('b.hud-big'); this.lapT = h('span.hud-of');
    this.lapBox = h('div.hud-lap', lbl('VUELTA'), h('div.hud-num', this.lapV, this.lapT));
    this.timerV = h('b');
    this.timerBox = h('div.hud-timer', icon('clock'), h('div', lbl('TIEMPO'), this.timerV));
    this.roleBox = h('div.hud-role');
    this.infoEl = h('div.hud-info');
    el.append(h('div.hud-tl', this.modeEl, h('div.hud-posrow', this.posBox, this.lapBox), this.timerBox, this.roleBox, this.infoEl));
    // lista de posiciones
    this.standEl = h('div.hud-stand');
    el.append(this.standEl);
    // arriba a la derecha: tiempos y puntos
    this.fpsEl = h('div.hud-fps');
    const trow = (k, label) => { const v = h('b'); const r = h('div.hud-trow.t-' + k, h('span', label), v); this['t_' + k] = v; this['r_' + k] = r; return r; };
    this.timesEl = h('div.hud-times', trow('total', 'TOTAL'), trow('lap', 'VUELTA'), trow('best', 'MEJOR'), trow('last', 'ÚLTIMA'));
    this.scoreV = h('b.hud-score-v');
    this.comboM = h('b.hud-combo-m');
    this.comboP = h('span.hud-combo-p');
    this.comboBox = h('div.hud-combo', this.comboM, this.comboP);
    this.scoreEl = h('div.hud-score', h('span.hud-lbl', 'PUNTOS'), this.scoreV, this.comboBox);
    el.append(h('div.hud-tr', this.fpsEl, this.timesEl, this.scoreEl));
    // minimapa
    const cv = h('canvas.hud-map-cv');
    this.mapEl = h('div.hud-map', cv);
    this.map = new Minimap(cv);
    el.append(this.mapEl);
    // abajo a la derecha: tacómetro
    this.fuelFill = h('i'); this.tireFill = h('i');
    this.fuelRow = h('div.hud-wrow', icon('fuel'), h('span.hud-wbar', this.fuelFill), h('b'));
    this.tireRow = h('div.hud-wrow', icon('tire'), h('span.hud-wbar', this.tireFill), h('b'));
    this.wearEl = h('div.hud-wear', this.fuelRow, this.tireRow);
    this.leds = LED_AT.map((_, i) => h('i.led' + (i < 2 ? '.g' : i < 4 ? '.y' : '.r')));
    this.ledEl = h('div.hud-leds', this.leds);
    this.tachSvg = h('div.hud-tach-svg');
    this.needle = h('div.hud-needle', h('i'));
    this.speedV = h('b.hud-speed');
    this.gearV = h('b.hud-gear-v');
    this.boxV = h('span.hud-gearbox');
    this.tachEl = h('div.hud-tach', this.tachSvg, this.needle,
      h('div.hud-tach-c', this.speedV, h('span.hud-unit', 'KM/H')),
      h('div.hud-gear', this.gearV, this.boxV));
    this.nitroFill = h('i');
    this.nitroEl = h('div.hud-nitro', icon('bolt'), h('span.hud-nbar', this.nitroFill));
    this.dmgV = h('b');
    this.dmgEl = h('div.hud-dmg', h('span.hud-dmg-car', { html: '<svg viewBox="0 0 20 34" aria-hidden="true"><path d="M5 2h10l3 6v20l-3 4H5l-3-4V8z" fill="currentColor"/><path d="M6 10h8l1 5H5zM5 24h10l-1 4H6z" fill="rgba(0,0,0,.45)"/></svg>' }), h('div', h('span.hud-lbl', 'DAÑO'), this.dmgV));
    el.append(h('div.hud-br', this.wearEl, h('div.hud-cluster', this.ledEl, this.tachEl), h('div.hud-bars', this.nitroEl, this.dmgEl)));
    // mensajes y cuenta regresiva
    this.msgTop = h('div.hud-msgs.top');
    this.msgMid = h('div.hud-msgs.mid');
    this.countEl = h('div.hud-count');
    el.append(this.msgTop, this.msgMid, this.countEl);
    this._buildTach(7000);
  }

  _buildTach(redline) {
    this.redline = redline;
    this.maxRpm = Math.max(4000, Math.ceil((redline + 600) / 1000) * 1000);
    const max = this.maxRpm, ang = r => A0 + SWEEP * (r / max);
    let ticks = '', nums = '';
    for (let r = 0; r <= max; r += 500) {
      const major = r % 1000 === 0;
      const [x0, y0] = polar(major ? 70 : 75, ang(r)), [x1, y1] = polar(82, ang(r));
      ticks += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="${major ? 'mj' : 'mn'}${r >= redline ? ' rd' : ''}"/>`;
      if (major) { const [tx, ty] = polar(58, ang(r)); nums += `<text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}"${r >= redline ? ' class="rd"' : ''}>${r / 1000}</text>`; }
    }
    this.tachSvg.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="97" class="bg"/>
      <path d="${arc(88, A0, A0 + SWEEP)}" class="trk"/>
      <path d="${arc(88, ang(redline), A0 + SWEEP)}" class="red"/>
      <path d="${arc(88, A0, A0 + SWEEP)}" class="fill" pathLength="100" stroke-dasharray="0 200"/>
      <g class="ticks">${ticks}</g><g class="nums">${nums}</g></svg>`;
    this.fillPath = this.tachSvg.querySelector('.fill');
    this.c.fill = null;
  }

  // ---- API del contrato ------------------------------------------------------------------------
  show() {
    this.on = true;
    this.el.classList.add('on');
    this.msgTop.textContent = ''; this.msgMid.textContent = '';
    this.countdown(null);
  }
  hide() {
    this.on = false;
    this.el.classList.remove('on');
    this.countdown(null);
  }

  update(v) {
    if (!v) return;
    const now = performance.now();
    if (now - this.last < 50) return;
    this.last = now;
    this._render(v);
    this.map.draw(v.cars);
  }

  minimap(path) {
    this.map.setPath(path);
    this.mapEl.classList.toggle('is-off', !path || path.length < 2);
    this.map.draw(null);
  }

  standings(rows) {
    rows = rows || [];
    this.local = rows.find(r => r.isLocal) || null;
    const key = rows.map(r => `${r.pos}|${r.name}|${r.gap ?? ''}|${r.isLocal ? 1 : 0}|${r.out ? 1 : 0}|${r.color || ''}`).join(';');
    if (key === this.c.stand) return;
    this.c.stand = key;
    let list = rows;
    if (rows.length > 8) {
      const li = rows.findIndex(r => r.isLocal);
      list = rows.slice(0, 5);
      if (li >= 5) list.push(...rows.slice(Math.max(5, li - 1), li + 2));
      else list.push(...rows.slice(5, 8));
    }
    const kids = this.standEl.children;
    while (kids.length > list.length) this.standEl.lastChild.remove();
    while (kids.length < list.length) this.standEl.append(h('div.hud-srow', h('b.p'), h('i.c'), h('span.n'), h('span.g')));
    list.forEach((r, i) => {
      const el = kids[i];
      el.className = 'hud-srow' + (r.isLocal ? ' me' : '') + (r.out ? ' out' : '') + (r.pos === 1 ? ' lead' : '');
      el.children[0].textContent = r.pos;
      el.children[1].style.background = r.color || 'transparent';
      el.children[2].textContent = r.name || '';
      el.children[3].textContent = fmtGap(r.gap, r.pos);
    });
  }

  // kind: 'info' | 'big' | 'good' | 'warn' | 'bad' | 'drift' | 'score' | 'penalty'
  message(text, kind = 'info', ms) {
    if (!text) return;
    const mid = kind === 'drift' || kind === 'score' || kind === 'penalty' || kind === 'bad' || /^[+\-−]\s?\d/.test(text);
    const area = mid ? this.msgMid : this.msgTop;
    const el = h('div.hud-msg.k-' + kind, text);
    area.prepend(el);
    while (area.children.length > 3) area.lastChild.remove();
    const dur = ms ?? (kind === 'big' ? 2600 : mid ? 1500 : 2200);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, dur);
  }

  countdown(n) {
    const el = this.countEl;
    clearTimeout(this._cdT);
    if (n == null || n === '' || n === false || n === 0) { el.className = 'hud-count'; return; }
    el.textContent = String(n);
    el.className = 'hud-count';
    void el.offsetWidth;
    const go = typeof n !== 'number';
    el.className = 'hud-count on ' + (go ? 'go' : 'n' + Math.min(3, n));
    if (go) this._cdT = setTimeout(() => { el.className = 'hud-count'; }, 1200);
  }

  // ---- render ---------------------------------------------------------------------------------
  _txt(k, el, t) { if (this.c[k] !== t) { this.c[k] = t; el.textContent = t; } }
  _vis(k, el, on) { if (this.c['v' + k] !== on) { this.c['v' + k] = on; el.classList.toggle('is-off', !on); } }
  _cls(k, el, cls, on) { const key = 'c' + k; if (this.c[key] !== on) { this.c[key] = on; el.classList.toggle(cls, on); } }

  _render(v) {
    const modes = this.ui.d.MODE_BY_ID || {};
    const mode = modes[v.mode] || null;
    // modo
    this._txt('mode', this.modeEl, mode ? mode.name.toUpperCase() : '');
    this._vis('mode', this.modeEl, !!mode);
    // posición y vuelta
    const total = v.total || 0;
    this._vis('pos', this.posBox, total > 1 && v.position != null);
    this._txt('posV', this.posV, String(v.position ?? '-'));
    this._txt('posT', this.posT, '/' + total);
    const laps = v.laps || 0;
    this._vis('lap', this.lapBox, laps > 0);
    this._txt('lapV', this.lapV, String(clamp(v.lap || 1, 1, Math.max(1, laps))));
    this._txt('lapT', this.lapT, '/' + laps);
    // cronómetro (gymkhana / persecución) y rol
    let info = v.modeInfo || '';
    let left = v.timeLeftMs;
    if (left == null) {
      const m = /Tiempo (\d+):(\d\d)/.exec(info);
      if (m) { left = (+m[1] * 60 + +m[2]) * 1000; info = info.replace(/\s*·?\s*Tiempo \d+:\d\d/, '').trim(); }
    }
    this._vis('timer', this.timerBox, left != null);
    if (left != null) {
      this._txt('timer', this.timerV, fmtTime(Math.max(0, left), false));
      this._cls('tlow', this.timerBox, 'low', left < 10000);
    }
    const role = ROLE[v.role || (this.local && this.local.role) || ''] || null;
    this._vis('role', this.roleBox, !!role);
    if (role && this.c.role !== role[0]) {
      this.c.role = role[0];
      this.roleBox.className = 'hud-role ' + role[2];
      this.roleBox.textContent = '';
      this.roleBox.append(icon(role[1]), h('span', role[0]));
    }
    if (role) info = info.replace(/^(PATRULLA|FUGITIVO)\s*·\s*/, '');
    this._txt('info', this.infoEl, info);
    this._vis('info', this.infoEl, !!info);
    // tiempos
    this._txt('tt', this.t_total, fmtTime(v.raceMs));
    const lapsOn = laps > 0;
    this._vis('rlap', this.r_lap, lapsOn);
    this._vis('rbest', this.r_best, lapsOn || v.bestLapMs != null);
    this._vis('rlast', this.r_last, lapsOn && v.lastLapMs != null);
    if (lapsOn) this._txt('tl', this.t_lap, fmtTime(v.lapMs));
    this._txt('tb', this.t_best, fmtTime(v.bestLapMs));
    this._txt('tla', this.t_last, fmtTime(v.lastLapMs));
    // puntos y combo
    const scoreOn = mode ? mode.ranking === 'score' : (v.score != null && v.score > 0);
    this._vis('score', this.scoreEl, scoreOn);
    if (scoreOn) {
      this._txt('sc', this.scoreV, fmtNum(v.score));
      const mult = v.comboMult || 1, combo = v.combo || 0;
      const comboOn = mult > 1 || combo > 0;
      this._vis('combo', this.comboBox, comboOn);
      this._txt('cm', this.comboM, '×' + mult);
      this._txt('cp', this.comboP, combo > 0 ? '+' + fmtNum(combo) : '');
    }
    // fps
    this._vis('fps', this.fpsEl, v.fps != null);
    if (v.fps != null) this._txt('fps', this.fpsEl, Math.round(v.fps) + ' FPS');
    // tacómetro
    const red = v.redline || 7000;
    if (Math.abs(red - this.redline) > 1) this._buildTach(red);
    const rpm = Math.max(0, v.rpm || 0);
    const f = clamp(rpm / this.maxRpm, 0, 1.01);
    const deg = (A0 + SWEEP * f).toFixed(1);
    if (this.c.ndl !== deg) { this.c.ndl = deg; this.needle.style.transform = `rotate(${deg}deg)`; }
    const fill = (f * 100).toFixed(1) + ' 200';
    if (this.c.fill !== fill) { this.c.fill = fill; this.fillPath.setAttribute('stroke-dasharray', fill); }
    this._txt('spd', this.speedV, String(Math.round(Math.abs(v.speedKmh || 0))));
    const g = v.gear;
    this._txt('gear', this.gearV, g == null ? '-' : g < 0 ? 'R' : g === 0 ? 'N' : String(g));
    this._txt('box', this.boxV, v.gearbox === 'manual' ? 'MAN' : 'AUTO');
    const rf = rpm / red;
    let n = 0;
    for (const t of LED_AT) if (rf >= t) n++;
    const flash = rf >= 0.97;
    if (this.c.leds !== n) { this.c.leds = n; this.leds.forEach((l, i) => l.classList.toggle('on', i < n)); }
    this._cls('flash', this.ledEl, 'flash', flash);
    this._cls('redz', this.tachEl, 'redz', rf >= 0.97);
    // nitro y daño
    const nitroOn = v.nitro != null && !(mode && mode.nitro === false);
    this._vis('nitro', this.nitroEl, nitroOn);
    if (nitroOn) {
      const nv = clamp(v.nitro, 0, 1).toFixed(3);
      if (this.c.nitro !== nv) { this.c.nitro = nv; this.nitroFill.style.transform = `scaleX(${nv})`; }
      this._cls('nact', this.nitroEl, 'act', !!v.nitroActive);
    }
    const dmg = clamp(v.damage || 0, 0, 1);
    this._txt('dmg', this.dmgV, Math.round(dmg * 100) + '%');
    const dk = dmg < 0.25 ? 'ok' : dmg < 0.6 ? 'mid' : 'hi';
    if (this.c.dk !== dk) { this.c.dk = dk; this.dmgEl.dataset.lvl = dk; }
    // resistencia
    const wearOn = v.fuel != null || v.tires != null;
    this._vis('wear', this.wearEl, wearOn);
    if (wearOn) {
      this._bar('fuel', this.fuelRow, this.fuelFill, v.fuel);
      this._bar('tire', this.tireRow, this.tireFill, v.tires);
    }
  }

  _bar(k, rowEl, fillEl, val) {
    this._vis(k, rowEl, val != null);
    if (val == null) return;
    const x = clamp(val, 0, 1);
    const s = x.toFixed(3);
    if (this.c[k] !== s) {
      this.c[k] = s;
      fillEl.style.transform = `scaleX(${s})`;
      rowEl.lastChild.textContent = Math.round(x * 100) + '%';
      rowEl.dataset.lvl = x < 0.12 ? 'crit' : x < 0.25 ? 'low' : 'ok';
    }
  }
}

function fmtGap(g, pos) {
  if (g == null || g === '') return pos === 1 ? 'LÍDER' : '';
  if (typeof g === 'number') {
    const s = Math.abs(g) / 1000;
    const t = s >= 60 ? fmtTime(Math.abs(g)) : s.toFixed(3);
    return (g < 0 ? '−' : '+') + t;
  }
  return String(g).toUpperCase();
}
