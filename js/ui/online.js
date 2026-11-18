// Vestíbulo en línea, sala (con chat y lugares) y práctica. Comparten el panel de ajustes de carrera.
import { h, put, icon, flag, stepper, toggle, row, clear, fmtTime, carName, className, KIND_NAMES, SURFACE_NAMES } from './dom.js';
import { drawTrackPreview } from './trackmap.js';
import { TIMES, WEATHERS } from '../data/modes.js';
import { MAX_PLAYERS, CODE_CHARS } from '../config.js';

const LAP_NOTE = { eliminacion: 'Vueltas: participantes − 1', persecucion: 'Límite de tiempo', gymkhana: 'Límite de tiempo', libre: 'Sin límite de vueltas' };

function lapsRange(mode, track) {
  if (!mode || !mode.laps || !mode.laps.max) return [0, 0];
  if (track && (track.kind === 'sprint' || track.kind === 'drag')) return [1, 1];
  return [mode.laps.min, mode.laps.max];
}
function defLaps(mode, track) {
  const [a, b] = lapsRange(mode, track);
  if (!b) return 0;
  let L = mode.id === 'resistencia' || !track || !track.defaultLaps ? mode.laps.def : track.defaultLaps;
  return Math.min(b, Math.max(a, L || a));
}

// ---------------------------------------------------------------------------------------------
// Panel de ajustes de carrera: pista (con trazado), modo, vueltas, hora, clima y (práctica) bots.
export function raceSettings(ui, { values = {}, editable = true, showBots = false, onChange }) {
  const d = ui.d;
  const tracks = d.TRACKS || [];
  const fits = (m, t) => !!(m && t && d.modeFitsTrack(m, t));
  const modesFor = t => (d.MODES || []).filter(m => fits(m, t));
  let v = { trackId: tracks[0] && tracks[0].id, modeId: null, laps: null, timeOfDay: null, weather: 'clear', bots: 3, ...values };
  let ed = editable;
  const fix = () => {
    const t = d.TRACK_BY_ID[v.trackId] || tracks[0];
    if (t) v.trackId = t.id;
    const ms = modesFor(t);
    if (!ms.some(m => m.id === v.modeId)) v.modeId = (ms.find(m => m.id !== 'libre') || ms[0] || {}).id;
    const m = d.MODE_BY_ID[v.modeId];
    const [a, b] = lapsRange(m, t);
    if (v.laps == null || !b) v.laps = b ? defLaps(m, t) : 0;
    else v.laps = Math.min(b, Math.max(a, v.laps));
    if (!v.timeOfDay) v.timeOfDay = (t && t.defaultTime) || 'day';
    if (m && m.bots === false) v.bots = 0;
  };
  fix();

  const cv = h('canvas.ar-trackcv');
  const tInfo = h('div.ar-trackinfo');
  const mDesc = h('p.ar-modedesc');
  const lapsNote = h('span.ar-note');
  const trackStep = stepper({ options: tracks.map(t => ({ id: t.id, name: t.name, sub: t.place || '' })), value: v.trackId, readonly: !ed, fkey: 'rs-track', onChange: id => change({ trackId: id }) });
  const modeStep = stepper({ options: [], value: v.modeId, readonly: !ed, fkey: 'rs-mode', onChange: id => change({ modeId: id }) });
  const lapsStep = stepper({ options: [], value: v.laps, readonly: !ed, wrap: false, fkey: 'rs-laps', onChange: n => change({ laps: +n }) });
  const timeStep = stepper({ options: TIMES.map(t => ({ id: t.id, name: t.name })), value: v.timeOfDay, readonly: !ed, fkey: 'rs-time', onChange: id => change({ timeOfDay: id }) });
  const weatherStep = stepper({ options: WEATHERS.map(w => ({ id: w.id, name: w.name })), value: v.weather, readonly: !ed, fkey: 'rs-weather', onChange: id => change({ weather: id }) });
  const botOpts = Array.from({ length: MAX_PLAYERS }, (_, i) => ({ id: i, name: i === 0 ? 'Sin bots' : i === 1 ? '1 bot' : i + ' bots' }));
  const botsStep = showBots ? stepper({ options: botOpts, value: v.bots, readonly: !ed, wrap: false, fkey: 'rs-bots', onChange: n => change({ bots: +n }) }) : null;
  const botsRow = showBots ? row('Rivales (bots)', botsStep.el) : null;

  function change(partial) {
    const prev = { ...v };
    v = { ...v, ...partial };
    if (partial.trackId) { v.laps = null; const t = d.TRACK_BY_ID[v.trackId]; if (t && t.defaultTime) v.timeOfDay = t.defaultTime; }
    if (partial.modeId) v.laps = null;
    fix();
    const diff = {};
    for (const k of Object.keys(v)) if (v[k] !== prev[k] && (showBots || k !== 'bots')) diff[k] = v[k];
    paint();
    if (Object.keys(diff).length && onChange) onChange(diff, { ...v });
  }

  let lastDrawn = '';
  function paint() {
    const t = d.TRACK_BY_ID[v.trackId], m = d.MODE_BY_ID[v.modeId];
    trackStep.set(v.trackId);
    modeStep.set(v.modeId, modesFor(t).map(x => ({ id: x.id, name: x.name })));
    const [a, b] = lapsRange(m, t);
    const lo = [];
    if (b) for (let i = a; i <= b; i++) lo.push({ id: i, name: i === 1 ? '1 vuelta' : i + ' vueltas' });
    else lo.push({ id: 0, name: LAP_NOTE[m && m.id] || '—' });
    lapsStep.set(v.laps, lo);
    lapsNote.textContent = m && m.timeLimitS ? fmtTime(m.timeLimitS * 1000, false) + ' min' : '';
    timeStep.set(v.timeOfDay);
    weatherStep.set(v.weather);
    if (botsStep) {
      botsStep.set(v.bots);
      const noBots = m && m.bots === false;
      botsStep.setReadonly(!ed || noBots);
      botsRow.classList.toggle('is-dim', !!noBots);
    }
    [trackStep, modeStep, timeStep, weatherStep].forEach(s => s.setReadonly(!ed));
    lapsStep.setReadonly(!ed || lo.length < 2);
    // info
    clear(tInfo);
    if (t) {
      put(tInfo, h('div.ar-trackmeta', t.real ? h('span.ar-tag.real', 'Pista real') : null, h('span.ar-tag', KIND_NAMES[t.kind] || t.kind || ''), t.surface ? h('span.ar-tag.dim', SURFACE_NAMES[t.surface] || t.surface) : null),
        t.description ? h('p.ar-p.dim', t.description) : null);
    }
    clear(mDesc);
    if (m) put(mDesc, m.desc || '', m.forcedCar ? h('em', ' Todos usan el mismo monoplaza.') : null);
    if (t && lastDrawn !== t.id) { lastDrawn = t.id; drawLater(t); }
  }
  function drawLater(t) {
    let pts = null;
    try { pts = d.trackOutline ? d.trackOutline(t) : (t.minimap || null); } catch (e) { console.warn('[ui] trackOutline:', e); }
    const go = (n = 0) => { if (!cv.isConnected || !cv.clientWidth) { if (n < 30) requestAnimationFrame(() => go(n + 1)); return; } drawTrackPreview(cv, pts); };
    requestAnimationFrame(() => go());
  }
  const el = h('div.ar-racesettings',
    h('div.ar-trackcard', cv, h('div.ar-trackside', row('Pista', trackStep.el), tInfo)),
    row('Modo', modeStep.el), mDesc,
    row('Vueltas', h('div.ar-inline', lapsStep.el, lapsNote)),
    h('div.ar-row2', row('Hora', timeStep.el), row('Clima', weatherStep.el)),
    botsRow);
  paint();
  return {
    el,
    get: () => ({ ...v }),
    set(values, editable2) {
      if (editable2 != null) ed = !!editable2;
      v = { ...v, ...(values || {}) };
      fix();
      paint();
    },
    redraw() { lastDrawn = ''; paint(); },
  };
}

// Selector rápido de auto propio
function carPicker(ui, onPick, fkey) {
  const save = ui.save, d = ui.d;
  const opts = () => save.data.garage.map(e => { const def = d.CAR_BY_ID[e.carId]; return { id: e.uid, name: def ? carName(def) : e.carId, sub: def ? className(def.class) : '' }; });
  const sp = stepper({ options: opts(), value: save.data.currentUid, fkey, onChange: uid => { save.setCurrent(uid); try { onPick && onPick(uid); } catch (e) { console.error(e); } } });
  return { el: sp.el, refresh(ro) { sp.set(save.data.currentUid, opts()); if (ro != null) sp.setReadonly(ro); } };
}

// ---------------------------------------------------------------------------------------------
// Práctica
export function practiceScreen(ui, hd) {
  const save = ui.save, d = ui.d;
  const rs = raceSettings(ui, { values: ui._practice || {}, editable: true, showBots: true, onChange: (diff, all) => { ui._practice = all; paintCar(); } });
  const carBox = h('div.ar-pcar');
  const picker = carPicker(ui, () => paintCar(), 'p-car');
  const forced = h('p.ar-note');
  const paintCar = () => {
    const v = rs.get(), m = d.MODE_BY_ID[v.modeId];
    const forcedDef = m && m.forcedCar && d.CAR_BY_ID[m.forcedCar];
    const c = save.currentCar(), def = forcedDef || (c && d.CAR_BY_ID[c.carId]);
    clear(carBox);
    if (def) carBox.append(flag(def.country, d.COUNTRIES), h('div', h('b', carName(def)), h('small', `${def.year || ''} · ${className(def.class)}`)));
    picker.refresh(!!forcedDef);
    forced.textContent = forcedDef ? 'En Fórmula todos usan el mismo monoplaza.' : '';
  };
  const start = h('button.ar-btn.primary.ar-go', { type: 'button', 'data-fkey': 'p-start', onclick: () => { const s = rs.get(); ui._practice = s; hd.onStart && hd.onStart({ trackId: s.trackId, modeId: s.modeId, laps: s.laps, timeOfDay: s.timeOfDay, weather: s.weather, bots: s.bots }); } },
    icon('play'), h('span', 'Arrancar'));
  const f = ui.frame({ name: 'practice', title: 'Práctica', kicker: 'Contra bots, sin presión', onBack: hd.onBack });
  rs.el.querySelector('[data-fkey="rs-track"]').dataset.autofocus = '';
  f.body.append(
    h('section.ar-panel.ar-pleft', h('h2.ar-h2', icon('flag'), 'Carrera'), rs.el),
    h('section.ar-panel.ar-pright', h('h2.ar-h2', icon('car'), 'Tu auto'), carBox, row('Cambiar', picker.el), forced, start));
  paintCar();
  return { name: 'practice', el: f.el, foot: f.foot, back: hd.onBack, hints: [['move', 'Mover'], ['adjust', 'Cambiar'], ['ok', 'Aceptar'], ['back', 'Atrás']], onSave: paintCar };
}

// ---------------------------------------------------------------------------------------------
// Vestíbulo
export function lobbyScreen(ui, hd) {
  const save = ui.save, d = ui.d;
  const listEl = h('div.ar-rooms');
  const status = h('p.ar-msg');
  const refreshBtn = h('button.ar-btn.small', { type: 'button', 'data-fkey': 'l-refresh', onclick: () => load(true) }, icon('refresh'), h('span', 'Actualizar'));
  let loading = false, alive = true, first = true;
  const trackName = t => (d.TRACK_BY_ID[t] && d.TRACK_BY_ID[t].name) || t || '—';
  const modeName = m => (d.MODE_BY_ID[m] && d.MODE_BY_ID[m].name) || m || '—';
  const render = rooms => {
    const fk = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.fkey;
    clear(listEl);
    rooms = (rooms || []).filter(r => r && r.code);
    if (!rooms.length) { status.textContent = 'No hay salas públicas por ahora. ¡Crea una y comparte el código!'; status.className = 'ar-msg'; }
    else status.textContent = '';
    for (const r of rooms) {
      const max = r.max || MAX_PLAYERS, n = r.players || 0, full = n >= max;
      const racing = /carrera|racing|playing/i.test(String(r.status || ''));
      listEl.append(h('button.ar-room', { type: 'button', 'data-fkey': 'room-' + r.code, disabled: full, onclick: () => hd.onJoin && hd.onJoin(r.code) },
        h('div.ar-room-n', h('b', r.name || 'Sala ' + r.code), h('small', icon('crown'), r.host || '')),
        h('div.ar-room-p' + (full ? '.full' : ''), icon('users'), h('b', `${n}/${max}`)),
        h('div.ar-room-t', h('span', trackName(r.track)), h('small', modeName(r.mode))),
        h('span.ar-status' + (racing ? '.racing' : ''), full ? 'Llena' : racing ? 'En carrera' : 'En sala'),
        h('span.ar-room-code', r.code)));
    }
    if (fk && !ui.nav.restore(fk) && fk.startsWith('room-')) ui.nav.focusDefault();
  };
  const load = (manual) => {
    if (loading || !alive) return;
    if (!hd.listRooms) { status.textContent = 'Las salas en línea no están disponibles.'; return; }
    loading = true;
    refreshBtn.classList.add('spin');
    if (first) { status.textContent = 'Buscando salas…'; status.className = 'ar-msg'; }
    Promise.resolve().then(() => hd.listRooms()).then(rooms => { if (alive) render(rooms); })
      .catch(e => { console.warn(e); if (!alive) return; status.textContent = 'No se pudo cargar la lista. Revisa tu conexión.'; status.className = 'ar-msg bad'; })
      .finally(() => { loading = false; first = false; refreshBtn.classList.remove('spin'); if (manual) ui.sfx('click'); });
  };
  const timer = setInterval(() => load(false), 5000);

  // crear
  const nameIn = h('input.ar-input', { type: 'text', maxlength: 28, spellcheck: 'false', autocomplete: 'off', 'data-fkey': 'l-name', placeholder: 'Nombre de la sala' });
  nameIn.value = 'Sala de ' + save.data.playerName;
  const pub = toggle({ value: true, on: 'Pública', off: 'Privada (solo con código)', fkey: 'l-public' });
  const create = () => hd.onCreate && hd.onCreate({ name: (nameIn.value.trim() || 'Sala de ' + save.data.playerName).slice(0, 28), isPublic: pub.value });
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
  // unirse
  const allowed = new Set((CODE_CHARS || 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789').split(''));
  const codeIn = h('input.ar-input.ar-codein', { type: 'text', maxlength: 5, spellcheck: 'false', autocomplete: 'off', 'data-fkey': 'l-code', placeholder: 'ABCDE' });
  const joinBtn = h('button.ar-btn', { type: 'button', 'data-fkey': 'l-join', disabled: true, onclick: () => join() }, icon('key'), h('span', 'Unirse'));
  const join = () => { const c = codeIn.value; if (c.length === 5 && hd.onJoinCode) hd.onJoinCode(c); };
  codeIn.addEventListener('input', () => {
    codeIn.value = codeIn.value.toUpperCase().replace(/O/g, '0').split('').filter(ch => allowed.has(ch)).join('').slice(0, 5);
    joinBtn.disabled = codeIn.value.length !== 5;
  });
  codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); join(); } });

  const f = ui.frame({ name: 'lobby', title: 'Jugar en línea', kicker: 'Vestíbulo', onBack: hd.onBack });
  f.body.append(
    h('section.ar-panel.ar-lobbyl', h('div.ar-paneltop', h('h2.ar-h2', icon('globe'), 'Salas públicas'), refreshBtn),
      h('div.ar-room.head', h('span', 'Sala'), h('span', 'Jugadores'), h('span', 'Pista y modo'), h('span', 'Estado'), h('span', 'Código')),
      h('div.ar-scroll', listEl, status)),
    h('div.ar-lobbyr',
      h('section.ar-panel', h('h2.ar-h2', icon('plus'), 'Crear sala'), row('Nombre', nameIn), row('Visibilidad', pub.el),
        h('div.ar-actions', h('button.ar-btn.primary', { type: 'button', 'data-fkey': 'l-create', 'data-autofocus': true, onclick: create }, icon('flag'), h('span', 'Crear sala')))),
      h('section.ar-panel', h('h2.ar-h2', icon('key'), 'Unirse con código'), h('p.ar-p.dim', 'Pide a tu amigo el código de 5 caracteres de su sala.'),
        h('div.ar-joinrow', codeIn, joinBtn))));
  load(false);
  return {
    name: 'lobby', el: f.el, foot: f.foot, back: hd.onBack, hints: [['move', 'Mover'], ['ok', 'Aceptar'], ['back', 'Atrás']],
    dispose: () => { alive = false; clearInterval(timer); },
  };
}

// ---------------------------------------------------------------------------------------------
// Sala
const LINK = { p2p: ['Directa', 'ok'], respaldo: ['Respaldo', 'mid'], conectando: ['Conectando', 'wait'] };
export function roomScreen(ui, hd) {
  const save = ui.save, d = ui.d;
  let view = null;
  const codeV = h('b.ar-bigcode', '·····');
  const copyBtn = h('button.ar-btn.small', { type: 'button', 'data-fkey': 'r-copy', onclick: async () => {
    if (!view) return;
    try { await navigator.clipboard.writeText(view.code); ui.toast('Código copiado: ' + view.code); } catch { ui.toast('Código: ' + view.code); }
  } }, icon('copy'), h('span', 'Copiar'));
  const nameV = h('h2.ar-roomname', 'Conectando…');
  const visV = h('span.ar-tag');
  const slots = h('div.ar-slots');
  const rs = raceSettings(ui, { values: {}, editable: false, showBots: false, onChange: diff => { if (view && view.isHost && hd.onSettings) hd.onSettings(diff); } });
  const hostNote = h('p.ar-note');
  const picker = carPicker(ui, () => { hd.onPickCar && hd.onPickCar(); }, 'r-car');
  const chatList = h('div.ar-chatlist');
  const chatIn = h('input.ar-input', { type: 'text', maxlength: 140, placeholder: 'Escribe un mensaje…', spellcheck: 'false', autocomplete: 'off', 'data-fkey': 'r-chat' });
  const sendChat = () => { const t = chatIn.value.trim(); if (!t) return; chatIn.value = ''; hd.onChat && hd.onChat(t); };
  chatIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
  const sendBtn = h('button.ar-btn.small.ar-send', { type: 'button', 'data-fkey': 'r-send', 'aria-label': 'Enviar', onclick: sendChat }, icon('send'));
  const readyBtn = h('button.ar-btn.ar-ready', { type: 'button', 'data-fkey': 'r-ready', onclick: () => { const me = myPlayer(); hd.onReady && hd.onReady(!(me && me.ready)); } });
  const startBtn = h('button.ar-btn.primary.ar-go', { type: 'button', 'data-fkey': 'r-start', onclick: () => hd.onStart && hd.onStart() }, icon('play'), h('span', 'Iniciar carrera'));
  const startNote = h('span.ar-note');
  const leaveBtn = h('button.ar-btn.ghost', { type: 'button', 'data-fkey': 'r-leave', onclick: () => leave() }, icon('exit'), h('span', 'Salir'));
  const myPlayer = () => view && view.players && view.players.find(p => p.id === view.myId);
  const leave = async () => {
    if (await ui.confirm({ title: 'Salir de la sala', text: '¿Seguro que quieres salir de la sala?', ok: 'Salir', danger: true })) hd.onLeave && hd.onLeave();
  };

  let slotKey = '', chatKey = '';
  const carLabel = c => { const def = d.CAR_BY_ID[c]; return def ? carName(def) : (c || ''); };
  const paintSlots = () => {
    const ps = view.players || [];
    const mode = d.MODE_BY_ID[view.settings && view.settings.modeId];
    const forcedDef = mode && mode.forcedCar && d.CAR_BY_ID[mode.forcedCar];
    const key = JSON.stringify([ps, view.isHost, view.myId, mode && mode.id, view.phase]);
    if (key === slotKey) return;
    slotKey = key;
    const fk = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.fkey;
    const had = slots.contains(document.activeElement);
    clear(slots);
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = ps[i];
      if (!p) {
        const canAdd = view.isHost && !(mode && mode.bots === false) && view.phase !== 'racing';
        slots.append(h('div.ar-slot.empty', h('span.ar-slot-i', String(i + 1)),
          canAdd ? h('button.ar-btn.small.ghost', { type: 'button', 'data-fkey': 'slot-add-' + i, onclick: () => hd.onAddBot && hd.onAddBot() }, icon('plus'), h('span', 'Agregar bot'))
            : h('span.dim', mode && mode.bots === false && view.isHost ? 'Este modo no lleva bots' : 'Lugar libre')));
        continue;
      }
      const me = p.id === view.myId;
      const role = p.role === 'policia' ? h('span.ar-role.cop', icon('shield'), 'Policía') : p.role === 'fugitivo' ? h('span.ar-role.fug', icon('mask'), 'Fugitivo') : null;
      const link = p.link && LINK[p.link] ? h('span.ar-link.' + LINK[p.link][1], { title: 'Conexión' }, icon('signal'), LINK[p.link][0]) : null;
      const state = p.isHost ? h('span.ar-pill.host', 'Anfitrión') : p.isBot ? h('span.ar-pill.ok', 'Listo') : p.ready ? h('span.ar-pill.ok', icon('check'), 'Listo') : h('span.ar-pill', 'Esperando');
      slots.append(h('div.ar-slot' + (me ? '.me' : '') + (p.ready || p.isBot ? '.ready' : ''),
        h('span.ar-slot-i', String(i + 1)),
        h('span.ar-slot-av', icon(p.isBot ? 'bot' : 'user')),
        h('div.ar-slot-n',
          h('b', p.isHost ? h('span.ar-crown', { title: 'Anfitrión' }, icon('crown')) : null, h('span', p.name || '—'), me ? h('span.ar-you', 'TÚ') : null, p.isBot ? h('span.ar-bot', 'BOT') : null),
          h('small', forcedDef ? carName(forcedDef) : carLabel(p.car))),
        h('div.ar-slot-r', role, link, state,
          view.isHost && p.isBot && view.phase !== 'racing' ? h('button.ar-iconbtn', { type: 'button', title: 'Quitar bot', 'aria-label': 'Quitar bot', 'data-fkey': 'slot-rm-' + p.id, onclick: () => hd.onRemoveBot && hd.onRemoveBot(p.id) }, icon('x')) : null)));
    }
    if (had && fk && !ui.nav.restore(fk)) { const b = slots.querySelector('button'); if (b) b.focus({ preventScroll: true }); else ui.nav.focusDefault(); }
  };
  const paintChat = () => {
    const chat = view.chat || [];
    const key = chat.length + '|' + (chat.length ? chat[chat.length - 1].name + chat[chat.length - 1].text : '');
    if (key === chatKey) return;
    chatKey = key;
    clear(chatList);
    if (!chat.length) chatList.append(h('p.ar-p.dim', 'Saluda a los demás pilotos.'));
    for (const m of chat.slice(-50)) chatList.append(h('div.ar-chatmsg' + (m.name === save.data.playerName ? '.me' : ''), h('b', m.name || '—'), h('span', m.text || '')));
    chatList.scrollTop = chatList.scrollHeight;
  };
  const update = v => {
    view = v || view;
    if (!view) return;
    codeV.textContent = view.code || '·····';
    nameV.textContent = view.name || 'Sala ' + (view.code || '');
    visV.textContent = '';
    visV.append(icon(view.isPublic ? 'globe' : 'lock'), view.isPublic ? 'Pública' : 'Privada');
    const racing = view.phase === 'racing';
    rs.set(view.settings || {}, view.isHost && !racing);
    hostNote.textContent = racing ? 'Hay una carrera en curso; entras en la siguiente.' : view.isHost ? 'Tú eliges pista, modo y reglas.' : 'Solo el anfitrión cambia las reglas.';
    const mode = d.MODE_BY_ID[view.settings && view.settings.modeId];
    picker.refresh(!!(mode && mode.forcedCar) || racing);
    paintSlots();
    paintChat();
    const me = myPlayer();
    readyBtn.style.display = view.isHost ? 'none' : '';
    readyBtn.textContent = '';
    readyBtn.classList.toggle('on', !!(me && me.ready));
    readyBtn.append(icon(me && me.ready ? 'check' : 'flag'), h('span', me && me.ready ? 'Listo (cancelar)' : 'Estoy listo'));
    readyBtn.disabled = racing;
    startBtn.style.display = view.isHost ? '' : 'none';
    startBtn.disabled = !view.canStart;
    const fa = document.activeElement;
    if ((fa === readyBtn || fa === startBtn) && (fa.disabled || fa.style.display === 'none')) ui.nav.focusDefault();
    startNote.textContent = view.isHost ? (racing ? 'Carrera en curso' : view.canStart ? '' : 'Esperando a que todos estén listos') : (racing ? 'Carrera en curso' : me && me.ready ? 'Esperando al anfitrión…' : '');
  };

  const f = ui.frame({ name: 'room', title: 'Sala', kicker: 'En línea', onBack: leave });
  f.body.append(
    h('div.ar-roomleft',
      h('section.ar-panel.ar-roomhead', h('div', h('div.ar-roomtags', visV), nameV),
        h('div.ar-codebox', h('span.ar-lbl', 'Código de sala'), h('div.ar-coderow', codeV, copyBtn))),
      h('section.ar-panel.ar-slotspanel', h('h2.ar-h2', icon('users'), 'Pilotos'), slots),
      h('div.ar-roombar', leaveBtn, h('div.ar-grow'), startNote, readyBtn, startBtn)),
    h('div.ar-roomright',
      h('section.ar-panel.ar-roomset', h('h2.ar-h2', icon('flag'), 'Carrera'), hostNote, rs.el),
      h('section.ar-panel.ar-roomcar', row('Tu auto', picker.el)),
      h('section.ar-panel.ar-chat', h('h2.ar-h2', icon('chat'), 'Chat'), chatList, h('div.ar-chatrow', chatIn, sendBtn))));
  readyBtn.dataset.autofocus = '';
  startBtn.dataset.autofocus = '';
  rs.el.querySelector('[data-fkey="rs-track"]').dataset.autofocus = '';
  if (ui._roomView) update(ui._roomView);
  return {
    name: 'room', el: f.el, foot: f.foot, back: leave, update,
    hints: [['move', 'Mover'], ['ok', 'Aceptar'], ['back', 'Salir']],
    onSave: () => picker.refresh(),
  };
}
