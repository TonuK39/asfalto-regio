// Utilidades de la interfaz: creación de nodos, iconos SVG, banderas, textos y componentes (selector, deslizador,
// interruptor, barras de estadísticas). Sin dependencias externas.
import { fmtMoney, fmtTime, clamp } from '../core/util.js';

export { fmtMoney, fmtTime, clamp };

// h('div.clase.otra', { attr, onclick, text, html, style, data }, ...hijos)
export function h(sel, attrs, ...kids) {
  const parts = sel.split('.');
  const el = document.createElement(parts[0] || 'div');
  if (parts.length > 1) el.className = parts.slice(1).join(' ');
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'data') for (const dk in v) el.dataset[dk] = v[dk];
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false || k === true) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : String(k));
  }
  return el;
}

// Como el.append(...) pero ignora null/false.
export const put = (el, ...kids) => append(el, kids);

export const clear = el => { while (el.firstChild) el.firstChild.remove(); return el; };

// ---------------------------------------------------------------------------------------------
// Iconos (24×24, trazo en currentColor)
const P = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  flag: '<path d="M5 22V3"/><path d="M5 4h14v9H5z"/><path d="M5 4h3.5v3H5zM12 4h3.5v3H12zM8.5 7H12v3H8.5zM15.5 7H19v3h-3.5zM5 10h3.5v3H5zM12 10h3.5v3H12z" fill="currentColor" stroke="none"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  car: '<path d="M3 16.5H2v-4l2.6-1.2L7.4 7h8.4l3.4 4.2 2.8.9v4.4h-1.4"/><path d="M9.2 16.5h5.6"/><circle cx="6.8" cy="16.8" r="2.2"/><circle cx="17.2" cy="16.8" r="2.2"/><path d="M5 11.3h14"/>',
  trophy: '<path d="M8 21h8M12 16v5M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M14 9l2 2"/>',
  gamepad: '<path d="M6 8h12a4 4 0 0 1 4 4.5l-.6 4A2.5 2.5 0 0 1 17 18l-2.5-3h-5L7 18a2.5 2.5 0 0 1-4.4-1.5l-.6-4A4 4 0 0 1 6 8z"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r=".9" fill="currentColor"/><circle cx="18" cy="13.5" r=".9" fill="currentColor"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  crown: '<path d="M3 18.5h18L19.6 8l-4.8 3.8L12 5l-2.8 6.8L4.4 8z" fill="currentColor" stroke-linejoin="round"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  refresh: '<path d="M21 4v6h-6M3 20v-6h6"/><path d="M19.4 9A8 8 0 0 0 5.6 6.6L3 9M4.6 15a8 8 0 0 0 13.8 2.4L21 15"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 17h6"/><circle cx="9" cy="13" r="1.2" fill="currentColor"/><circle cx="15" cy="13" r="1.2" fill="currentColor"/><circle cx="12" cy="3.5" r="1"/>',
  paint: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  star: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12z"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z"/><path d="M12 7l1.4 2.9 3.1.4-2.3 2.2.6 3.1L12 14.1l-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" fill="currentColor" stroke="none"/>',
  mask: '<path d="M2 9c3-1.5 6.5-1.5 10 0 3.5-1.5 7-1.5 10 0v2.5c0 3-2.5 4.5-5 4.5-2 0-3.5-1.5-5-1.5S9 16 7 16c-2.5 0-5-1.5-5-4.5z"/><path d="M6.5 11h2.5M15 11h2.5"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7 7h5v4H7z"/>',
  tire: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit: '<path d="M16.5 3.5l4 4L8 20H4v-4z"/>',
  exit: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  volume: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M3.5 10.5l6.6 1M20.5 10.5l-6.6 1M12 14v7"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 21h16"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  signal: '<path d="M4 20v-3M9 20v-7M14 20v-11M19 20V4"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>',
  sparkle: '<path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z"/>',
};

export function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
export function icon(name, cls = '') {
  const s = document.createElement('span');
  s.className = 'ar-ico' + (cls ? ' ' + cls : '');
  s.innerHTML = iconSvg(name);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Banderas en SVG (30×20). Se usan si COUNTRIES no trae su propio SVG.
function star(cx, cy, r, fill) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r;
    d += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2);
  }
  return `<path d="${d}Z" fill="${fill}"/>`;
}
const vbars = (a, b, c) => `<rect width="10" height="20" fill="${a}"/><rect x="10" width="10" height="20" fill="${b}"/><rect x="20" width="10" height="20" fill="${c}"/>`;
const hbars = (a, b, c) => `<rect width="30" height="7" fill="${a}"/><rect y="6.6" width="30" height="6.8" fill="${b}"/><rect y="13.3" width="30" height="6.7" fill="${c}"/>`;
const UNION = '<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.4"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/><path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.4"/>';
const FLAGS = {
  MX: vbars('#006847', '#fff', '#ce1126') + '<circle cx="15" cy="10" r="2.6" fill="#8c5a2b"/><path d="M12.6 11.6q2.4 1.6 4.8 0" stroke="#3a7d44" stroke-width=".8" fill="none"/>',
  JP: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
  DE: hbars('#000', '#dd0000', '#ffce00'),
  IT: vbars('#009246', '#fff', '#ce2b37'),
  FR: vbars('#0055a4', '#fff', '#ef4135'),
  BE: vbars('#111', '#fdda24', '#ef3340'),
  US: (() => {
    let s = '<rect width="30" height="20" fill="#fff"/>';
    for (let i = 0; i < 7; i++) s += `<rect y="${(i * 2 * 20 / 13).toFixed(2)}" width="30" height="${(20 / 13).toFixed(2)}" fill="#b22234"/>`;
    s += '<rect width="13" height="10.8" fill="#3c3b6e"/>';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) s += `<circle cx="${1.5 + c * 2.5}" cy="${1.5 + r * 2.6}" r=".55" fill="#fff"/>`;
    return s;
  })(),
  GB: UNION,
  KR: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5" fill="#0047a0"/><path d="M10 10a5 5 0 0 1 10 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 0-5 0z" fill="#cd2e3a"/><g stroke="#111" stroke-width="1.1"><path d="M5 3.6l3 2.2M22 14.2l3 2.2M22 5.8l3-2.2M5 16.4l3-2.2"/></g>',
  SE: '<rect width="30" height="20" fill="#006aa7"/><rect x="9" width="4" height="20" fill="#fecc00"/><rect y="8" width="30" height="4" fill="#fecc00"/>',
  ES: '<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>',
  NL: hbars('#ae1c28', '#fff', '#21468b'),
  AT: hbars('#ed2939', '#fff', '#ed2939'),
  RU: hbars('#fff', '#0039a6', '#d52b1e'),
  AR: hbars('#74acdf', '#fff', '#74acdf') + '<circle cx="15" cy="10" r="2" fill="#f6b40e"/>',
  IN: hbars('#ff9933', '#fff', '#138808') + '<circle cx="15" cy="10" r="2.4" fill="none" stroke="#000080" stroke-width=".7"/>',
  CN: '<rect width="30" height="20" fill="#de2910"/>' + star(5.5, 5.5, 3.2, '#ffde00') + star(10.5, 2.4, 1, '#ffde00') + star(12.4, 4.6, 1, '#ffde00') + star(12.4, 7.6, 1, '#ffde00') + star(10.5, 9.6, 1, '#ffde00'),
  BR: '<rect width="30" height="20" fill="#009c3b"/><path d="M15 2.2L27.6 10 15 17.8 2.4 10z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.3" fill="#002776"/><path d="M10.9 9.2q4.3-1.2 8.3 1.4" stroke="#fff" stroke-width=".7" fill="none"/>',
  CA: '<rect width="30" height="20" fill="#fff"/><rect width="7.5" height="20" fill="#d52b1e"/><rect x="22.5" width="7.5" height="20" fill="#d52b1e"/><path d="M15 4l1.1 2.3 1.5-.6-.5 3.4 1.9-1.6.4 1.3 1.6-.3-.9 2.4.7.5-3.3 2.4.3 1.2H15.5v2.6h-1v-2.6H12.2l.3-1.2-3.3-2.4.7-.5-.9-2.4 1.6.3.4-1.3 1.9 1.6-.5-3.4 1.5.6z" fill="#d52b1e"/>',
  AU: '<rect width="30" height="20" fill="#012169"/><g transform="scale(.5)">' + UNION + '</g>' + star(7.5, 15, 2, '#fff') + star(22.5, 4, 1, '#fff') + star(25.5, 8.5, 1, '#fff') + star(22.5, 15.5, 1.1, '#fff') + star(19.5, 9.5, 1, '#fff'),
  CZ: '<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#d7141a"/><path d="M0 0l15 10L0 20z" fill="#11457e"/>',
  CH: '<rect width="30" height="20" fill="#d52b1e"/><path d="M13.2 4.5h3.6v3.7h3.7v3.6h-3.7v3.7h-3.6v-3.7H9.5V8.2h3.7z" fill="#fff"/>',
  MY: '<rect width="30" height="20" fill="#fff"/>' + Array.from({ length: 7 }, (_, i) => `<rect y="${(i * 20 / 7).toFixed(2)}" width="30" height="${(10 / 7).toFixed(2)}" fill="#cc0001"/>`).join('') + '<rect width="15" height="11.4" fill="#010066"/><circle cx="6.5" cy="5.7" r="3.6" fill="#fc0"/><circle cx="7.6" cy="5.7" r="3" fill="#010066"/>' + star(11.6, 5.7, 2, '#fc0'),
};
const COUNTRY_NAMES = {
  MX: 'México', JP: 'Japón', DE: 'Alemania', IT: 'Italia', US: 'Estados Unidos', GB: 'Reino Unido', FR: 'Francia',
  KR: 'Corea del Sur', SE: 'Suecia', ES: 'España', AU: 'Australia', CN: 'China', BR: 'Brasil', CA: 'Canadá',
  NL: 'Países Bajos', AT: 'Austria', CZ: 'Chequia', AR: 'Argentina', CH: 'Suiza', BE: 'Bélgica', IN: 'India', RU: 'Rusia', MY: 'Malasia',
};

export function countryName(code, COUNTRIES) {
  const c = COUNTRIES && COUNTRIES[code];
  return (c && (c.name || c.nombre)) || COUNTRY_NAMES[code] || code || '';
}

export function flag(code, COUNTRIES, cls = '') {
  const s = document.createElement('span');
  s.className = 'ar-flag' + (cls ? ' ' + cls : '');
  s.title = countryName(code, COUNTRIES);
  const c = COUNTRIES && COUNTRIES[code];
  const f = c && c.flag;
  if (typeof f === 'string' && f.trim().startsWith('<svg')) { s.innerHTML = f; return s; }
  if (FLAGS[code]) { s.innerHTML = `<svg viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">${FLAGS[code]}</svg>`; return s; }
  const colors = Array.isArray(f) ? f : (f && Array.isArray(f.colors) ? f.colors : null);
  if (colors && colors.length) {
    const vertical = f && f.dir === 'v';
    const n = colors.length;
    s.innerHTML = '<svg viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">' + colors.map((col, i) => vertical
      ? `<rect x="${(i * 30 / n).toFixed(2)}" width="${(30 / n + 0.05).toFixed(2)}" height="20" fill="${col}"/>`
      : `<rect y="${(i * 20 / n).toFixed(2)}" width="30" height="${(20 / n + 0.05).toFixed(2)}" fill="${col}"/>`).join('') + '</svg>';
    return s;
  }
  s.classList.add('ar-flag-txt');
  s.textContent = code || '?';
  return s;
}

// ---------------------------------------------------------------------------------------------
// Textos
export const CLASS_NAMES = {
  compacto: 'Compacto', clasico: 'Clásico', jdm: 'JDM', muscle: 'Muscle', deportivo: 'Deportivo', super: 'Súper',
  hiper: 'Híper', rally: 'Rally', formula: 'Fórmula', pickup: 'Pickup',
};
export const className = c => CLASS_NAMES[c] || (c ? c[0].toUpperCase() + c.slice(1) : '');
export const DRIVE_NAMES = { RWD: 'Trasera', FWD: 'Delantera', AWD: 'Integral' };
export const KIND_NAMES = { circuit: 'Circuito', street: 'Urbano', sprint: 'Punta a punta', drag: 'Recta de arrancones', oval: 'Óvalo', arena: 'Explanada' };
export const SURFACE_NAMES = { asfalto: 'Asfalto', tierra: 'Tierra', nieve: 'Nieve' };
export const STAT_KEYS = [['velocidad', 'Velocidad'], ['aceleracion', 'Aceleración'], ['manejo', 'Manejo'], ['frenado', 'Frenado']];
export const fmtNum = n => Math.round(n || 0).toLocaleString('es-MX');
export const carName = def => def ? `${def.brand || ''} ${def.model || ''}`.trim() || def.id : '';
export const hp = spec => spec && spec.powerKw ? Math.round(spec.powerKw * 1.341) : null;
export const isHex = v => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);
export function engineText(e) {
  if (!e) return '';
  if (e.layout === 'EV') return 'Eléctrico';
  return (e.layout || '') + (e.turbo ? ' turbo' : '');
}

// ---------------------------------------------------------------------------------------------
// Componentes. Los elementos con .arStep(d) consumen ←/→ (teclado y control); .arActivate() responde a A/Enter.

// Selector de opciones: ‹ valor ›
export function stepper({ options = [], value, onChange, fkey, wrap = true, readonly = false, cls = '' }) {
  const el = h('div.ar-step' + (cls ? '.' + cls : ''), { tabindex: readonly ? -1 : 0, role: 'spinbutton', 'data-fkey': fkey });
  const prev = h('button.ar-step-btn', { type: 'button', tabindex: -1, 'aria-label': 'Anterior' }, icon('left'));
  const next = h('button.ar-step-btn', { type: 'button', tabindex: -1, 'aria-label': 'Siguiente' }, icon('right'));
  const val = h('div.ar-step-val');
  const name = h('span.ar-step-name');
  const sub = h('span.ar-step-sub');
  const dots = h('div.ar-step-dots');
  val.append(name, sub);
  el.append(prev, val, next, dots);
  let opts = options, idx = 0, ro = readonly;
  const find = v => opts.findIndex(o => String(o.id) === String(v));
  const paint = () => {
    const o = opts[idx];
    name.textContent = o ? o.name : '—';
    sub.textContent = o && o.sub ? o.sub : '';
    sub.style.display = o && o.sub ? '' : 'none';
    el.classList.toggle('is-ro', ro);
    el.tabIndex = ro ? -1 : 0;
    const one = opts.length < 2;
    prev.disabled = ro || one || (!wrap && idx <= 0);
    next.disabled = ro || one || (!wrap && idx >= opts.length - 1);
    if (opts.length > 1 && opts.length <= 12) {
      if (dots.childElementCount !== opts.length) { clear(dots); for (let i = 0; i < opts.length; i++) dots.append(h('i')); }
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i === idx));
      dots.style.display = '';
    } else dots.style.display = 'none';
  };
  const step = d => {
    if (ro || opts.length < 2) return;
    let n = idx + d;
    n = wrap ? (n + opts.length) % opts.length : clamp(n, 0, opts.length - 1);
    if (n === idx) return;
    idx = n;
    paint();
    el.classList.remove('bump-l', 'bump-r'); void el.offsetWidth; el.classList.add(d < 0 ? 'bump-l' : 'bump-r');
    onChange && onChange(opts[idx].id, opts[idx]);
  };
  prev.addEventListener('click', e => { e.stopPropagation(); step(-1); if (!ro) el.focus({ preventScroll: true }); });
  next.addEventListener('click', e => { e.stopPropagation(); step(1); if (!ro) el.focus({ preventScroll: true }); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(1); } });
  el.arStep = step;
  el.arActivate = () => step(1);
  idx = Math.max(0, find(value));
  paint();
  return {
    el,
    get value() { return opts[idx] ? opts[idx].id : undefined; },
    set(v, newOptions) {
      if (newOptions) opts = newOptions;
      const i = find(v);
      idx = i >= 0 ? i : clamp(idx, 0, Math.max(0, opts.length - 1));
      paint();
    },
    setReadonly(b) { ro = !!b; paint(); },
  };
}

// Deslizador con valor
export function slider({ min = 0, max = 1, step = 0.05, value = 0, format = v => v, onInput, fkey }) {
  const input = h('input.ar-range', { type: 'range', min, max, step, 'data-fkey': fkey });
  input.value = value;
  const out = h('output.ar-range-v');
  const el = h('div.ar-slider', input, out);
  const dec = (String(step).split('.')[1] || '').length;
  const paint = () => {
    out.textContent = format(+input.value);
    input.style.setProperty('--p', ((+input.value - min) / (max - min) * 100).toFixed(1) + '%');
  };
  input.addEventListener('input', () => { paint(); onInput && onInput(+input.value); });
  input.arStep = d => {
    const v = +clamp(+input.value + d * step, min, max).toFixed(dec);
    if (v === +input.value) return;
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  paint();
  return { el, input, set(v) { input.value = v; paint(); } };
}

// Interruptor sí/no
export function toggle({ value = false, onChange, on = 'Sí', off = 'No', fkey }) {
  const txt = h('span.ar-toggle-txt');
  const b = h('button.ar-toggle', { type: 'button', 'data-fkey': fkey }, h('span.ar-toggle-track', h('span.ar-toggle-knob')), txt);
  let v = !!value;
  const paint = () => { b.setAttribute('aria-pressed', String(v)); b.classList.toggle('on', v); txt.textContent = v ? on : off; };
  const set = (nv, fire) => { nv = !!nv; if (nv === v) return; v = nv; paint(); if (fire && onChange) onChange(v); };
  b.addEventListener('click', () => set(!v, true));
  b.arStep = d => set(d > 0, true);
  paint();
  return { el: b, get value() { return v; }, set: nv => set(nv, false) };
}

// Barras de estadísticas (0..10) con comparación opcional «después»
export function statBars(cls = '') {
  const el = h('div.ar-stats' + (cls ? '.' + cls : ''));
  const rows = {};
  for (const [k, label] of STAT_KEYS) {
    const fill = h('i.ar-stat-fill'), delta = h('i.ar-stat-delta'), num = h('b.ar-stat-num');
    el.append(h('div.ar-stat', h('span.ar-stat-lbl', label), h('span.ar-stat-bar', fill, delta), num));
    rows[k] = { fill, delta, num };
  }
  return {
    el,
    set(stats, after) {
      for (const [k] of STAT_KEYS) {
        const r = rows[k];
        const a = clamp(Number(stats && stats[k]) || 0, 0, 10);
        const b = after ? clamp(Number(after[k]) || 0, 0, 10) : a;
        const lo = Math.min(a, b), hi = Math.max(a, b);
        r.fill.style.width = (lo * 10) + '%';
        r.delta.style.left = (lo * 10) + '%';
        r.delta.style.width = ((hi - lo) * 10) + '%';
        r.delta.className = 'ar-stat-delta' + (b > a + 0.01 ? ' up' : b < a - 0.01 ? ' down' : '');
        r.num.textContent = b.toFixed(1);
        r.num.className = 'ar-stat-num' + (b > a + 0.01 ? ' up' : b < a - 0.01 ? ' down' : '');
      }
    },
  };
}

// Pastilla de dinero (se actualiza sola desde ui._refreshMoney)
export function moneyPill(money) {
  return h('div.ar-money', icon('coins'), h('span.ar-money-v', fmtMoney(money)));
}

// Fila de ajuste: etiqueta + control
export const row = (label, control, hint) => h('div.ar-row', h('div.ar-row-lbl', h('span', label), hint ? h('small', hint) : null), h('div.ar-row-ctl', control));

// Contador animado (ease-out)
export function countUp(el, to, { ms = 1200, delay = 0, fmt = fmtMoney, onDone } = {}) {
  const start = performance.now() + delay;
  el.textContent = fmt(0);
  const tick = now => {
    const t = clamp((now - start) / ms, 0, 1);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(to * e);
    if (t < 1) requestAnimationFrame(tick);
    else onDone && onDone();
  };
  requestAnimationFrame(tick);
}
