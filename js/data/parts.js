// Mejoras de desempeño y opciones de personalización de los autos.
// No usa Three.js: lo importan la interfaz, el núcleo y carmodel.js.
import { hashString } from '../core/util.js';

export const UPGRADE_KEYS = ['motor', 'turbo', 'transmision', 'llantas', 'suspension', 'frenos', 'peso', 'nitro'];

// Cada nivel trae su precio base (se escala con el valor del auto en upgradePrice) y su efecto acumulado.
export const UPGRADES = {
  motor: {
    name: 'Motor', desc: 'Más potencia y torque: mejor aceleración y velocidad máxima.',
    levels: [
      { name: 'De fábrica', price: 0, power: 1, torque: 1, redline: 0 },
      { name: 'Admisión y escape', price: 1800, power: 1.06, torque: 1.05, redline: 0 },
      { name: 'Árbol de levas y computadora', price: 4200, power: 1.12, torque: 1.1, redline: 200 },
      { name: 'Pistones y bielas forjadas', price: 8200, power: 1.19, torque: 1.16, redline: 350 },
      { name: 'Motor de carreras', price: 14500, power: 1.27, torque: 1.22, redline: 500 },
    ],
  },
  turbo: {
    name: 'Turbo', desc: 'Inducción forzada: mucho más torque en medias y altas.',
    levels: [
      { name: 'Sin cambios', price: 0, power: 1, torque: 1 },
      { name: 'Turbo de calle', price: 2600, power: 1.08, torque: 1.12 },
      { name: 'Turbo deportivo', price: 6200, power: 1.17, torque: 1.24 },
      { name: 'Turbo de competencia', price: 11500, power: 1.27, torque: 1.36 },
    ],
  },
  transmision: {
    name: 'Transmisión', desc: 'Cambios más rápidos y relaciones más cortas.',
    levels: [
      { name: 'De fábrica', price: 0, shift: 1, final: 1 },
      { name: 'Clutch reforzado', price: 1300, shift: 0.8, final: 1.02 },
      { name: 'Caja de relaciones cerradas', price: 3200, shift: 0.6, final: 1.035 },
      { name: 'Secuencial de carreras', price: 6400, shift: 0.4, final: 1.05 },
    ],
  },
  llantas: {
    name: 'Llantas', desc: 'Más agarre en curvas, frenadas y arrancones.',
    levels: [
      { name: 'De calle', price: 0, grip: 0 },
      { name: 'Deportivas', price: 900, grip: 0.04 },
      { name: 'Semi-slick', price: 2300, grip: 0.08 },
      { name: 'Slick de calle', price: 4600, grip: 0.12 },
      { name: 'Slick de competencia', price: 8200, grip: 0.17 },
    ],
  },
  suspension: {
    name: 'Suspensión', desc: 'Menos balanceo, centro de gravedad más bajo y mejor respuesta.',
    levels: [
      { name: 'De fábrica', price: 0, grip: 0, cg: 1, steer: 0 },
      { name: 'Resortes cortos', price: 1100, grip: 0.015, cg: 0.96, steer: 1 },
      { name: 'Coilovers ajustables', price: 2700, grip: 0.03, cg: 0.92, steer: 2 },
      { name: 'Suspensión de carreras', price: 5400, grip: 0.05, cg: 0.88, steer: 3 },
    ],
  },
  frenos: {
    name: 'Frenos', desc: 'Frenadas más cortas y estables.',
    levels: [
      { name: 'De fábrica', price: 0, brake: 0 },
      { name: 'Balatas deportivas', price: 800, brake: 0.1 },
      { name: 'Discos ranurados y calipers', price: 2100, brake: 0.2 },
      { name: 'Frenos cerámicos', price: 4400, brake: 0.32 },
    ],
  },
  peso: {
    name: 'Reducción de peso', desc: 'Menos kilos: acelera, frena y gira mejor.',
    levels: [
      { name: 'De fábrica', price: 0, mass: 1 },
      { name: 'Sin asientos traseros', price: 1500, mass: 0.96 },
      { name: 'Cofre y cajuela de fibra de carbono', price: 4100, mass: 0.92 },
      { name: 'Jaula y carrocería de carbono', price: 8800, mass: 0.88 },
    ],
  },
  nitro: {
    name: 'Nitro', desc: 'Tanque más grande y más empuje al activar el nitro.',
    levels: [
      { name: 'Botella básica', price: 0, capacity: 0, boost: 0 },
      { name: 'Botella doble', price: 1600, capacity: 2.5, boost: 0.05 },
      { name: 'Kit de tres tanques', price: 3700, capacity: 5, boost: 0.1 },
      { name: 'Nitro de competencia', price: 7400, capacity: 8, boost: 0.15 },
    ],
  },
};

const TIER_VALUE = { 1: 15000, 2: 55000, 3: 160000, 4: 550000, 5: 2200000 };

// Factor de precio según el valor del auto: un Tsuru paga ~1x, un hiperdeportivo ~30x.
export function priceScale(carDef) {
  const value = (carDef && carDef.price) || TIER_VALUE[(carDef && carDef.tier) || 1] || 15000;
  return Math.max(0.8, Math.pow(value / 20000, 0.7));
}

// Precio real de subir `key` al nivel `level` en este auto.
export function upgradePrice(carDef, key, level) {
  const u = UPGRADES[key];
  if (!u) return 0;
  const lv = u.levels[Math.max(0, Math.min(u.levels.length - 1, level | 0))];
  if (!lv || !lv.price) return 0;
  const p = lv.price * priceScale(carDef);
  const step = p > 100000 ? 1000 : p > 10000 ? 100 : 50;
  return Math.round(p / step) * step;
}

// Dinero invertido en mejoras (sirve para calcular la reventa).
export function upgradesValue(carDef, upgrades) {
  let t = 0;
  for (const k of UPGRADE_KEYS) for (let l = 1; l <= ((upgrades && upgrades[k]) | 0); l++) t += upgradePrice(carDef, k, l);
  return t;
}

// ───────────────────────────── Personalización ─────────────────────────────
const opt = (id, name, price) => ({ id, name, price });

const PAINTS = [
  opt('#f4f4f2', 'Blanco glaciar', 1200), opt('#0c0d10', 'Negro noche', 1200), opt('#c3c8cf', 'Plata', 1200),
  opt('#5f646c', 'Gris grafito', 1200), opt('#2b2f36', 'Gris carbón', 1200), opt('#c81e1e', 'Rojo carrera', 1500),
  opt('#7d0f1d', 'Rojo vino', 1500), opt('#ff3b30', 'Rojo neón', 1800), opt('#ff5a1f', 'Naranja regio', 1500),
  opt('#ff9500', 'Naranja mandarina', 1500), opt('#ffd23f', 'Amarillo cromo', 1500), opt('#e8f04a', 'Amarillo limón', 1600),
  opt('#7ed321', 'Verde lima', 1600), opt('#1e8f3a', 'Verde pista', 1500), opt('#0f4d2e', 'Verde inglés', 1500),
  opt('#556b2f', 'Verde olivo', 1400), opt('#2ec4b6', 'Turquesa', 1600), opt('#00d5ff', 'Cian eléctrico', 1800),
  opt('#1d9bf0', 'Azul cielo', 1500), opt('#1d3fbf', 'Azul rally', 1500), opt('#0b1e5b', 'Azul marino', 1500),
  opt('#5b2bbf', 'Morado', 1600), opt('#a31fd1', 'Violeta neón', 1800), opt('#e4007c', 'Rosa mexicano', 1800),
  opt('#ff8fb1', 'Rosa pastel', 1600), opt('#8a5a2b', 'Café tabaco', 1400), opt('#c9a66b', 'Arena del desierto', 1400),
  opt('#b87333', 'Cobre', 2000), opt('#d4af37', 'Oro', 2400), opt('#9db4c0', 'Azul acero', 1500),
];

const ACCENTS = [
  opt('#ffffff', 'Blanco', 0), opt('#0c0d10', 'Negro', 0), opt('#c3c8cf', 'Plata', 0), opt('#c81e1e', 'Rojo', 0),
  opt('#ff5a1f', 'Naranja', 0), opt('#ffd23f', 'Amarillo', 0), opt('#7ed321', 'Verde lima', 0), opt('#1e8f3a', 'Verde', 0),
  opt('#00d5ff', 'Cian', 0), opt('#1d3fbf', 'Azul', 0), opt('#5b2bbf', 'Morado', 0), opt('#e4007c', 'Rosa mexicano', 0),
  opt('#d4af37', 'Oro', 0), opt('#5f646c', 'Grafito', 0),
];

export const CUSTOM_OPTIONS = {
  paint: PAINTS,
  finish: [
    opt('brillante', 'Brillante', 0), opt('metalico', 'Metálico', 1800), opt('perla', 'Perla', 3200),
    opt('mate', 'Mate', 2500), opt('cromo', 'Cromo', 6000),
  ],
  vinyl: [
    opt('ninguno', 'Sin vinil', 0), opt('franjas', 'Franjas racing', 1200), opt('doble', 'Doble franja lateral', 1100),
    opt('lateral', 'Franja lateral', 900), opt('flamas', 'Flamas', 2200), opt('tribal', 'Tribal', 1800),
    opt('cuadros', 'Cuadros', 1500), opt('rayo', 'Rayo', 1400), opt('camuflaje', 'Camuflaje', 2400),
    opt('ondas', 'Ondas', 1600), opt('regio', '«REGIO»', 2000), opt('geometrico', 'Geométrico', 1900),
    opt('manchas', 'Manchas', 1300), opt('degradado', 'Degradado', 2600), opt('retro', 'Retro de resistencia', 2200),
    opt('pixel', 'Pixeles', 2000), opt('circuito', 'Circuito', 2100), opt('rayas', 'Filetes finos', 800),
  ],
  vinylColor: ACCENTS,
  rims: [
    opt('cinco', 'Cinco rayos', 1500), opt('seis', 'Seis rayos de carreras', 2600), opt('malla', 'Malla', 3200),
    opt('multi', 'Multirrayos', 2200), opt('dish', 'Plato hondo', 2800), opt('turbina', 'Turbina', 2400),
    opt('acero', 'Acero', 600), opt('tapon', 'Tapón clásico', 500), opt('aero', 'Aerodinámico', 1800),
    opt('estrella', 'Estrella doble', 2500), opt('cruz', 'Cruz', 1400), opt('radios', 'Rayos de alambre', 3500),
    opt('telefono', 'Disco de teléfono', 2000), opt('y', 'Rayos en Y', 2300), opt('carreras', 'Centro de carreras', 4500),
  ],
  rimColor: [
    opt('#c8ccd2', 'Plata', 0), opt('#4a4e55', 'Grafito', 600), opt('#151515', 'Negro mate', 600), opt('#f0f0f0', 'Blanco', 600),
    opt('#c9a227', 'Oro', 900), opt('#8c6a3c', 'Bronce', 900), opt('#e9edf2', 'Cromo', 1200), opt('#c81e1e', 'Rojo', 700),
    opt('#1d5fd1', 'Azul', 700), opt('#ff6a1f', 'Naranja', 700), opt('#2fa84f', 'Verde', 700), opt('#e4007c', 'Rosa mexicano', 700),
  ],
  caliper: [
    opt('#555a60', 'Gris de fábrica', 0), opt('#d01818', 'Rojo', 600), opt('#ffd000', 'Amarillo', 600), opt('#1d5fd1', 'Azul', 600),
    opt('#ff6a1f', 'Naranja', 600), opt('#2fa84f', 'Verde', 600), opt('#111111', 'Negro', 400), opt('#c9a227', 'Oro', 800),
    opt('#e4007c', 'Rosa mexicano', 600), opt('#f0f0f0', 'Blanco', 600),
  ],
  spoiler: [
    opt('ninguno', 'Sin alerón', 0), opt('labio', 'Labio', 900), opt('ducktail', 'Cola de pato', 1500),
    opt('arco', 'Arco', 2800), opt('alto', 'Alto de rally', 3200), opt('gt', 'GT de competencia', 4200),
    opt('cuello', 'Cuello de cisne', 4800), opt('ballena', 'Cola de ballena', 3600),
  ],
  bodykit: [
    opt(0, 'De fábrica', 0), opt(1, 'Faldones y spoiler delantero', 3500), opt(2, 'Ensanches de competencia', 6000),
  ],
  tint: [
    opt(0, 'Sin polarizado', 0), opt(0.35, 'Polarizado claro', 400), opt(0.65, 'Polarizado medio', 700), opt(0.9, 'Polarizado limusina', 1000),
  ],
  underglow: [
    opt(null, 'Sin neón', 0), opt('#00e5ff', 'Cian', 2200), opt('#ff2bd6', 'Magenta', 2200), opt('#39ff6a', 'Verde', 2200),
    opt('#9b4dff', 'Morado', 2200), opt('#ff2a2a', 'Rojo', 2200), opt('#2a6bff', 'Azul', 2200), opt('#ffffff', 'Blanco', 2200),
    opt('#ffe14d', 'Amarillo', 2200), opt('#ff8a1f', 'Naranja', 2200),
  ],
  smoke: [
    opt('#ffffff', 'Blanco', 0), opt('#8a8a8a', 'Gris', 800), opt('#2a2a2a', 'Negro', 1500), opt('#ff3b30', 'Rojo', 1500),
    opt('#2f7bff', 'Azul', 1500), opt('#3bd16f', 'Verde', 1500), opt('#ffd23f', 'Amarillo', 1500), opt('#a31fd1', 'Morado', 1500),
    opt('#ff4fa8', 'Rosa', 1500), opt('#ff8a1f', 'Naranja', 1500), opt('#00e5ff', 'Cian', 1500),
  ],
  lights: [
    opt('#ffffff', 'Halógeno blanco', 0), opt('#fff1c9', 'Cálido clásico', 300), opt('#dfe9ff', 'Xenón', 1200),
    opt('#bcd6ff', 'Azul hielo', 1400), opt('#ffd23f', 'Amarillo francés', 1000), opt('#c9b3ff', 'Lavanda', 1400),
    opt('#b8ffd6', 'Menta', 1400),
  ],
  ride: [opt(0, 'Altura de fábrica', 0), opt(1, 'Bajo', 1500), opt(2, 'Muy bajo (stance)', 3000)],
  // Campos libres (no son listas):
  number: { min: 0, max: 99, price: 500 },
  plate: { maxLength: 8, price: 600, pattern: '^[A-Z0-9-]{1,8}$' },
};

// Precio de un color fuera de la lista (la interfaz puede ofrecer selector libre).
export const CUSTOM_FREE_COLOR_PRICE = {
  paint: 2500, vinylColor: 500, rimColor: 900, caliper: 700, underglow: 2600, smoke: 1800, lights: 1500,
};

export const CUSTOM_LABELS = {
  paint: 'Pintura', finish: 'Acabado', vinyl: 'Vinil', vinylColor: 'Color del vinil', number: 'Número',
  rims: 'Rines', rimColor: 'Color de rines', caliper: 'Calipers', spoiler: 'Alerón', bodykit: 'Bodykit',
  tint: 'Polarizado', underglow: 'Neón inferior', smoke: 'Humo de llantas', lights: 'Faros', plate: 'Placa', ride: 'Altura',
};
export const CUSTOM_KEYS = Object.keys(CUSTOM_LABELS);

// Precio de una opción (0 si es gratis o no existe en la lista).
export function customOptionPrice(key, value) {
  const list = CUSTOM_OPTIONS[key];
  if (Array.isArray(list)) {
    const o = list.find(x => x.id === value);
    if (o) return o.price;
    if (typeof value === 'string' && value[0] === '#') return CUSTOM_FREE_COLOR_PRICE[key] || 0;
    return 0;
  }
  return list && list.price ? list.price : 0;
}

const PLATE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
export function makePlate(seed) {
  let h = hashString(String(seed));
  let s = '';
  for (let i = 0; i < 3; i++) { s += PLATE_LETTERS[h % PLATE_LETTERS.length]; h = Math.floor(h / PLATE_LETTERS.length) + 7919 * (i + 1); }
  return s + '-' + String(100 + (hashString(seed + '#') % 900));
}

// Personalización de fábrica de un auto (los valores de fábrica viven en carDef.factory).
export function defaultCustom(carDef) {
  const f = (carDef && carDef.factory) || {};
  return {
    paint: (carDef && carDef.color) || '#c81e1e',
    finish: f.finish || 'brillante',
    vinyl: f.vinyl || 'ninguno',
    vinylColor: f.vinylColor || '#ffffff',
    number: f.number ?? null,
    rims: f.rims || 'cinco',
    rimColor: f.rimColor || '#c8ccd2',
    caliper: f.caliper || '#555a60',
    spoiler: f.spoiler || 'ninguno',
    bodykit: 0,
    tint: f.tint ?? 0.35,
    underglow: null,
    smoke: '#ffffff',
    lights: f.lights || '#ffffff',
    plate: makePlate(carDef ? carDef.id : 'auto'),
    ride: 0,
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const validIn = (key, v) => CUSTOM_OPTIONS[key].some(o => o.id === v);

// Une `custom` (que puede ser null o parcial) con la de fábrica y descarta valores inválidos.
export function resolveCustom(carDef, custom) {
  const d = defaultCustom(carDef);
  if (!custom || typeof custom !== 'object') return d;
  const out = { ...d };
  for (const k of ['paint', 'vinylColor', 'rimColor', 'caliper', 'smoke', 'lights']) if (HEX.test(custom[k] || '')) out[k] = custom[k];
  if (custom.underglow === null || HEX.test(custom.underglow || '')) out.underglow = custom.underglow ?? null;
  for (const k of ['finish', 'rims', 'spoiler']) if (validIn(k, custom[k])) out[k] = custom[k];
  // vinilos especiales de fábrica (p. ej. patrulla) se respetan aunque no estén en la lista
  if (validIn('vinyl', custom.vinyl) || custom.vinyl === (carDef && carDef.factory && carDef.factory.vinyl)) out.vinyl = custom.vinyl;
  if (custom.number === null || (Number.isFinite(+custom.number) && custom.number !== '')) {
    out.number = custom.number === null ? null : Math.max(0, Math.min(99, Math.round(+custom.number)));
  }
  if (Number.isFinite(+custom.bodykit)) out.bodykit = Math.max(0, Math.min(2, Math.round(+custom.bodykit)));
  if (Number.isFinite(+custom.tint)) out.tint = Math.max(0, Math.min(1, +custom.tint));
  if (Number.isFinite(+custom.ride)) out.ride = Math.max(0, Math.min(2, Math.round(+custom.ride)));
  if (typeof custom.plate === 'string' && custom.plate.trim()) out.plate = custom.plate.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8) || d.plate;
  return out;
}
