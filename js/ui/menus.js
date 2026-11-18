// Pantallas de menú: inicio, ajustes, código de partida, récords y controles.
import { h, icon, flag, stepper, slider, toggle, statBars, row, fmtMoney, fmtTime, fmtNum, carName, className, countryName } from './dom.js';
import { DEFAULT_SETTINGS } from '../core/save.js';

// ---------------------------------------------------------------------------------------------
// Inicio
export function mainScreen(ui, hd) {
  const d = ui.d, save = ui.save;
  const big = (ic, t, sub, fn, auto) => h('button.ar-mbtn.big', { type: 'button', onclick: fn, disabled: !fn, 'data-autofocus': auto, 'data-fkey': 'm-' + t },
    h('span.ar-mbtn-ico', icon(ic)), h('span.ar-mbtn-t', h('b', t), h('small', sub)), icon('right', 'chev'));
  const small = (ic, t, fn) => h('button.ar-mbtn', { type: 'button', onclick: fn, disabled: !fn, 'data-fkey': 'm-' + t }, h('span.ar-mbtn-ico', icon(ic)), h('b', t));
  const menu = h('nav.ar-mainmenu',
    big('globe', 'Jugar en línea', 'Salas públicas o con código de 5 letras', hd.onOnline, true),
    big('flag', 'Práctica', 'Contra bots, a tu ritmo', hd.onPractice),
    h('div.ar-mgrid',
      small('wrench', 'Garaje', hd.onGarage),
      small('car', 'Concesionaria', hd.onDealer),
      small('trophy', 'Récords', hd.onRecords),
      small('gear', 'Ajustes', hd.onSettings),
      small('key', 'Código de partida', hd.onSaveCode),
      small('gamepad', 'Controles', () => ui.showControls({ onBack: () => ui.showMain(hd) })),
    ));
  const logo = h('div.ar-logo', h('span.l1', 'ASFALTO'), h('span.l2', 'REGIO'), h('span.l3', 'Carreras 3D en línea · Nuevo León'));
  const foot = h('footer.ar-hints');
  const left = h('div.ar-main-left', logo, menu, foot);

  // tarjeta del piloto
  const name = h('input.ar-name', { type: 'text', maxlength: 16, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Nombre del piloto', 'data-fkey': 'm-name' });
  name.value = save.data.playerName;
  const commit = () => { const v = name.value.trim(); if (v && v !== save.data.playerName) { save.setName(v); ui.toast('Nombre guardado'); } name.value = save.data.playerName; };
  name.addEventListener('change', commit);
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
  name.addEventListener('blur', commit);
  const carBox = h('div.ar-pcar');
  const stats = statBars('mini');
  const card = h('aside.ar-player.ar-panel',
    h('div.ar-player-top', h('span.ar-lbl', 'Piloto'), h('label.ar-name-wrap', name, icon('edit'))),
    h('div.ar-player-money', h('span.ar-lbl', 'Dinero'), h('span.ar-money-v.big', fmtMoney(save.data.money))),
    h('div.ar-lbl', 'Auto actual'), carBox, stats.el);
  const paintCar = () => {
    const c = save.currentCar();
    const def = c && d.CAR_BY_ID[c.carId];
    carBox.textContent = '';
    if (!def) { carBox.append(h('b', c ? c.carId : '—')); stats.set({}); return; }
    carBox.append(flag(def.country, d.COUNTRIES), h('div', h('b', carName(def)), h('small', `${def.year || ''} · ${className(def.class)}`)));
    stats.set(ui.stats(def, c.upgrades));
  };
  paintCar();

  const el = h('section.ar-screen.sc-main', left, card);
  return {
    name: 'main', el, foot, hints: [['move', 'Mover'], ['ok', 'Aceptar']],
    back: null,
    onSave: () => { paintCar(); if (document.activeElement !== name) name.value = save.data.playerName; },
  };
}

// ---------------------------------------------------------------------------------------------
// Ajustes
export function settingsScreen(ui, hd) {
  const save = ui.save;
  const S = () => save.data.settings;
  const set = patch => { save.setSettings(patch); try { hd.onChange && hd.onChange({ ...save.data.settings }); } catch (e) { console.error(e); } };
  const pct = v => Math.round(v * 100) + '%';
  const vol = (key, label) => row(label, slider({ min: 0, max: 1, step: 0.05, value: S()[key] ?? 0.8, format: pct, onInput: v => set({ [key]: v }), fkey: 's-' + key }).el);
  const sec = (ic, title, ...rows) => h('section.ar-panel.ar-set', h('h2.ar-h2', icon(ic), title), rows);

  const graphics = sec('monitor', 'Gráficos',
    row('Calidad', stepper({ options: [{ id: 'lowpoly', name: 'Low poly', sub: 'Rápido, 60 fps en equipos modestos' }, { id: 'semi', name: 'Semirrealista', sub: 'Sombras y más detalle' }], value: S().graphics, onChange: v => set({ graphics: v }), fkey: 's-graphics' }).el, 'Se aplica en la siguiente carrera'),
    row('Escala de resolución', slider({ min: 0.5, max: 1, step: 0.05, value: S().renderScale ?? 1, format: pct, onInput: v => set({ renderScale: v }), fkey: 's-scale' }).el, 'Bájala si el juego va lento'),
    row('Campo de visión', slider({ min: 50, max: 100, step: 1, value: S().fov ?? 70, format: v => v + '°', onInput: v => set({ fov: v }), fkey: 's-fov' }).el),
    row('Mostrar FPS', toggle({ value: S().showFps, onChange: v => set({ showFps: v }), fkey: 's-fps' }).el),
  );
  const audio = sec('volume', 'Audio',
    vol('masterVol', 'Volumen general'), vol('musicVol', 'Música'), vol('sfxVol', 'Efectos'), vol('engineVol', 'Motores'), vol('voiceVol', 'Voz del narrador'),
    row('Narrador', toggle({ value: S().narrator, onChange: v => set({ narrator: v }), fkey: 's-narr' }).el),
  );
  const game = sec('wheel', 'Manejo y cámara',
    row('Caja de cambios', stepper({ options: [{ id: 'auto', name: 'Automática' }, { id: 'manual', name: 'Manual', sub: 'E / Q · RB / LB' }], value: S().gearbox, onChange: v => set({ gearbox: v }), fkey: 's-box' }).el),
    row('Cámara por defecto', stepper({ options: [{ id: 0, name: 'Cabina' }, { id: 1, name: 'Cofre' }, { id: 2, name: 'Tercera persona cerca' }, { id: 3, name: 'Tercera persona lejos' }], value: S().camera, onChange: v => set({ camera: +v }), fkey: 's-cam' }).el, 'Cámbiala en carrera con C / Y'),
    row('Retrovisor', toggle({ value: S().mirror, onChange: v => set({ mirror: v }), fkey: 's-mirror' }).el),
    row('Nombres sobre los autos', toggle({ value: S().showNames, onChange: v => set({ showNames: v }), fkey: 's-names' }).el),
    h('div.ar-actions', h('button.ar-btn.small.ghost', {
      type: 'button', 'data-fkey': 's-reset',
      onclick: async () => {
        if (!await ui.confirm({ title: 'Restablecer ajustes', text: '¿Regresar todos los ajustes a sus valores de fábrica?', ok: 'Restablecer' })) return;
        set({ ...DEFAULT_SETTINGS });
        ui.showSettings(hd);
        ui.toast('Ajustes restablecidos');
      },
    }, icon('restart'), 'Valores de fábrica')),
  );
  const f = ui.frame({ name: 'settings', title: 'Ajustes', kicker: 'Configuración', onBack: hd.onBack });
  f.body.append(h('div.ar-setgrid', graphics, audio, game));
  return { name: 'settings', el: f.el, foot: f.foot, back: hd.onBack, hints: [['move', 'Mover'], ['adjust', 'Ajustar'], ['back', 'Atrás']] };
}

// ---------------------------------------------------------------------------------------------
// Código de partida
export function saveCodeScreen(ui, hd) {
  const save = ui.save;
  const out = h('textarea.ar-code', { readonly: true, rows: 6, spellcheck: 'false', 'data-fkey': 'c-out' });
  out.value = save.exportCode();
  const copy = async () => {
    out.value = save.exportCode();
    try { await navigator.clipboard.writeText(out.value); ui.toast('Código copiado'); }
    catch { out.select(); document.execCommand && document.execCommand('copy'); ui.toast('Código seleccionado: cópialo con Ctrl+C'); }
  };
  const inp = h('textarea.ar-code', { rows: 6, spellcheck: 'false', placeholder: 'Pega aquí tu código (empieza con AR1-…)', 'data-fkey': 'c-in' });
  const msg = h('p.ar-msg');
  const doImport = async () => {
    const code = inp.value.trim();
    msg.className = 'ar-msg';
    if (!code) { msg.textContent = 'Pega un código primero.'; msg.classList.add('bad'); return; }
    const ok = await ui.confirm({ title: 'Importar partida', text: 'Esto reemplaza tu progreso actual en este navegador: dinero, autos, mejoras, ajustes y récords. ¿Continuar?', ok: 'Importar', danger: true });
    if (!ok) return;
    if (save.importCode(code)) {
      msg.textContent = `Partida importada. Bienvenido de vuelta, ${save.data.playerName}.`;
      msg.classList.add('good');
      out.value = save.exportCode();
      inp.value = '';
      ui.sfx('compra');
      try { hd.onImport && hd.onImport(); } catch (e) { console.error(e); }
    } else {
      msg.textContent = 'El código no es válido o está incompleto. Revisa que lo copiaste completo.';
      msg.classList.add('bad');
      ui.sfx('error');
    }
  };
  const f = ui.frame({ name: 'savecode', title: 'Código de partida', kicker: 'Lleva tu progreso a otro navegador', onBack: hd.onBack });
  f.body.append(h('div.ar-codegrid',
    h('section.ar-panel', h('h2.ar-h2', icon('download'), 'Exportar'),
      h('p.ar-p', 'Guarda este código en un lugar seguro. Con él recuperas tu dinero, autos y récords en cualquier navegador.'),
      out, h('div.ar-actions', h('button.ar-btn.primary', { type: 'button', onclick: copy, 'data-autofocus': true }, icon('copy'), 'Copiar código'))),
    h('section.ar-panel', h('h2.ar-h2', icon('upload'), 'Importar'),
      h('p.ar-p', 'Pega un código exportado. Tu progreso actual se reemplaza.'),
      inp, h('div.ar-actions', h('button.ar-btn', { type: 'button', onclick: doImport }, icon('upload'), 'Importar código')), msg)));
  return { name: 'savecode', el: f.el, foot: f.foot, back: hd.onBack, hints: [['ok', 'Aceptar'], ['back', 'Atrás']] };
}

// ---------------------------------------------------------------------------------------------
// Récords
export function recordsScreen(ui, hd) {
  const d = ui.d, save = ui.save;
  const tracks = d.TRACKS || [];
  const st = ui._records || (ui._records = { trackId: tracks[0] && tracks[0].id, modeId: null });
  if (!d.TRACK_BY_ID[st.trackId]) st.trackId = tracks[0] && tracks[0].id;
  const modesFor = t => (d.MODES || []).filter(m => m.id !== 'libre' && d.modeFitsTrack(m, t));
  const mine = h('div.ar-myrec');
  const table = h('div.ar-rtable');
  const status = h('p.ar-msg');
  let token = 0, timer = 0;
  const modeStep = stepper({ options: [], value: null, onChange: v => { st.modeId = v; load(); }, fkey: 'r-mode' });
  const trackStep = stepper({
    options: tracks.map(t => ({ id: t.id, name: t.name, sub: t.place || '' })), value: st.trackId, fkey: 'r-track',
    onChange: v => { st.trackId = v; syncModes(); load(); },
  });
  trackStep.el.dataset.autofocus = '';
  const syncModes = () => {
    const t = d.TRACK_BY_ID[st.trackId];
    const ms = modesFor(t);
    if (!ms.some(m => m.id === st.modeId)) st.modeId = ms[0] && ms[0].id;
    modeStep.set(st.modeId, ms.map(m => ({ id: m.id, name: m.name })));
  };
  const fmtVal = (mode, v) => mode && mode.ranking === 'score' ? fmtNum(v) + ' pts' : fmtTime(v);
  const fmtDate = at => { if (!at) return ''; const t = new Date(at); return isNaN(t) ? '' : t.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const carLabel = c => { const def = d.CAR_BY_ID[c]; return def ? carName(def) : (c || ''); };
  const load = () => {
    clearTimeout(timer);
    const my = ++token;
    const mode = d.MODE_BY_ID[st.modeId];
    const rec = st.trackId && st.modeId ? save.getRecord(st.trackId, st.modeId) : null;
    mine.textContent = '';
    mine.append(h('span.ar-lbl', 'Tu récord'), rec ? h('b', fmtVal(mode, rec.ms)) : h('b.dim', 'Sin récord'),
      rec ? h('small', `${carLabel(rec.carId)} · ${fmtDate(rec.at)}`) : h('small', 'Corre esta pista en este modo para marcar uno'));
    table.textContent = '';
    status.className = 'ar-msg';
    status.textContent = 'Cargando récords…';
    if (!hd.fetch || !st.trackId || !st.modeId) { status.textContent = hd.fetch ? '' : 'Récords en línea no disponibles.'; return; }
    timer = setTimeout(() => {
      Promise.resolve().then(() => hd.fetch(st.trackId, st.modeId)).then(list => {
        if (my !== token) return;
        list = Array.isArray(list) ? list : [];
        status.textContent = list.length ? '' : 'Todavía no hay récords aquí. ¡Sé el primero!';
        table.append(h('div.ar-rrow.head', h('span', '#'), h('span', 'Piloto'), h('span', 'Auto'), h('span', mode && mode.ranking === 'score' ? 'Puntos' : 'Tiempo'), h('span', 'Fecha')));
        list.slice(0, 50).forEach((r, i) => table.append(h('div.ar-rrow' + (i < 3 ? '.top' + (i + 1) : '') + (r.name === save.data.playerName ? '.me' : ''),
          h('b', String(i + 1)), h('span', r.name || '—'), h('span.dim', carLabel(r.car)), h('b.t', fmtVal(mode, r.ms)), h('span.dim', fmtDate(r.at)))));
      }).catch(e => {
        if (my !== token) return;
        console.warn(e);
        status.textContent = 'No se pudieron cargar los récords. Revisa tu conexión.';
        status.classList.add('bad');
      });
    }, 220);
  };
  syncModes();
  load();
  const f = ui.frame({ name: 'records', title: 'Récords', kicker: 'Los mejores de cada pista', onBack: hd.onBack });
  f.body.append(h('div.ar-recgrid',
    h('section.ar-panel.ar-recpick', row('Pista', trackStep.el), row('Modo', modeStep.el), mine),
    h('section.ar-panel.ar-reclist', h('h2.ar-h2', icon('trophy'), 'Tabla mundial'), table, status)));
  return { name: 'records', el: f.el, foot: f.foot, back: hd.onBack, dispose: () => { token++; clearTimeout(timer); }, hints: [['adjust', 'Cambiar'], ['back', 'Atrás']] };
}

// ---------------------------------------------------------------------------------------------
// Controles
const KEYS = [
  ['Acelerar', 'W / ↑', 'RT'], ['Frenar / reversa', 'S / ↓', 'LT'], ['Dirección', 'A D / ← →', 'Stick izquierdo'],
  ['Freno de mano', 'Espacio', 'A'], ['Nitro', 'Shift / N', 'X'], ['Subir cambio', 'E', 'RB'], ['Bajar cambio', 'Q', 'LB'],
  ['Cambiar cámara', 'C', 'Y'], ['Mirar atrás', 'B', 'B'], ['Regresar a la pista', 'R', 'Back'], ['Pausa', 'Esc', 'Start'],
  ['Claxon', 'H', '—'], ['Retrovisor', 'M', '—'],
];
export function controlsScreen(ui, hd) {
  let list = KEYS;
  try {
    const b = ui.d.input && ui.d.input.bindingsText && ui.d.input.bindingsText();
    if (Array.isArray(b) && b.length) list = b.map(x => [x.accion, x.teclado, x.control]);
  } catch { /* uso la tabla fija */ }
  const caps = txt => h('span.ar-caps', String(txt || '—').split(/\s+\/\s+|\s*,\s*/).map((k, i) => [i ? h('i', '/') : null, h('kbd.ar-kbd', k)]));
  const tbl = h('div.ar-ctable', h('div.ar-crow.head', h('span', 'Acción'), h('span', icon('keyboard'), 'Teclado'), h('span', icon('gamepad'), 'Control')),
    list.map(([a, k, c]) => h('div.ar-crow', h('b', a), caps(k), caps(c))));
  const tips = h('section.ar-panel.ar-ctips', h('h2.ar-h2', icon('info'), 'En los menús'),
    h('p.ar-p', 'Flechas o D-pad para moverte, Enter o A para aceptar, Esc o B para regresar. En el garaje cambias de pestaña con Q / E o LB / RB.'),
    h('h2.ar-h2', icon('car'), 'Consejos'),
    h('ul.ar-ul',
      h('li', 'Sin choques entre autos: se atraviesan, pero si alcanzas a otro por detrás pierdes puntos y velocidad. Rebasa por un lado.'),
      h('li', 'Los golpes contra el muro dañan el auto y le quitan potencia.'),
      h('li', 'En caja manual cambia cuando se encienden todas las luces del tacómetro.'),
      h('li', 'R (o Back) te regresa a la pista si te sales o te volteas.')));
  const f = ui.frame({ name: 'controls', title: 'Controles', kicker: 'Teclado y control', onBack: hd.onBack });
  const back = h('button.ar-btn', { type: 'button', onclick: hd.onBack, 'data-autofocus': true }, icon('back'), 'Regresar');
  f.body.append(h('div.ar-ctlgrid', h('section.ar-panel', tbl, h('div.ar-actions', back)), tips));
  return { name: 'controls', el: f.el, foot: f.foot, back: hd.onBack, hints: [['back', 'Atrás']] };
}

export { countryName };
