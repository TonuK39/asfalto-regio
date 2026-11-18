// Concesionaria y garaje (mejoras, pintura y estilo, vender), con vista 3D giratoria.
import { h, put, icon, flag, stepper, statBars, clear, fmtMoney, fmtNum, carName, className, countryName, hp, engineText, isHex, DRIVE_NAMES, CLASS_NAMES } from './dom.js';

const KNOWN_MAX = { motor: 4, turbo: 3, transmision: 3, llantas: 4, suspension: 3, frenos: 3, peso: 3, nitro: 3 };
const UP_ICON = { motor: 'gear', turbo: 'sparkle', transmision: 'wheel', llantas: 'tire', suspension: 'car', frenos: 'shield', peso: 'minus', nitro: 'bolt' };

// Niveles de una mejora: acepta listas con o sin el nivel 0 «de fábrica».
export function upgradeInfo(ui, carDef, key) {
  const U = (ui.d.UPGRADES || {})[key] || { name: key, levels: [] };
  const levels = U.levels || [];
  let withZero;
  if (KNOWN_MAX[key] != null && levels.length === KNOWN_MAX[key] + 1) withZero = true;
  else if (KNOWN_MAX[key] != null && levels.length === KNOWN_MAX[key]) withZero = false;
  else withZero = !!levels.length && !levels[0].price;
  const max = withZero ? levels.length - 1 : levels.length;
  const lv = L => (withZero ? levels[L] : levels[L - 1]) || null;
  const price = L => {
    if (L <= 0) return 0;
    try { if (ui.d.upgradePrice) { const p = ui.d.upgradePrice(carDef, key, L); if (p != null && isFinite(p)) return Math.round(p); } } catch (e) { console.warn(e); }
    return Math.round((lv(L) && lv(L).price) || 0);
  };
  return { U, max, lv, price };
}

export function sellValue(ui, entry, def) {
  let spent = 0;
  for (const key of Object.keys(ui.d.UPGRADES || {})) {
    const info = upgradeInfo(ui, def, key);
    const cur = (entry.upgrades && entry.upgrades[key]) || 0;
    for (let L = 1; L <= Math.min(cur, info.max); L++) spent += info.price(L);
  }
  return Math.round(0.6 * ((def && def.price || 0) + spent));
}

function specLine(ui, def, upg) {
  const s = ui.spec(def, upg) || {};
  return {
    hp: hp(s), kg: s.massKg ? Math.round(s.massKg) : null,
    drive: DRIVE_NAMES[s.drivetrain] || s.drivetrain || '', engine: engineText(def && def.engine),
    nitro: s.nitroCapacity ? s.nitroCapacity.toFixed(1) + ' s' : 'No',
  };
}
const specGrid = (items) => h('div.ar-specs', items.filter(Boolean).map(([l, v, cls]) => h('div.ar-spec' + (cls ? '.' + cls : ''), h('span', l), h('b', v))));

// ---------------------------------------------------------------------------------------------
// Concesionaria
export function dealerScreen(ui, hd) {
  const d = ui.d, save = ui.save;
  const cars = (d.CARS || []).filter(c => !c.hidden && c.price > 0);
  const st = ui._dealer || (ui._dealer = { country: 'all', cls: 'all', price: 'all', sort: 'precio', sel: null });
  const owned = id => save.data.garage.some(g => g.carId === id);
  if (!cars.some(c => c.id === st.sel)) st.sel = (cars.find(c => !owned(c.id)) || cars[0] || {}).id;

  // filtros
  const count = {};
  cars.forEach(c => { count[c.country] = (count[c.country] || 0) + 1; });
  const countries = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
  const chip = (grp, id, kids, title) => h('button.ar-chip', { type: 'button', 'data-fkey': `f-${grp}-${id}`, title, onclick: () => { st[grp] = id; paintFilters(); applyFilter(); } }, kids);
  const cBar = h('div.ar-chips.ar-flags', chip('country', 'all', 'Todos'), countries.map(c => chip('country', c, [flag(c, d.COUNTRIES), h('span', c)], countryName(c, d.COUNTRIES))));
  const classOrder = Object.keys(CLASS_NAMES);
  const classes = [...new Set(cars.map(c => c.class))].sort((a, b) => classOrder.indexOf(a) - classOrder.indexOf(b));
  const kBar = h('div.ar-chips', chip('cls', 'all', 'Todas'), classes.map(c => chip('cls', c, className(c))));
  const priceStep = stepper({
    options: [{ id: 'all', name: 'Cualquier precio' }, { id: 'afford', name: 'Me alcanza' }, { id: 'p60', name: 'Hasta $60,000' }, { id: 'p150', name: 'Hasta $150,000' }, { id: 'p400', name: 'Hasta $400,000' }, { id: 'pmax', name: 'Más de $400,000' }],
    value: st.price, onChange: v => { st.price = v; applyFilter(); }, fkey: 'f-price',
  });
  const sortStep = stepper({
    options: [{ id: 'precio', name: 'Precio ↑' }, { id: 'precio-d', name: 'Precio ↓' }, { id: 'hp', name: 'Potencia' }, { id: 'marca', name: 'Marca A-Z' }],
    value: st.sort, onChange: v => { st.sort = v; applyFilter(); }, fkey: 'f-sort',
  });
  const paintFilters = () => {
    cBar.querySelectorAll('.ar-chip').forEach(b => b.classList.toggle('on', b.dataset.fkey === 'f-country-' + st.country));
    kBar.querySelectorAll('.ar-chip').forEach(b => b.classList.toggle('on', b.dataset.fkey === 'f-cls-' + st.cls));
  };

  // tarjetas
  const grid = h('div.ar-cards');
  const empty = h('p.ar-msg', 'Ningún auto coincide con los filtros.');
  const cards = new Map();
  for (const c of cars) {
    const stats = statBars('mini');
    stats.set(ui.stats(c, null));
    const own = h('span.ar-own', icon('check'), 'En tu garaje');
    const card = h('button.ar-card', { type: 'button', 'data-fkey': 'car-' + c.id, onclick: () => { if (st.sel === c.id) buyBtn.focus(); else select(c.id); } },
      h('i.ar-card-stripe', { style: { background: c.color || '#888' } }),
      h('div.ar-card-top', flag(c.country, d.COUNTRIES), h('span.ar-tag', className(c.class)), own),
      h('div.ar-card-name', h('small', c.brand + (c.year ? ' · ' + c.year : '')), h('b', c.model)),
      stats.el,
      h('div.ar-card-foot', h('b.ar-price', fmtMoney(c.price)), h('span', (hp(ui.spec(c, null)) || '—') + ' hp')));
    card.addEventListener('focus', () => select(c.id));
    cards.set(c.id, { card, own });
  }
  const priceOk = c => {
    switch (st.price) {
      case 'afford': return c.price <= save.data.money;
      case 'p60': return c.price <= 60000;
      case 'p150': return c.price <= 150000;
      case 'p400': return c.price <= 400000;
      case 'pmax': return c.price > 400000;
      default: return true;
    }
  };
  const applyFilter = () => {
    const list = cars.filter(c => (st.country === 'all' || c.country === st.country) && (st.cls === 'all' || c.class === st.cls) && priceOk(c));
    const hpOf = c => hp(ui.spec(c, null)) || 0;
    list.sort(st.sort === 'precio-d' ? (a, b) => b.price - a.price : st.sort === 'hp' ? (a, b) => hpOf(b) - hpOf(a)
      : st.sort === 'marca' ? (a, b) => carName(a).localeCompare(carName(b)) : (a, b) => a.price - b.price);
    const show = new Set(list.map(c => c.id));
    for (const [id, { card }] of cards) card.classList.toggle('is-hidden', !show.has(id));
    list.forEach(c => grid.append(cards.get(c.id).card));
    empty.style.display = list.length ? 'none' : '';
  };

  // detalle
  const previewHost = h('div.ar-preview');
  const det = h('div.ar-detail-body');
  const buyBtn = h('button.ar-btn.primary.ar-buy', { type: 'button', onclick: () => buy() });
  const detail = h('section.ar-panel.ar-detail', det, h('div.ar-actions', buyBtn));
  const dstats = statBars();
  let showT = 0;
  const select = id => {
    if (st.sel === id && det.childElementCount) return;
    st.sel = id;
    for (const [cid, { card }] of cards) card.classList.toggle('sel', cid === id);
    paintDetail();
    clearTimeout(showT);
    const c = d.CAR_BY_ID[id];
    showT = setTimeout(() => ui.preview.show(c, d.defaultCustom ? d.defaultCustom(c) : null), 90);
  };
  const paintDetail = () => {
    const c = d.CAR_BY_ID[st.sel];
    clear(det);
    if (!c) { buyBtn.disabled = true; buyBtn.textContent = 'Sin autos'; return; }
    const sp = specLine(ui, c, null);
    dstats.set(ui.stats(c, null));
    det.append(
      h('div.ar-detail-top', flag(c.country, d.COUNTRIES), h('span', countryName(c.country, d.COUNTRIES)), c.year ? h('span.dim', String(c.year)) : null, h('span.ar-tag', className(c.class)),
        owned(c.id) ? h('span.ar-own.on', icon('check'), 'En tu garaje') : null),
      h('h2.ar-carname', h('small', c.brand), h('b', c.model)),
      h('div.ar-bigprice', fmtMoney(c.price)),
      specGrid([['Potencia', sp.hp ? sp.hp + ' hp' : '—'], ['Peso', sp.kg ? fmtNum(sp.kg) + ' kg' : '—'], ['Tracción', sp.drive || '—'], ['Motor', sp.engine || '—']]),
      dstats.el);
    const money = save.data.money;
    buyBtn.textContent = '';
    if (money >= c.price) { buyBtn.disabled = false; buyBtn.append(icon('cart'), h('span', 'Comprar')); }
    else { buyBtn.disabled = true; buyBtn.append(icon('lock'), h('span', 'Te faltan ' + fmtMoney(c.price - money))); }
  };
  const buy = async () => {
    const c = d.CAR_BY_ID[st.sel];
    if (!c) return;
    const money = save.data.money;
    if (money < c.price) { ui.sfx('error'); ui.toast('Te faltan ' + fmtMoney(c.price - money)); return; }
    const ok = await ui.confirm({
      title: 'Confirmar compra',
      text: `¿Comprar ${carName(c)} por ${fmtMoney(c.price)}? Te quedarán ${fmtMoney(money - c.price)}.` + (owned(c.id) ? ' Ya tienes uno igual en tu garaje.' : ''),
      ok: 'Comprar',
    });
    if (!ok) return;
    const entry = save.buyCar(c.id, c.price, d.defaultCustom ? d.defaultCustom(c) : null);
    if (entry) { ui.sfx('compra'); ui.toast(`${carName(c)} ya está en tu garaje y es tu auto actual`); }
    else { ui.sfx('error'); ui.toast('No se pudo completar la compra'); }
  };
  const refresh = () => {
    for (const [id, { own }] of cards) own.classList.toggle('on', owned(id));
    if (st.price === 'afford') applyFilter();
    paintDetail();
  };

  const f = ui.frame({ name: 'dealer', title: 'Concesionaria', kicker: `${cars.length} autos a la venta`, onBack: hd.onBack });
  f.body.append(
    h('section.ar-panel.ar-shopleft',
      h('div.ar-filters', h('div.ar-frow', h('span.ar-lbl', 'País'), cBar), h('div.ar-frow', h('span.ar-lbl', 'Clase'), kBar),
        h('div.ar-frow.two', h('div', h('span.ar-lbl', 'Precio'), priceStep.el), h('div', h('span.ar-lbl', 'Ordenar'), sortStep.el))),
      h('div.ar-scroll', grid, empty)),
    h('div.ar-shopright', previewHost, detail));
  paintFilters();
  applyFilter();
  const sel0 = st.sel; st.sel = null;
  if (sel0) select(sel0);
  if (sel0 && cards.get(sel0)) cards.get(sel0).card.dataset.autofocus = '';
  ui.preview.attach(previewHost);
  return {
    name: 'dealer', el: f.el, foot: f.foot, back: hd.onBack,
    hints: [['move', 'Mover'], ['ok', 'Elegir / comprar'], ['back', 'Atrás']],
    onSave: refresh,
    dispose: () => { clearTimeout(showT); ui.preview.detach(previewHost); },
  };
}

// ---------------------------------------------------------------------------------------------
// Personalización: secciones a partir de CUSTOM_OPTIONS
const CUSTOM_LABELS = {
  paint: 'Pintura', finish: 'Acabado', vinyl: 'Vinil', vinylColor: 'Color del vinil', number: 'Número', rims: 'Rines',
  rimColor: 'Color de rines', caliper: 'Calipers de freno', spoiler: 'Alerón', bodykit: 'Kit de carrocería', tint: 'Polarizado',
  underglow: 'Neón inferior', smoke: 'Humo de llantas', lights: 'Color de luces', plate: 'Placa', ride: 'Altura',
};
const COLOR_KEYS = new Set(['paint', 'vinylColor', 'rimColor', 'caliper', 'underglow', 'smoke', 'lights']);
const ORDER = ['paint', 'finish', 'vinyl', 'vinylColor', 'number', 'rims', 'rimColor', 'caliper', 'spoiler', 'bodykit', 'ride', 'tint', 'underglow', 'lights', 'smoke', 'plate'];
const eq = (a, b) => String(a ?? 'null').toLowerCase() === String(b ?? 'null').toLowerCase();

export function customSections(CO) {
  const keys = Object.keys(CO || {});
  const oi = k => { const i = ORDER.indexOf(k); return i < 0 ? 99 : i; };
  keys.sort((a, b) => oi(a) - oi(b));
  const out = [];
  for (const key of keys) {
    const raw = CO[key];
    const obj = raw && !Array.isArray(raw) && typeof raw === 'object' ? raw : null;
    const list = Array.isArray(raw) ? raw : obj && (obj.options || obj.values || obj.items);
    const label = (obj && (obj.label || obj.name)) || CUSTOM_LABELS[key] || key;
    const base = obj && typeof obj.price === 'number' ? obj.price : 0;
    if (!Array.isArray(list)) {
      if (key === 'plate') out.push({ key, label, type: 'text', price: base });
      else if (key === 'number') out.push({ key, label, type: 'number', price: base });
      else if (obj && 'min' in obj && 'max' in obj) {
        const stp = obj.step || 1, opts = [];
        for (let v = obj.min; v <= obj.max + 1e-9; v += stp) opts.push({ id: +v.toFixed(3), name: String(+v.toFixed(3)), price: base });
        out.push({ key, label, type: 'step', opts, freePrice: base });
      }
      continue;
    }
    const opts = list.map(o => (o && typeof o === 'object')
      ? { id: o.id !== undefined ? o.id : (o.value !== undefined ? o.value : null), name: o.name || o.label || String(o.id), price: +o.price || 0, color: o.color || o.hex || (isHex(o.id) ? o.id : null) }
      : { id: o, name: o == null ? 'Ninguno' : String(o), price: 0, color: isHex(o) ? o : null });
    const colorish = COLOR_KEYS.has(key) || (opts.length > 1 && opts.filter(o => o.color).length >= opts.length - 1);
    const type = key === 'plate' ? 'text' : key === 'number' ? 'number' : colorish ? 'color' : opts.length > 10 ? 'step' : 'chips';
    const freePrice = obj && (obj.customPrice ?? obj.freePrice) != null ? +(obj.customPrice ?? obj.freePrice) : (opts.length ? Math.max(...opts.map(o => o.price)) : base);
    out.push({ key, label, type, opts, freePrice, price: base });
  }
  if (!out.some(s => s.key === 'plate')) out.push({ key: 'plate', label: 'Placa', type: 'text', price: 0 });
  if (!out.some(s => s.key === 'number')) out.push({ key: 'number', label: 'Número', type: 'number', price: 0 });
  return out;
}
const optOf = (sec, v) => sec.opts ? sec.opts.find(o => eq(o.id, v)) : null;
const priceOf = (sec, v) => { const o = optOf(sec, v); return o ? o.price : (sec.opts ? (sec.freePrice || 0) : (sec.price || 0)); };
const nameOf = (sec, v) => { const o = optOf(sec, v); if (o) return o.name; if (v == null || v === '') return 'Ninguno'; return isHex(v) ? v.toUpperCase() : String(v); };
const priceTxt = p => p > 0 ? fmtMoney(p) : 'Gratis';

// ---------------------------------------------------------------------------------------------
// Garaje
export function garageScreen(ui, hd) {
  const d = ui.d, save = ui.save;
  const st = ui._garage || (ui._garage = { tab: 'resumen' });
  st.uid = save.data.currentUid;
  const drafts = {};
  const sections = customSections(d.CUSTOM_OPTIONS);
  const entryOf = uid => save.data.garage.find(g => g.uid === uid);
  const defOf = e => e && d.CAR_BY_ID[e.carId];
  const baseCustom = e => { const def = defOf(e); return { ...(d.defaultCustom && def ? d.defaultCustom(def) : {}), ...(e && e.custom || {}) }; };
  const draftOf = e => drafts[e.uid] || (drafts[e.uid] = baseCustom(e));
  const dirtyKeys = e => { if (!drafts[e.uid]) return []; const b = baseCustom(e), dr = drafts[e.uid]; return sections.map(s => s.key).filter(k => !eq(dr[k], b[k])); };
  const anyDirty = () => save.data.garage.some(e => dirtyKeys(e).length);

  const list = h('div.ar-glist');
  const previewHost = h('div.ar-preview');
  const tabsBar = h('div.ar-tabs');
  const content = h('div.ar-tabbody');
  const TABS = [['resumen', 'Resumen', 'car'], ['mejoras', 'Mejoras', 'wrench'], ['estilo', 'Pintura y estilo', 'paint']];
  for (const [id, label, ic] of TABS) tabsBar.append(h('button.ar-tabbtn', { type: 'button', 'data-fkey': 'tab-' + id, onclick: () => setTab(id) }, icon(ic), h('span', label)));
  let showT = 0;
  const showPreview = () => {
    clearTimeout(showT);
    showT = setTimeout(() => { const e = entryOf(st.uid); if (e) ui.preview.show(defOf(e), draftOf(e)); }, 70);
  };

  const setTab = (id, focusTab) => {
    st.tab = id;
    tabsBar.querySelectorAll('.ar-tabbtn').forEach(b => b.classList.toggle('on', b.dataset.fkey === 'tab-' + id));
    paintTab();
    if (focusTab) ui.nav.focus(tabsBar.querySelector(`[data-fkey="tab-${id}"]`));
  };

  const paintList = () => {
    clear(list);
    for (const e of save.data.garage) {
      const def = defOf(e);
      const lvl = Object.values(e.upgrades || {}).reduce((a, b) => a + (b || 0), 0);
      const b = h('button.ar-gcar' + (e.uid === st.uid ? '.sel' : '') + (e.uid === save.data.currentUid ? '.cur' : ''), { type: 'button', 'data-fkey': 'g-' + e.uid, onclick: () => select(e.uid) },
        h('i.ar-gcar-sw', { style: { background: (e.custom && e.custom.paint) || (def && def.color) || '#888' } }),
        h('div.ar-gcar-t', h('small', def ? def.brand : ''), h('b', def ? def.model : e.carId)),
        h('div.ar-gcar-m', def ? flag(def.country, d.COUNTRIES) : null, def ? h('span.ar-tag', className(def.class)) : null, lvl ? h('span.ar-lv', 'Mejoras ' + lvl) : null,
          e.uid === save.data.currentUid ? h('span.ar-cur', icon('star'), 'Actual') : null));
      b.addEventListener('focus', () => select(e.uid));
      list.append(b);
    }
  };

  const select = uid => {
    if (uid === st.uid) return;
    st.uid = uid;
    list.querySelectorAll('.ar-gcar').forEach(b => b.classList.toggle('sel', b.dataset.fkey === 'g-' + uid));
    paintTab();
    showPreview();
  };

  // ---- pestañas ----
  const paintTab = () => {
    clear(content);
    const e = entryOf(st.uid), def = defOf(e);
    if (!e) return;
    if (!def) { content.append(h('p.ar-msg', 'Este auto ya no existe en el catálogo.')); return; }
    if (st.tab === 'mejoras') paintUpgrades(e, def);
    else if (st.tab === 'estilo') paintStyle(e, def);
    else paintSummary(e, def);
  };

  const paintSummary = (e, def) => {
    const sp = specLine(ui, def, e.upgrades);
    const stats = statBars(); stats.set(ui.stats(def, e.upgrades));
    const isCur = e.uid === save.data.currentUid;
    const value = sellValue(ui, e, def);
    const ups = Object.keys(d.UPGRADES || {}).map(k => { const info = upgradeInfo(ui, def, k); const cur = (e.upgrades || {})[k] || 0; return h('span.ar-upchip' + (cur ? '.on' : ''), (info.U.name || k) + ' ' + cur + '/' + info.max); });
    put(content,
      h('div.ar-detail-top', flag(def.country, d.COUNTRIES), h('span', countryName(def.country, d.COUNTRIES)), def.year ? h('span.dim', String(def.year)) : null, h('span.ar-tag', className(def.class))),
      h('h2.ar-carname', h('small', def.brand), h('b', def.model)),
      specGrid([['Potencia', sp.hp ? sp.hp + ' hp' : '—'], ['Peso', sp.kg ? fmtNum(sp.kg) + ' kg' : '—'], ['Tracción', sp.drive || '—'], ['Motor', sp.engine || '—'], ['Nitro', sp.nitro]]),
      stats.el,
      ups.length ? h('div.ar-upchips', ups) : null,
      h('div.ar-actions.col',
        isCur ? h('div.ar-curbadge', icon('star'), 'Es tu auto actual')
          : h('button.ar-btn.primary', { type: 'button', 'data-fkey': 'use', onclick: () => { save.setCurrent(e.uid); ui.sfx('click'); ui.toast(`${carName(def)} es tu auto actual`); } }, icon('check'), 'Usar este auto'),
        h('button.ar-btn.ghost.danger', { type: 'button', 'data-fkey': 'sell', disabled: save.data.garage.length <= 1, title: save.data.garage.length <= 1 ? 'No puedes vender tu único auto' : '', onclick: () => sell(e, def, value) },
          icon('tag'), save.data.garage.length <= 1 ? 'Es tu único auto' : 'Vender por ' + fmtMoney(value))));
  };

  const sell = async (e, def, value) => {
    const ok = await ui.confirm({ title: 'Vender auto', text: `¿Vender ${carName(def)} por ${fmtMoney(value)}? Recibes el 60 % del precio y de sus mejoras. No se puede deshacer.`, ok: 'Vender', danger: true });
    if (!ok) return;
    delete drafts[e.uid];
    if (save.sellCar(e.uid, value)) { ui.sfx('compra'); ui.toast(`Vendiste ${carName(def)} por ${fmtMoney(value)}`); st.uid = save.data.currentUid; render(); showPreview(); }
    else { ui.sfx('error'); ui.toast('No puedes vender tu único auto'); }
  };

  const paintUpgrades = (e, def) => {
    const stats = statBars();
    const base = ui.stats(def, e.upgrades);
    stats.set(base);
    const spBase = specLine(ui, def, e.upgrades);
    const diff = h('div.ar-updiff');
    const showDiff = (key, L) => {
      if (key == null) { stats.set(base); diff.textContent = 'Elige una mejora para ver cómo cambia el auto.'; return; }
      const after = { ...e.upgrades, [key]: L };
      stats.set(base, ui.stats(def, after));
      const sp = specLine(ui, def, after);
      diff.textContent = '';
      const part = (lbl, a, b, unit) => a != null && b != null && a !== b ? h('span', lbl + ' ', h('b', fmtNum(a)), ' → ', h('b.up', fmtNum(b) + unit)) : null;
      put(diff, part('Potencia', spBase.hp, sp.hp, ' hp'), part('Peso', spBase.kg, sp.kg, ' kg'));
      if (!diff.childElementCount) diff.textContent = 'Mejora el manejo en pista.';
    };
    showDiff(null);
    const rows = h('div.ar-uprows');
    for (const key of Object.keys(d.UPGRADES || {})) {
      const info = upgradeInfo(ui, def, key);
      const cur = Math.min((e.upgrades || {})[key] || 0, info.max);
      const pips = h('span.ar-pips', Array.from({ length: info.max }, (_, i) => h('i' + (i < cur ? '.on' : ''))));
      let btn;
      if (cur >= info.max) btn = h('button.ar-btn.small', { type: 'button', disabled: true }, icon('check'), 'Máximo');
      else {
        const L = cur + 1, price = info.price(L), lvName = (info.lv(L) && info.lv(L).name) || 'Nivel ' + L;
        const can = save.data.money >= price;
        btn = h('button.ar-btn.small' + (can ? '.primary' : ''), { type: 'button', 'data-fkey': 'up-' + key, title: lvName, onclick: () => buyUpgrade(e, def, key, L, price, lvName) },
          h('span', 'Nv. ' + L), h('b', fmtMoney(price)));
        const on = () => showDiff(key, L);
        btn.addEventListener('focus', on);
        btn.addEventListener('mouseenter', on);
        btn.addEventListener('blur', () => showDiff(null));
      }
      rows.append(h('div.ar-uprow', h('span.ar-upico', icon(UP_ICON[key] || 'wrench')),
        h('div.ar-upname', h('b', info.U.name || key), h('small', info.U.desc || '')), pips, btn));
    }
    content.append(h('div.ar-upstats', stats.el, diff), rows);
  };

  const buyUpgrade = async (e, def, key, L, price, lvName) => {
    if (save.data.money < price) { ui.sfx('error'); ui.toast('Te faltan ' + fmtMoney(price - save.data.money)); return; }
    const info = upgradeInfo(ui, def, key);
    const ok = await ui.confirm({ title: 'Instalar mejora', text: `${info.U.name || key}: ${lvName} por ${fmtMoney(price)}.`, ok: 'Instalar' });
    if (!ok) return;
    if (!save.spend(price)) { ui.sfx('error'); return; }
    save.updateCar(e.uid, { upgrades: { [key]: L } });
    ui.sfx('compra');
    ui.toast(`${info.U.name || key} nivel ${L} instalado`);
  };

  const paintStyle = (e, def) => {
    const dr = draftOf(e);
    const base = baseCustom(e);
    const wrap = h('div.ar-csecs');
    const cartList = h('div.ar-cart-list');
    const totalV = h('b');
    const buyBtn = h('button.ar-btn.primary', { type: 'button', 'data-fkey': 'c-buy', onclick: () => buyStyle(e, def) });
    const discard = h('button.ar-btn.ghost', { type: 'button', 'data-fkey': 'c-discard', onclick: () => { delete drafts[e.uid]; paintTab(); showPreview(); } }, icon('x'), 'Descartar');
    const paintCart = () => {
      const keys = dirtyKeys(e);
      clear(cartList);
      let total = 0;
      for (const k of keys) {
        const sec = sections.find(s => s.key === k);
        const p = priceOf(sec, dr[k]);
        total += p;
        cartList.append(h('div.ar-cart-item', h('span', sec.label), h('span.dim', nameOf(sec, dr[k])), h('b', priceTxt(p))));
      }
      if (!keys.length) cartList.append(h('p.ar-p.dim', 'Elige colores y piezas: los verás en el auto antes de pagar.'));
      totalV.textContent = fmtMoney(total);
      buyBtn.textContent = '';
      const money = save.data.money;
      buyBtn.disabled = !keys.length || total > money;
      buyBtn.append(icon('cart'), h('span', !keys.length ? 'Sin cambios' : total > money ? 'Te faltan ' + fmtMoney(total - money) : total ? 'Comprar cambios' : 'Aplicar cambios'));
      discard.disabled = !keys.length;
    };
    const change = (sec, v, paintSec) => { dr[sec.key] = v; paintSec(); paintCart(); showPreview(); };
    for (const sec of sections) {
      const cur = h('span.ar-csec-v');
      const body = h('div.ar-csec-b');
      let paintSec = () => {};
      const head = h('div.ar-csec-h', h('b', sec.label), cur);
      const setCur = () => { cur.textContent = nameOf(sec, dr[sec.key]) + (eq(dr[sec.key], base[sec.key]) ? '' : ' · ' + priceTxt(priceOf(sec, dr[sec.key]))); cur.classList.toggle('dirty', !eq(dr[sec.key], base[sec.key])); };
      if (sec.type === 'color' || sec.type === 'chips') {
        const btns = sec.opts.map(o => {
          const sw = sec.type === 'color' && o.color;
          const b = h('button' + (sw ? '.ar-swatch' : '.ar-chip'), { type: 'button', title: `${o.name} · ${priceTxt(o.price)}`, 'data-fkey': `cs-${sec.key}-${o.id}`, onclick: () => change(sec, o.id, paintSec) },
            sw ? h('i', { style: { background: o.color } }) : [h('span', o.name), o.price ? h('small', fmtMoney(o.price)) : null]);
          b._id = o.id;
          return b;
        });
        let picker = null;
        if (sec.type === 'color' && COLOR_KEYS.has(sec.key)) {
          const inp = h('input.ar-colorin', { type: 'color', 'data-fkey': 'cs-' + sec.key + '-free', title: 'Color libre · ' + priceTxt(sec.freePrice || 0) });
          inp.value = isHex(dr[sec.key]) && dr[sec.key].length === 7 ? dr[sec.key] : '#ff5a1f';
          inp.addEventListener('input', () => change(sec, inp.value.toLowerCase(), paintSec));
          picker = h('label.ar-swatch.ar-free', { title: 'Color libre' }, inp, icon('plus'));
          picker._inp = inp;
        }
        paintSec = () => {
          setCur();
          let matched = false;
          btns.forEach(b => { const on = eq(b._id, dr[sec.key]); matched = matched || on; b.classList.toggle('on', on); });
          if (picker) {
            const free = !matched && isHex(dr[sec.key]);
            picker.classList.toggle('on', free);
            picker.style.setProperty('--c', free ? dr[sec.key] : 'transparent');
          }
        };
        body.append(h('div.ar-chips' + (sec.type === 'color' ? '.ar-swatches' : ''), btns, picker));
      } else if (sec.type === 'step' || sec.type === 'number') {
        let opts = sec.opts;
        if (!opts) { opts = [{ id: null, name: 'Sin número', price: 0 }]; for (let i = 0; i <= 99; i++) opts.push({ id: i, name: String(i), price: sec.price || 0 }); }
        const sp = stepper({ options: opts.map(o => ({ id: o.id, name: o.name, sub: o.price ? fmtMoney(o.price) : '' })), value: dr[sec.key], onChange: v => change(sec, v === 'null' ? null : v, paintSec), fkey: 'cs-' + sec.key });
        if (!sec.opts) sec.opts = opts;
        paintSec = setCur;
        body.append(sp.el);
      } else if (sec.type === 'text') {
        const inp = h('input.ar-input.ar-plate', { type: 'text', maxlength: 8, spellcheck: 'false', autocomplete: 'off', 'data-fkey': 'cs-' + sec.key });
        inp.value = dr[sec.key] || '';
        inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9Ñ\- ]/g, ''); dr[sec.key] = inp.value; setCur(); paintCart(); showPreview(); });
        inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } });
        paintSec = setCur;
        body.append(inp);
      }
      paintSec();
      wrap.append(h('div.ar-csec', head, body));
    }
    paintCart();
    content.append(h('div.ar-scroll.ar-style', wrap),
      h('div.ar-cart', h('div.ar-cart-h', icon('cart'), h('span', 'Carrito'), h('span.ar-cart-total', 'Total ', totalV)), cartList, h('div.ar-actions', discard, buyBtn)));
  };

  const buyStyle = async (e, def) => {
    const keys = dirtyKeys(e);
    if (!keys.length) return;
    const dr = draftOf(e);
    const total = keys.reduce((a, k) => a + priceOf(sections.find(s => s.key === k), dr[k]), 0);
    if (total > save.data.money) { ui.sfx('error'); ui.toast('Te faltan ' + fmtMoney(total - save.data.money)); return; }
    if (total > 0) {
      const ok = await ui.confirm({ title: 'Comprar cambios', text: `${keys.length} cambio${keys.length > 1 ? 's' : ''} para tu ${carName(def)} por ${fmtMoney(total)}.`, ok: 'Comprar' });
      if (!ok) return;
      if (!save.spend(total)) { ui.sfx('error'); return; }
    }
    const custom = { ...dr };
    delete drafts[e.uid];
    save.updateCar(e.uid, { custom });
    ui.sfx('compra');
    ui.toast('¡Tu auto quedó como nuevo!');
  };

  const render = () => {
    const fk = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.fkey;
    if (!entryOf(st.uid)) st.uid = save.data.currentUid;
    paintList();
    setTab(st.tab);
    if (fk && f.el.contains(document.activeElement) === false) ui.nav.restore(fk) || ui.nav.focusDefault();
  };

  const back = async () => {
    if (anyDirty() && !await ui.confirm({ title: 'Cambios sin comprar', text: 'Tienes cambios de pintura y estilo sin comprar. ¿Salir y descartarlos?', ok: 'Salir', danger: true })) return;
    hd.onBack && hd.onBack();
  };
  const f = ui.frame({ name: 'garage', title: 'Garaje', kicker: 'Tus autos', onBack: back });
  f.body.append(
    h('section.ar-panel.ar-gleft', h('h2.ar-h2', icon('car'), 'Tus autos'), h('div.ar-scroll', list)),
    h('div.ar-gcenter', previewHost),
    h('section.ar-panel.ar-gright', tabsBar, content));
  f.el.addEventListener('ar-tab', ev => { const i = TABS.findIndex(t => t[0] === st.tab); setTab(TABS[(i + ev.detail + TABS.length) % TABS.length][0], true); });
  render();
  const curBtn = list.querySelector(`[data-fkey="g-${st.uid}"]`);
  if (curBtn) curBtn.dataset.autofocus = '';
  ui.preview.attach(previewHost);
  showPreview();
  return {
    name: 'garage', el: f.el, foot: f.foot, back,
    hints: [['move', 'Mover'], ['ok', 'Aceptar'], ['tabs', 'Pestañas'], ['back', 'Atrás']],
    onSave: () => {
      const fk = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.fkey;
      if (!entryOf(st.uid)) st.uid = save.data.currentUid;
      paintList();
      paintTab();
      if (fk && !(f.el.contains(document.activeElement))) { if (!ui.nav.restore(fk)) ui.nav.focusDefault(); }
    },
    dispose: () => { clearTimeout(showT); ui.preview.detach(previewHost); },
  };
}
