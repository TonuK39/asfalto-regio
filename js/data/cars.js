// Catálogo de autos de Asfalto Regio. Sin Three.js (lo usa la interfaz y la física).
// Marcas y modelos reales solo como texto: no se dibujan logotipos ni emblemas.
import { UPGRADES } from './parts.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r3 = v => Math.round(v * 1000) / 1000;

export const COUNTRIES = {
  MX: { name: 'México', flag: { colors: ['#006847', '#ffffff', '#ce1126'],
    css: 'radial-gradient(circle at 50% 50%,#8c5a2b 0 9%,transparent 10%),linear-gradient(90deg,#006847 0 33.33%,#ffffff 33.33% 66.66%,#ce1126 66.66%)' } },
  JP: { name: 'Japón', flag: { colors: ['#ffffff', '#bc002d'], css: 'radial-gradient(circle at 50% 50%,#bc002d 0 27%,#ffffff 28%)' } },
  DE: { name: 'Alemania', flag: { colors: ['#000000', '#dd0000', '#ffce00'], css: 'linear-gradient(#000000 0 33.33%,#dd0000 33.33% 66.66%,#ffce00 66.66%)' } },
  IT: { name: 'Italia', flag: { colors: ['#009246', '#ffffff', '#ce2b37'], css: 'linear-gradient(90deg,#009246 0 33.33%,#ffffff 33.33% 66.66%,#ce2b37 66.66%)' } },
  US: { name: 'Estados Unidos', flag: { colors: ['#b22234', '#ffffff', '#3c3b6e'],
    css: 'linear-gradient(#3c3b6e,#3c3b6e) 0 0/40% 53.85% no-repeat,repeating-linear-gradient(#b22234 0 7.69%,#ffffff 7.69% 15.38%)' } },
  GB: { name: 'Reino Unido', flag: { colors: ['#012169', '#ffffff', '#c8102e'],
    css: 'linear-gradient(#c8102e,#c8102e) center/100% 18% no-repeat,linear-gradient(#c8102e,#c8102e) center/11% 100% no-repeat,' +
      'linear-gradient(#ffffff,#ffffff) center/100% 32% no-repeat,linear-gradient(#ffffff,#ffffff) center/20% 100% no-repeat,' +
      'linear-gradient(33.7deg,transparent 44%,#ffffff 44% 56%,transparent 56%),linear-gradient(-33.7deg,transparent 44%,#ffffff 44% 56%,transparent 56%),#012169' } },
  FR: { name: 'Francia', flag: { colors: ['#0055a4', '#ffffff', '#ef4135'], css: 'linear-gradient(90deg,#0055a4 0 33.33%,#ffffff 33.33% 66.66%,#ef4135 66.66%)' } },
  KR: { name: 'Corea del Sur', flag: { colors: ['#ffffff', '#cd2e3a', '#0047a0'],
    css: 'radial-gradient(circle at 50% 50%,transparent 0 17%,#ffffff 18%),linear-gradient(#cd2e3a 50%,#0047a0 50%)' } },
  SE: { name: 'Suecia', flag: { colors: ['#006aa7', '#fecc00'],
    css: 'linear-gradient(#fecc00,#fecc00) 0 50%/100% 20% no-repeat,linear-gradient(#fecc00,#fecc00) 35% 0/12.5% 100% no-repeat,#006aa7' } },
};

export const TIER_NAMES = { 1: 'Calle', 2: 'Deportivo', 3: 'Alto rendimiento', 4: 'Superdeportivo', 5: 'Hiperdeportivo' };
export const TIER_LETTERS = { 1: 'D', 2: 'C', 3: 'B', 4: 'A', 5: 'S' };
export const CLASS_NAMES = {
  compacto: 'Compacto', clasico: 'Clásico', jdm: 'JDM', muscle: 'Muscle', deportivo: 'Deportivo', super: 'Superdeportivo',
  hiper: 'Hiperdeportivo', rally: 'Rally', formula: 'Fórmula', pickup: 'Pickup',
};

const GRIP = { 1: 0.95, 2: 1.0, 3: 1.06, 4: 1.13, 5: 1.19 };
const BRAKE = { 1: 0.95, 2: 1.05, 3: 1.15, 4: 1.3, 5: 1.42 };
const CLASS_GRIP = { pickup: -0.1, clasico: -0.05, muscle: -0.03, rally: 0.01, super: 0.01, hiper: 0.01 };
const CLASS_DF = { super: 0.22, hiper: 0.35, formula: 1, rally: 0.08, jdm: 0.06, deportivo: 0.08, muscle: 0.04, compacto: 0.03, clasico: 0, pickup: 0 };
const FIRST = { 4: 3.6, 5: 3.45, 6: 3.3, 7: 3.5, 8: 4.7 };
const LAST = { 4: 0.95, 5: 0.8, 6: 0.72, 7: 0.68, 8: 0.67 };

// Cd·A que hace que physics.js llegue a `topKmh` con esa potencia y masa:
// 0.85·P = (0.62·dragCoef·v² + 0.013·m·g)·v  (fórmula de velocidad máxima de la física).
export function dragForTopSpeed(powerKw, massKg, topKmh) {
  const v = topKmh / 3.6;
  return r3(clamp((0.85 * powerKw * 1000 / v - 0.013 * massKg * 9.81) / (0.62 * v * v), 0.3, 1.2));
}

// Especificación física de fábrica a partir de datos reales (perf) del auto.
function buildSpec(d) {
  const p = d.perf, b = d.body, e = d.engine;
  const ev = e.layout === 'EV';
  const R = b.rearRadius || b.wheelRadius;
  const top = p.top / 3.6;
  const n = ev ? 1 : p.gears;
  const first = p.first ?? FIRST[n] ?? 3.4;
  const last = p.last ?? LAST[n] ?? 0.75;
  const gears = ev ? [1] : Array.from({ length: n }, (_, i) => r3(first * Math.pow(last / first, Math.pow(i / (n - 1), 0.85))));
  const redlineRpm = p.rpm;
  const idleRpm = p.idle ?? (ev ? 600 : redlineRpm > 8500 ? 1100 : 850);
  const wheelRpm = (top * 1.07) / (2 * Math.PI * R) * 60;
  const finalDrive = r3(redlineRpm / (wheelRpm * gears[gears.length - 1]));
  const powerKw = Math.round(p.hp * 0.7457);
  const massKg = p.kg;
  const dragCoef = dragForTopSpeed(powerKw, massKg, p.top);
  const fs = d.factory && d.factory.spoiler;
  const wing = ['gt', 'alto', 'cuello', 'arco', 'ballena'].includes(fs) ? 0.08 : 0;
  const cls = d.class;
  const formula = cls === 'formula';
  const pos = e.pos || 'F';
  const wf = p.wf ?? (pos === 'M' ? 0.42 : pos === 'R' ? 0.38 : p.drive === 'FWD' ? 0.62 : p.drive === 'AWD' ? 0.57 : 0.53);
  const special = d.id === 'patrulla';
  return {
    massKg, powerKw, torqueNm: p.nm, redlineRpm, idleRpm, gears, reverseRatio: 3.4, finalDrive,
    drivetrain: p.drive,
    tireGrip: r3(p.grip ?? clamp(GRIP[d.tier] + (CLASS_GRIP[cls] || 0), 0.8, 1.5)),
    brakeG: r3(p.brake ?? clamp(BRAKE[d.tier] + (cls === 'pickup' ? -0.12 : cls === 'clasico' ? -0.08 : 0), 0.8, 1.8)),
    downforce: r3(p.df ?? Math.min(1, (CLASS_DF[cls] || 0.05) + wing)),
    dragCoef,
    steerLockDeg: p.steer ?? (formula ? 22 : cls === 'super' || cls === 'hiper' ? 31 : cls === 'pickup' ? 36 : b.type === 'vocho' || b.type === 'mini' ? 38 : 34),
    wheelbase: b.wheelbase,
    trackWidth: r3(formula ? 1.6 : b.width * 0.85),
    cgHeight: r3(formula ? 0.26 : b.height * (cls === 'pickup' ? 0.4 : 0.36)),
    weightFront: wf,
    wheelRadius: b.wheelRadius,
    nitroCapacity: formula ? 0 : special ? 8 : 4,
    nitroBoost: special ? 1.3 : 1.25,
    shiftTime: p.shift ?? (ev ? 0 : formula ? 0.05 : d.year < 1990 ? 0.42 : n >= 7 ? 0.12 : d.year >= 2010 ? 0.2 : 0.3),
  };
}

function car(d) {
  d.name = d.brand + ' ' + d.model;
  d.hidden = !!d.hidden;
  d.body = { doors: 2, traits: [], lights: ['rect', 'rect'], ...d.body };
  d.engine = { turbo: false, pos: 'F', ...d.engine };
  d.factory = d.factory || {};
  d.spec = buildSpec(d);
  d.topKmh = d.perf.top;
  return d;
}

export const CARS = [
  // ───────────── México ─────────────
  car({ id: 'nissan-tsuru', brand: 'Nissan', model: 'Tsuru', year: 1992, country: 'MX', class: 'compacto', tier: 1, price: 8000, color: '#c3c8cf',
    body: { type: 'sedan', length: 4.33, width: 1.65, height: 1.38, wheelbase: 2.43, wheelRadius: 0.29, doors: 4, lights: ['rect', 'rect'] },
    perf: { hp: 105, kg: 1040, nm: 140, rpm: 6500, drive: 'FWD', gears: 5, top: 175 },
    engine: { layout: 'I4', cylinders: 4 }, factory: { rims: 'acero', lights: '#fff1c9', tint: 0.1 },
    desc: 'El sedán más querido de México: barato, aguantador y fácil de reparar.' }),
  car({ id: 'vw-sedan', brand: 'Volkswagen', model: 'Sedán «Vocho»', year: 2003, country: 'MX', class: 'clasico', tier: 1, price: 9500, color: '#4a90c2',
    body: { type: 'vocho', length: 4.06, width: 1.55, height: 1.5, wheelbase: 2.4, wheelRadius: 0.3, lights: ['round', 'classic'], rimFrac: 0.55 },
    perf: { hp: 46, kg: 820, nm: 98, rpm: 4800, drive: 'RWD', gears: 4, top: 130 },
    engine: { layout: 'F4', cylinders: 4, pos: 'R' }, factory: { rims: 'tapon', rimColor: '#e9edf2', lights: '#fff1c9', tint: 0 },
    desc: 'El escarabajo hecho en Puebla: motor atrás, enfriado por aire y con mucho corazón.' }),
  car({ id: 'chevrolet-chevy', brand: 'Chevrolet', model: 'Chevy', year: 2008, country: 'MX', class: 'compacto', tier: 1, price: 11000, color: '#c81e1e',
    body: { type: 'hatch', length: 3.74, width: 1.61, height: 1.42, wheelbase: 2.44, wheelRadius: 0.29, lights: ['rect', 'rect'] },
    perf: { hp: 101, kg: 960, nm: 132, rpm: 6200, drive: 'FWD', gears: 5, top: 172 },
    engine: { layout: 'I4', cylinders: 4 }, factory: { rims: 'acero', tint: 0.2 },
    desc: 'El hatchback de batalla de los 2000: ligero, nervioso y en todas las esquinas.' }),
  car({ id: 'vw-jetta-a4', brand: 'Volkswagen', model: 'Jetta Clásico', year: 2010, country: 'MX', class: 'compacto', tier: 1, price: 15000, color: '#0b1e5b',
    body: { type: 'sedan', length: 4.38, width: 1.73, height: 1.44, wheelbase: 2.51, wheelRadius: 0.31, doors: 4, lights: ['rect', 'rect'] },
    perf: { hp: 115, kg: 1270, nm: 170, rpm: 6000, drive: 'FWD', gears: 5, top: 190 },
    engine: { layout: 'I4', cylinders: 4 }, factory: { rims: 'cinco', finish: 'metalico' },
    desc: 'Sobrio y confiable: el sedán de toda la vida en las calles de Monterrey.' }),
  car({ id: 'ford-lobo', brand: 'Ford', model: 'Lobo', year: 2018, country: 'MX', class: 'pickup', tier: 2, price: 45000, color: '#0c0d10',
    body: { type: 'pickup', length: 5.89, width: 2.03, height: 1.96, wheelbase: 3.68, wheelRadius: 0.4, doors: 4, lights: ['rect', 'tall'], traits: ['bed', 'chromeGrille'] },
    perf: { hp: 395, kg: 2200, nm: 542, rpm: 7000, drive: 'RWD', gears: 6, top: 190 },
    engine: { layout: 'V8', cylinders: 8 }, factory: { rims: 'multi', rimColor: '#e9edf2', finish: 'metalico' },
    desc: 'La troca del norte: V8, caja amplia y presencia en cualquier carne asada.' }),
  car({ id: 'mastretta-mxt', brand: 'Mastretta', model: 'MXT', year: 2011, country: 'MX', class: 'deportivo', tier: 2, price: 60000, color: '#ff5a1f',
    body: { type: 'medio', length: 4.06, width: 1.84, height: 1.14, wheelbase: 2.4, wheelRadius: 0.31, lights: ['slim', 'round2'], traits: ['sideIntakes'] },
    perf: { hp: 250, kg: 900, nm: 340, rpm: 6800, drive: 'RWD', gears: 5, top: 240 },
    engine: { layout: 'I4', cylinders: 4, turbo: true, pos: 'M' }, factory: { rims: 'y', rimColor: '#151515' },
    desc: 'El deportivo mexicano de motor central: ligero como pluma y muy ágil.' }),

  // ───────────── Japón ─────────────
  car({ id: 'toyota-ae86', brand: 'Toyota', model: 'Sprinter Trueno AE86', year: 1985, country: 'JP', class: 'jdm', tier: 1, price: 24000, color: '#f4f4f2',
    body: { type: 'hatch', length: 4.18, width: 1.63, height: 1.33, wheelbase: 2.4, wheelRadius: 0.29, lights: ['popup', 'bar'], traits: ['panda', 'rhd'],
      prof: { rb: 0.7, rw: 0.92, deck: 0.66, tail: 0.64 } },
    perf: { hp: 128, kg: 950, nm: 149, rpm: 7600, drive: 'RWD', gears: 5, top: 195 },
    engine: { layout: 'I4', cylinders: 4 }, factory: { rims: 'seis', rimColor: '#c8ccd2', tint: 0.2 },
    desc: 'Leyenda de las bajadas de montaña: tracción trasera, poco peso y mucha técnica.' }),
  car({ id: 'mazda-mx5-na', brand: 'Mazda', model: 'MX-5 (NA)', year: 1990, country: 'JP', class: 'deportivo', tier: 1, price: 20000, color: '#0f4d2e',
    body: { type: 'coupe', length: 3.97, width: 1.68, height: 1.23, wheelbase: 2.27, wheelRadius: 0.29, lights: ['popup', 'rect'], traits: ['softTop'],
      prof: { ws: 0.4, rf: 0.5, rb: 0.6, rw: 0.7, roofW: 0.74, noseCurve: 2 } },
    perf: { hp: 115, kg: 960, nm: 136, rpm: 7200, drive: 'RWD', gears: 5, top: 190 },
    engine: { layout: 'I4', cylinders: 4 }, factory: { rims: 'multi' },
    desc: 'El roadster ligero por excelencia: faros escamoteables y balance perfecto.' }),
  car({ id: 'honda-civic-eg', brand: 'Honda', model: 'Civic SiR (EG)', year: 1992, country: 'JP', class: 'jdm', tier: 1, price: 22000, color: '#2a7fc9',
    body: { type: 'hatch', length: 4.07, width: 1.69, height: 1.35, wheelbase: 2.57, wheelRadius: 0.29, lights: ['slim', 'bar'], prof: { rb: 0.74, rw: 0.95 } },
    perf: { hp: 170, kg: 1060, nm: 157, rpm: 8200, drive: 'FWD', gears: 5, top: 215 },
    engine: { layout: 'I4', cylinders: 4 }, factory: { rims: 'cinco' },
    desc: 'VTEC a 8,000 rpm: el hatch que convirtió la tracción delantera en arte.' }),
  car({ id: 'nissan-silvia-s15', brand: 'Nissan', model: 'Silvia Spec-R (S15)', year: 1999, country: 'JP', class: 'jdm', tier: 2, price: 48000, color: '#f2d21b',
    body: { type: 'coupe', length: 4.45, width: 1.7, height: 1.29, wheelbase: 2.53, wheelRadius: 0.32, lights: ['slim', 'rect'], traits: ['rhd'] },
    perf: { hp: 247, kg: 1240, nm: 275, rpm: 7500, drive: 'RWD', gears: 6, top: 245 },
    engine: { layout: 'I4', cylinders: 4, turbo: true }, factory: { rims: 'cinco', rimColor: '#4a4e55', spoiler: 'labio' },
    desc: 'La reina del drift: turbo, tracción trasera y un chasis muy noble.' }),
  car({ id: 'mazda-rx7-fd', brand: 'Mazda', model: 'RX-7 (FD)', year: 1993, country: 'JP', class: 'jdm', tier: 2, price: 62000, color: '#c81e1e',
    body: { type: 'coupe', length: 4.29, width: 1.76, height: 1.23, wheelbase: 2.43, wheelRadius: 0.32, lights: ['popup', 'round2'],
      prof: { ws: 0.34, rf: 0.5, rb: 0.62, rw: 0.84, nose: 0.42, hood: 0.56, noseCurve: 2.2 } },
    perf: { hp: 255, kg: 1280, nm: 294, rpm: 8000, drive: 'RWD', gears: 5, top: 250 },
    engine: { layout: 'R2', cylinders: 2, turbo: true }, factory: { rims: 'cinco', spoiler: 'arco' },
    desc: 'Motor rotativo biturbo que grita a 8,000 rpm y una silueta de escultura.' }),
  car({ id: 'toyota-supra-a80', brand: 'Toyota', model: 'Supra (A80)', year: 1997, country: 'JP', class: 'jdm', tier: 3, price: 105000, color: '#ff9500',
    body: { type: 'coupe', length: 4.52, width: 1.81, height: 1.27, wheelbase: 2.55, wheelRadius: 0.33, lights: ['rect', 'round2'], prof: { noseCurve: 2, rw: 0.86 } },
    perf: { hp: 326, kg: 1510, nm: 441, rpm: 6800, drive: 'RWD', gears: 6, top: 285 },
    engine: { layout: 'I6', cylinders: 6, turbo: true }, factory: { rims: 'cinco', spoiler: 'arco' },
    desc: 'El 2JZ biturbo aguanta lo que le eches. Ícono de toda una generación.' }),
  car({ id: 'nissan-skyline-r34', brand: 'Nissan', model: 'Skyline GT-R (R34)', year: 1999, country: 'JP', class: 'jdm', tier: 3, price: 125000, color: '#1d4fbf',
    body: { type: 'coupe', length: 4.6, width: 1.79, height: 1.36, wheelbase: 2.67, wheelRadius: 0.33, lights: ['rect', 'round4'], traits: ['rhd'],
      prof: { noseCurve: 1.2, hoodCrown: 0.005, rw: 0.8, roofW: 0.8 } },
    perf: { hp: 330, kg: 1560, nm: 392, rpm: 8000, drive: 'AWD', gears: 6, top: 280 },
    engine: { layout: 'I6', cylinders: 6, turbo: true }, factory: { rims: 'seis', spoiler: 'alto', finish: 'metalico' },
    desc: 'Godzilla de los 90: tracción integral inteligente y el RB26 de seis en línea.' }),
  car({ id: 'honda-nsx', brand: 'Honda', model: 'NSX (NA1)', year: 1991, country: 'JP', class: 'deportivo', tier: 3, price: 110000, color: '#b3121b',
    body: { type: 'medio', length: 4.43, width: 1.81, height: 1.17, wheelbase: 2.53, wheelRadius: 0.32, lights: ['popup', 'bar'] },
    perf: { hp: 270, kg: 1370, nm: 284, rpm: 8000, drive: 'RWD', gears: 5, top: 270 },
    engine: { layout: 'V6', cylinders: 6, pos: 'M' }, factory: { rims: 'cinco' },
    desc: 'El superdeportivo para todos los días: motor central VTEC y chasis de aluminio.' }),
  car({ id: 'honda-civic-type-r', brand: 'Honda', model: 'Civic Type R (FK8)', year: 2018, country: 'JP', class: 'compacto', tier: 2, price: 58000, color: '#f4f4f2',
    body: { type: 'hatch', length: 4.56, width: 1.88, height: 1.43, wheelbase: 2.7, wheelRadius: 0.34, lights: ['slim', 'rect'],
      traits: ['hoodScoop', 'centerExhaust', 'flares'], prof: { rb: 0.68, rw: 0.92 } },
    perf: { hp: 306, kg: 1380, nm: 400, rpm: 7000, drive: 'FWD', gears: 6, top: 272 },
    engine: { layout: 'I4', cylinders: 4, turbo: true }, factory: { rims: 'y', rimColor: '#151515', caliper: '#d01818', spoiler: 'gt' },
    desc: 'Tracción delantera de récord en Nürburgring, con un alerón que no pasa desapercibido.' }),
  car({ id: 'subaru-impreza-sti', brand: 'Subaru', model: 'Impreza WRX STI', year: 2004, country: 'JP', class: 'rally', tier: 2, price: 72000, color: '#1d3fbf',
    body: { type: 'sedan', length: 4.47, width: 1.74, height: 1.43, wheelbase: 2.53, wheelRadius: 0.33, doors: 4, lights: ['rect', 'round2'], traits: ['hoodScoop'] },
    perf: { hp: 300, kg: 1470, nm: 407, rpm: 7000, drive: 'AWD', gears: 6, top: 255 },
    engine: { layout: 'F4', cylinders: 4, turbo: true }, factory: { rims: 'malla', rimColor: '#c9a227', spoiler: 'alto', finish: 'perla' },
    desc: 'Azul con rines dorados: el bóxer turbo que dominó los tramos de rally.' }),
  car({ id: 'mitsubishi-lancer-evo', brand: 'Mitsubishi', model: 'Lancer Evolution IX', year: 2006, country: 'JP', class: 'rally', tier: 2, price: 70000, color: '#9a1220',
    body: { type: 'sedan', length: 4.49, width: 1.77, height: 1.45, wheelbase: 2.63, wheelRadius: 0.33, doors: 4, lights: ['rect', 'rect'], traits: ['hoodVents'] },
    perf: { hp: 286, kg: 1400, nm: 392, rpm: 7000, drive: 'AWD', gears: 5, top: 250 },
    engine: { layout: 'I4', cylinders: 4, turbo: true }, factory: { rims: 'cinco', rimColor: '#4a4e55', spoiler: 'alto' },
    desc: 'El eterno rival del STI: diferenciales activos y un turbo que no perdona.' }),
  car({ id: 'nissan-gt-r-r35', brand: 'Nissan', model: 'GT-R (R35)', year: 2017, country: 'JP', class: 'super', tier: 4, price: 310000, color: '#5f646c',
    body: { type: 'fastback', length: 4.71, width: 1.9, height: 1.37, wheelbase: 2.78, wheelRadius: 0.35, lights: ['slim', 'round4'], traits: ['quadExhaust', 'hoodVents'] },
    perf: { hp: 565, kg: 1750, nm: 633, rpm: 7100, drive: 'AWD', gears: 6, top: 315 },
    engine: { layout: 'V6', cylinders: 6, turbo: true }, factory: { rims: 'seis', rimColor: '#4a4e55', spoiler: 'ducktail', finish: 'metalico' },
    desc: 'Tecnología pura: doble embrague, tracción integral y cero a cien en menos de 3 s.' }),

  // ───────────── Alemania ─────────────
  car({ id: 'vw-golf-gti', brand: 'Volkswagen', model: 'Golf GTI (Mk7)', year: 2017, country: 'DE', class: 'compacto', tier: 2, price: 38000, color: '#d01818',
    body: { type: 'hatch', length: 4.27, width: 1.8, height: 1.44, wheelbase: 2.63, wheelRadius: 0.33, lights: ['slim', 'rect'], traits: ['gtiLine'] },
    perf: { hp: 228, kg: 1350, nm: 350, rpm: 6500, drive: 'FWD', gears: 6, top: 250 },
    engine: { layout: 'I4', cylinders: 4, turbo: true }, factory: { rims: 'cinco', spoiler: 'labio' },
    desc: 'El hot hatch original: rápido, cómodo y con la línea roja en la parrilla.' }),
  car({ id: 'audi-quattro', brand: 'Audi', model: 'Quattro', year: 1983, country: 'DE', class: 'rally', tier: 2, price: 55000, color: '#e9e3d6',
    body: { type: 'coupe', length: 4.4, width: 1.72, height: 1.34, wheelbase: 2.52, wheelRadius: 0.31, lights: ['rect', 'bar'], traits: ['flares'],
      prof: { noseCurve: 1, hoodCrown: 0, rb: 0.66, rw: 0.78, roofW: 0.82 } },
    perf: { hp: 200, kg: 1290, nm: 285, rpm: 6500, drive: 'AWD', gears: 5, top: 225 },
    engine: { layout: 'I5', cylinders: 5, turbo: true }, factory: { rims: 'telefono' },
    desc: 'El que inventó la tracción integral en los rallies. Cinco cilindros y ensanches cuadrados.' }),
  car({ id: 'bmw-m3-e46', brand: 'BMW', model: 'M3 (E46)', year: 2001, country: 'DE', class: 'deportivo', tier: 3, price: 92000, color: '#2b6cb0',
    body: { type: 'coupe', length: 4.49, width: 1.78, height: 1.37, wheelbase: 2.73, wheelRadius: 0.33, lights: ['quad', 'rect'], traits: ['quadExhaust', 'bulgeHood'] },
    perf: { hp: 338, kg: 1570, nm: 365, rpm: 8000, drive: 'RWD', gears: 6, top: 270 },
    engine: { layout: 'I6', cylinders: 6 }, factory: { rims: 'y', finish: 'metalico' },
    desc: 'Seis en línea atmosférico a 8,000 rpm y el balance clásico de los M.' }),
  car({ id: 'porsche-911-turbo-930', brand: 'Porsche', model: '911 Turbo (930)', year: 1985, country: 'DE', class: 'clasico', tier: 3, price: 135000, color: '#0c0d10',
    body: { type: 'p911', length: 4.29, width: 1.78, height: 1.31, wheelbase: 2.27, wheelRadius: 0.32, lights: ['fenderRound', 'bar'], traits: ['wideHips'], rimFrac: 0.6 },
    perf: { hp: 300, kg: 1335, nm: 412, rpm: 6800, drive: 'RWD', gears: 4, top: 260 },
    engine: { layout: 'F6', cylinders: 6, turbo: true, pos: 'R' }, factory: { rims: 'cinco', spoiler: 'ballena', lights: '#fff1c9' },
    desc: 'El «hacedor de viudas»: motor atrás, turbo de golpe y cola de ballena.' }),
  car({ id: 'porsche-911-gt3-rs', brand: 'Porsche', model: '911 GT3 RS (991)', year: 2018, country: 'DE', class: 'super', tier: 4, price: 380000, color: '#ff5a1f',
    body: { type: 'p911', length: 4.55, width: 1.88, height: 1.3, wheelbase: 2.46, wheelRadius: 0.35, lights: ['fenderRound', 'bar'], traits: ['wideHips', 'hoodVents'] },
    perf: { hp: 520, kg: 1430, nm: 470, rpm: 9000, drive: 'RWD', gears: 7, top: 312 },
    engine: { layout: 'F6', cylinders: 6, pos: 'R' }, factory: { rims: 'carreras', rimColor: '#151515', spoiler: 'gt', caliper: '#ffd000' },
    desc: 'Un auto de carreras con placas: bóxer a 9,000 rpm y alerón gigante.' }),
  car({ id: 'mercedes-amg-gt-r', brand: 'Mercedes-AMG', model: 'GT R', year: 2018, country: 'DE', class: 'super', tier: 4, price: 340000, color: '#3c6e47',
    body: { type: 'gt', length: 4.55, width: 2.0, height: 1.28, wheelbase: 2.63, wheelRadius: 0.35, lights: ['slim', 'slim'], traits: ['hoodVents', 'centerExhaust'] },
    perf: { hp: 577, kg: 1630, nm: 700, rpm: 7000, drive: 'RWD', gears: 7, top: 318, wf: 0.47 },
    engine: { layout: 'V8', cylinders: 8, turbo: true }, factory: { rims: 'y', rimColor: '#151515', caliper: '#ffd000', spoiler: 'gt', finish: 'mate' },
    desc: 'La bestia del infierno verde: cofre larguísimo y V8 biturbo.' }),
  car({ id: 'audi-r8', brand: 'Audi', model: 'R8 V10 Plus', year: 2017, country: 'DE', class: 'super', tier: 4, price: 360000, color: '#e9edf2',
    body: { type: 'medio', length: 4.43, width: 1.94, height: 1.24, wheelbase: 2.65, wheelRadius: 0.34, lights: ['slim', 'slim'], traits: ['sideBlade', 'sideIntakes'] },
    perf: { hp: 602, kg: 1555, nm: 560, rpm: 8700, drive: 'AWD', gears: 7, top: 330 },
    engine: { layout: 'V10', cylinders: 10, pos: 'M' }, factory: { rims: 'y', rimColor: '#4a4e55', spoiler: 'labio', caliper: '#d01818' },
    desc: 'V10 atmosférico detrás de tu cabeza y tracción integral para diario.' }),
  car({ id: 'porsche-918', brand: 'Porsche', model: '918 Spyder', year: 2015, country: 'DE', class: 'hiper', tier: 5, price: 1500000, color: '#c3c8cf',
    body: { type: 'hiper', length: 4.64, width: 1.94, height: 1.17, wheelbase: 2.73, wheelRadius: 0.36, lights: ['quad', 'bar'], traits: ['topExhaust'] },
    perf: { hp: 887, kg: 1675, nm: 1280, rpm: 9150, drive: 'AWD', gears: 7, top: 345 },
    engine: { layout: 'V8', cylinders: 8, pos: 'M', hybrid: true }, factory: { rims: 'turbina', spoiler: 'labio', finish: 'metalico', caliper: '#c9e000' },
    desc: 'Híbrido de 887 caballos: V8 de carreras con dos motores eléctricos.' }),

  // ───────────── Italia ─────────────
  car({ id: 'lancia-delta-integrale', brand: 'Lancia', model: 'Delta HF Integrale', year: 1992, country: 'IT', class: 'rally', tier: 2, price: 65000, color: '#c81e1e',
    body: { type: 'hatch', length: 3.9, width: 1.77, height: 1.36, wheelbase: 2.48, wheelRadius: 0.31, doors: 4, lights: ['quad', 'rect'], traits: ['flares'],
      prof: { noseCurve: 1, hoodCrown: 0, rb: 0.8, rw: 0.95, roofW: 0.84 } },
    perf: { hp: 210, kg: 1340, nm: 300, rpm: 6500, drive: 'AWD', gears: 5, top: 220 },
    engine: { layout: 'I4', cylinders: 4, turbo: true }, factory: { rims: 'seis', spoiler: 'labio' },
    desc: 'Seis títulos mundiales de rally seguidos. Cuadrado, ancho y feroz.' }),
  car({ id: 'lamborghini-countach', brand: 'Lamborghini', model: 'Countach LP5000 QV', year: 1985, country: 'IT', class: 'super', tier: 3, price: 240000, color: '#f4f4f2',
    body: { type: 'cuna', length: 4.14, width: 2.0, height: 1.07, wheelbase: 2.45, wheelRadius: 0.34, lights: ['popup', 'rect'], traits: ['sideIntakes', 'louvers'],
      prof: { ws: 0.2, rf: 0.45, rb: 0.56, rw: 0.72, nose: 0.32, hood: 0.5, deck: 0.66, tail: 0.64, roofW: 0.66, noseCurve: 1 } },
    perf: { hp: 455, kg: 1490, nm: 500, rpm: 7500, drive: 'RWD', gears: 5, top: 295 },
    engine: { layout: 'V12', cylinders: 12, pos: 'M' }, factory: { rims: 'telefono', spoiler: 'gt' },
    desc: 'La cuña definitiva de los 80: puertas de tijera, V12 y alerón en V.' }),
  car({ id: 'ferrari-f40', brand: 'Ferrari', model: 'F40', year: 1987, country: 'IT', class: 'super', tier: 4, price: 520000, color: '#d40000',
    body: { type: 'cuna', length: 4.36, width: 1.97, height: 1.12, wheelbase: 2.45, wheelRadius: 0.34, lights: ['rect', 'round4'], traits: ['louvers', 'sideIntakes', 'centerExhaust'],
      prof: { rw: 0.7, deck: 0.64, tail: 0.62 } },
    perf: { hp: 471, kg: 1100, nm: 577, rpm: 7750, drive: 'RWD', gears: 5, top: 324 },
    engine: { layout: 'V8', cylinders: 8, turbo: true, pos: 'M' }, factory: { rims: 'cinco', spoiler: 'gt' },
    desc: 'El último Ferrari aprobado por Enzo: biturbo, ligero y sin ayudas.' }),
  car({ id: 'ferrari-488', brand: 'Ferrari', model: '488 GTB', year: 2016, country: 'IT', class: 'super', tier: 4, price: 560000, color: '#ffcc00',
    body: { type: 'medio', length: 4.57, width: 1.95, height: 1.21, wheelbase: 2.65, wheelRadius: 0.34, lights: ['slim', 'round2'], traits: ['sideIntakes'] },
    perf: { hp: 661, kg: 1475, nm: 760, rpm: 8000, drive: 'RWD', gears: 7, top: 330 },
    engine: { layout: 'V8', cylinders: 8, turbo: true, pos: 'M' }, factory: { rims: 'cinco', rimColor: '#151515', spoiler: 'labio' },
    desc: 'V8 biturbo de 661 caballos con tomas laterales que respiran velocidad.' }),
  car({ id: 'lamborghini-huracan', brand: 'Lamborghini', model: 'Huracán Performante', year: 2018, country: 'IT', class: 'super', tier: 4, price: 600000, color: '#7ed321',
    body: { type: 'cuna', length: 4.51, width: 1.93, height: 1.17, wheelbase: 2.62, wheelRadius: 0.34, lights: ['slim', 'slim'], traits: ['sideIntakes'] },
    perf: { hp: 631, kg: 1382, nm: 600, rpm: 8500, drive: 'AWD', gears: 7, top: 325 },
    engine: { layout: 'V10', cylinders: 10, pos: 'M' }, factory: { rims: 'y', rimColor: '#151515', spoiler: 'gt' },
    desc: 'V10 que aúlla, aerodinámica activa y tracción integral.' }),
  car({ id: 'lamborghini-aventador', brand: 'Lamborghini', model: 'Aventador SVJ', year: 2019, country: 'IT', class: 'super', tier: 4, price: 880000, color: '#2b2f36',
    body: { type: 'cuna', length: 4.94, width: 2.1, height: 1.14, wheelbase: 2.7, wheelRadius: 0.36, lights: ['slim', 'slim'], traits: ['sideIntakes', 'louvers', 'centerExhaust'] },
    perf: { hp: 759, kg: 1525, nm: 720, rpm: 8700, drive: 'AWD', gears: 7, top: 350 },
    engine: { layout: 'V12', cylinders: 12, pos: 'M' }, factory: { rims: 'y', rimColor: '#151515', spoiler: 'gt', finish: 'mate', caliper: '#ff6a1f' },
    desc: 'V12 atmosférico de 770 caballos. Ruidoso, filoso y descarado.' }),
  car({ id: 'pagani-zonda', brand: 'Pagani', model: 'Zonda F', year: 2005, country: 'IT', class: 'hiper', tier: 5, price: 1600000, color: '#9db4c0',
    body: { type: 'hiper', length: 4.44, width: 2.05, height: 1.15, wheelbase: 2.73, wheelRadius: 0.35, lights: ['quad', 'round4'], traits: ['snorkel', 'zondaExhaust'],
      prof: { rw: 0.76 } },
    perf: { hp: 602, kg: 1230, nm: 760, rpm: 7500, drive: 'RWD', gears: 6, top: 345 },
    engine: { layout: 'V12', cylinders: 12, pos: 'M' }, factory: { rims: 'carreras', rimColor: '#c8ccd2', spoiler: 'gt', finish: 'metalico' },
    desc: 'Arte italiano con V12 alemán: carbono por todos lados y escape cuádruple al centro.' }),
  car({ id: 'ferrari-laferrari', brand: 'Ferrari', model: 'LaFerrari', year: 2014, country: 'IT', class: 'hiper', tier: 5, price: 2800000, color: '#d40000',
    body: { type: 'hiper', length: 4.7, width: 1.99, height: 1.12, wheelbase: 2.65, wheelRadius: 0.35, lights: ['slim', 'round2'], traits: ['sideIntakes'] },
    perf: { hp: 950, kg: 1585, nm: 900, rpm: 9250, drive: 'RWD', gears: 7, top: 350 },
    engine: { layout: 'V12', cylinders: 12, pos: 'M', hybrid: true }, factory: { rims: 'cinco', rimColor: '#4a4e55' },
    desc: 'V12 híbrido de 950 caballos: el Ferrari de calle más extremo de su década.' }),

  // ───────────── Estados Unidos ─────────────
  car({ id: 'ford-mustang-gt', brand: 'Ford', model: 'Mustang GT', year: 2018, country: 'US', class: 'muscle', tier: 3, price: 98000, color: '#1d9bf0',
    body: { type: 'muscle', length: 4.79, width: 1.92, height: 1.38, wheelbase: 2.72, wheelRadius: 0.35, lights: ['slim', 'tri'], traits: ['hoodVents', 'quadExhaust'] },
    perf: { hp: 460, kg: 1720, nm: 570, rpm: 7500, drive: 'RWD', gears: 6, top: 280 },
    engine: { layout: 'V8', cylinders: 8 }, factory: { rims: 'cinco', rimColor: '#4a4e55', spoiler: 'labio' },
    desc: 'El pony car por excelencia: V8 Coyote y tres barras en cada calavera.' }),
  car({ id: 'chevrolet-camaro-ss', brand: 'Chevrolet', model: 'Camaro SS', year: 2017, country: 'US', class: 'muscle', tier: 3, price: 96000, color: '#ffd23f',
    body: { type: 'muscle', length: 4.78, width: 1.9, height: 1.35, wheelbase: 2.81, wheelRadius: 0.35, lights: ['slim', 'rect'], traits: ['hoodVents', 'quadExhaust'],
      prof: { hood: 0.68, roofW: 0.72, rf: 0.55 } },
    perf: { hp: 455, kg: 1700, nm: 617, rpm: 6500, drive: 'RWD', gears: 6, top: 290 },
    engine: { layout: 'V8', cylinders: 8 }, factory: { rims: 'cinco', rimColor: '#151515', spoiler: 'labio', vinyl: 'franjas', vinylColor: '#0c0d10' },
    desc: 'Ventanas de búnker, V8 LT1 y franjas negras sobre amarillo.' }),
  car({ id: 'dodge-challenger-hellcat', brand: 'Dodge', model: 'Challenger SRT Hellcat', year: 2015, country: 'US', class: 'muscle', tier: 3, price: 180000, color: '#5b2bbf',
    body: { type: 'muscle', length: 5.03, width: 1.92, height: 1.45, wheelbase: 2.95, wheelRadius: 0.36, lights: ['quad', 'bar'], traits: ['hoodScoop', 'twinExhaust'],
      prof: { nose: 0.62, noseCurve: 1, hoodCrown: 0.005, rb: 0.7, rw: 0.82 } },
    perf: { hp: 707, kg: 2000, nm: 881, rpm: 6200, drive: 'RWD', gears: 8, top: 320 },
    engine: { layout: 'V8', cylinders: 8, supercharged: true }, factory: { rims: 'cinco', rimColor: '#151515', caliper: '#d01818' },
    desc: '707 caballos con supercargador: pesado, brutal y orgulloso de serlo.' }),
  car({ id: 'dodge-viper-gts', brand: 'Dodge', model: 'Viper GTS', year: 1996, country: 'US', class: 'super', tier: 3, price: 160000, color: '#1d3fbf',
    body: { type: 'gt', length: 4.49, width: 1.94, height: 1.19, wheelbase: 2.44, wheelRadius: 0.34, lights: ['slim', 'rect'], traits: ['hoodVents', 'centerExhaust'],
      prof: { ws: 0.5, rf: 0.6, rb: 0.72, rw: 0.86, nose: 0.42 } },
    perf: { hp: 450, kg: 1560, nm: 664, rpm: 6000, drive: 'RWD', gears: 6, top: 298 },
    engine: { layout: 'V10', cylinders: 10 }, factory: { rims: 'cinco', vinyl: 'franjas', vinylColor: '#ffffff' },
    desc: 'V10 de 8 litros, cero ayudas y las franjas más famosas de los 90.' }),
  car({ id: 'chevrolet-corvette-c8', brand: 'Chevrolet', model: 'Corvette Stingray (C8)', year: 2020, country: 'US', class: 'super', tier: 3, price: 230000, color: '#ff3b30',
    body: { type: 'medio', length: 4.63, width: 1.93, height: 1.23, wheelbase: 2.72, wheelRadius: 0.35, lights: ['slim', 'slim'], traits: ['sideIntakes', 'quadExhaust'] },
    perf: { hp: 495, kg: 1530, nm: 637, rpm: 6500, drive: 'RWD', gears: 8, top: 312 },
    engine: { layout: 'V8', cylinders: 8, pos: 'M' }, factory: { rims: 'y', rimColor: '#4a4e55', spoiler: 'labio', caliper: '#d01818' },
    desc: 'El Corvette se pasó al motor central: precio de deportivo, alma de superdeportivo.' }),
  car({ id: 'tesla-model-s-plaid', brand: 'Tesla', model: 'Model S Plaid', year: 2021, country: 'US', class: 'deportivo', tier: 4, price: 330000, color: '#f4f4f2',
    body: { type: 'fastback', length: 4.97, width: 1.96, height: 1.44, wheelbase: 2.96, wheelRadius: 0.36, doors: 4, lights: ['slim', 'slim'], traits: ['noGrille'] },
    perf: { hp: 1020, kg: 2160, nm: 1420, rpm: 20000, drive: 'AWD', gears: 1, top: 322, idle: 600 },
    engine: { layout: 'EV', cylinders: 0, pos: 'M' }, factory: { rims: 'aero', rimColor: '#4a4e55', tint: 0.65 },
    desc: 'Tres motores eléctricos y 1,020 caballos: la familia llega primero a todos lados.' }),
  car({ id: 'ford-gt', brand: 'Ford', model: 'GT', year: 2017, country: 'US', class: 'super', tier: 4, price: 650000, color: '#f4f4f2',
    body: { type: 'cuna', length: 4.76, width: 2.0, height: 1.11, wheelbase: 2.71, wheelRadius: 0.36, lights: ['slim', 'round2'], traits: ['buttress', 'centerExhaust'] },
    perf: { hp: 647, kg: 1385, nm: 746, rpm: 7000, drive: 'RWD', gears: 7, top: 348 },
    engine: { layout: 'V6', cylinders: 6, turbo: true, pos: 'M' }, factory: { rims: 'cinco', rimColor: '#151515', spoiler: 'labio', vinyl: 'franjas', vinylColor: '#1d3fbf' },
    desc: 'Arbotantes aerodinámicos, V6 biturbo y ADN de Le Mans.' }),

  // ───────────── Reino Unido ─────────────
  car({ id: 'mini-cooper', brand: 'Mini', model: 'Cooper S', year: 1965, country: 'GB', class: 'clasico', tier: 1, price: 16000, color: '#0f4d2e',
    body: { type: 'mini', length: 3.05, width: 1.41, height: 1.35, wheelbase: 2.04, wheelRadius: 0.25, lights: ['round', 'classic'], traits: ['whiteRoof'], rimFrac: 0.6 },
    perf: { hp: 76, kg: 650, nm: 108, rpm: 6500, drive: 'FWD', gears: 4, top: 155 },
    engine: { layout: 'I4', cylinders: 4 }, factory: { rims: 'multi', lights: '#fff1c9', tint: 0 },
    desc: 'Diminuto y travieso: ganó el Rally de Montecarlo a autos mucho más grandes.' }),
  car({ id: 'jaguar-e-type', brand: 'Jaguar', model: 'E-Type', year: 1961, country: 'GB', class: 'clasico', tier: 2, price: 74000, color: '#7d0f1d',
    body: { type: 'gt', length: 4.45, width: 1.66, height: 1.22, wheelbase: 2.44, wheelRadius: 0.32, lights: ['round', 'classic'], rimFrac: 0.58,
      prof: { ws: 0.53, rf: 0.63, rb: 0.74, rw: 0.93, nose: 0.42, hood: 0.62, roofW: 0.72, noseCurve: 2.4, deck: 0.6, tail: 0.5 } },
    perf: { hp: 265, kg: 1230, nm: 351, rpm: 5500, drive: 'RWD', gears: 4, top: 240 },
    engine: { layout: 'I6', cylinders: 6 }, factory: { rims: 'radios', rimColor: '#e9edf2', lights: '#fff1c9', tint: 0 },
    desc: 'Para muchos, el auto más bello jamás hecho: cofre eterno y rines de rayos.' }),
  car({ id: 'aston-martin-db5', brand: 'Aston Martin', model: 'DB5', year: 1964, country: 'GB', class: 'clasico', tier: 2, price: 79000, color: '#b9bec4',
    body: { type: 'gt', length: 4.57, width: 1.68, height: 1.34, wheelbase: 2.49, wheelRadius: 0.33, lights: ['round', 'classic'], rimFrac: 0.58,
      prof: { ws: 0.44, rf: 0.55, rb: 0.72, rw: 0.84, nose: 0.5, noseCurve: 2 } },
    perf: { hp: 282, kg: 1500, nm: 390, rpm: 5500, drive: 'RWD', gears: 5, top: 230 },
    engine: { layout: 'I6', cylinders: 6 }, factory: { rims: 'radios', rimColor: '#e9edf2', lights: '#fff1c9', tint: 0, finish: 'metalico' },
    desc: 'Elegancia británica de los 60: gran turismo de seis en línea.' }),
  car({ id: 'aston-martin-vantage', brand: 'Aston Martin', model: 'Vantage', year: 2018, country: 'GB', class: 'deportivo', tier: 3, price: 220000, color: '#b5d334',
    body: { type: 'gt', length: 4.47, width: 1.94, height: 1.27, wheelbase: 2.7, wheelRadius: 0.35, lights: ['slim', 'slim'], traits: ['twinExhaust'] },
    perf: { hp: 503, kg: 1530, nm: 685, rpm: 7000, drive: 'RWD', gears: 8, top: 314 },
    engine: { layout: 'V8', cylinders: 8, turbo: true }, factory: { rims: 'y', rimColor: '#151515', spoiler: 'ducktail' },
    desc: 'Cola de pato, V8 biturbo y un cofre que no se acaba.' }),
  car({ id: 'mclaren-720s', brand: 'McLaren', model: '720S', year: 2018, country: 'GB', class: 'super', tier: 4, price: 720000, color: '#ff8a1f',
    body: { type: 'cuna', length: 4.54, width: 1.93, height: 1.2, wheelbase: 2.67, wheelRadius: 0.35, lights: ['slim', 'slim'], traits: ['twinExhaust'], prof: { rw: 0.78 } },
    perf: { hp: 710, kg: 1419, nm: 770, rpm: 8500, drive: 'RWD', gears: 7, top: 341 },
    engine: { layout: 'V8', cylinders: 8, turbo: true, pos: 'M' }, factory: { rims: 'y', spoiler: 'labio' },
    desc: 'Cabina de burbuja, V8 biturbo y freno de aire que se levanta solo.' }),
  car({ id: 'mclaren-f1', brand: 'McLaren', model: 'F1', year: 1994, country: 'GB', class: 'hiper', tier: 5, price: 2200000, color: '#0c0d10',
    body: { type: 'hiper', length: 4.29, width: 1.82, height: 1.14, wheelbase: 2.72, wheelRadius: 0.33, lights: ['rect', 'round4'], traits: ['snorkel', 'centerSeat'],
      prof: { ws: 0.27, rf: 0.43, rb: 0.56, rw: 0.74, nose: 0.36, noseCurve: 2 } },
    perf: { hp: 618, kg: 1140, nm: 650, rpm: 7500, drive: 'RWD', gears: 6, top: 386 },
    engine: { layout: 'V12', cylinders: 12, pos: 'M' }, factory: { rims: 'cinco', rimColor: '#c8ccd2' },
    desc: 'Asiento central, motor forrado de oro y 386 km/h. Una obra maestra.' }),

  // ───────────── Francia ─────────────
  car({ id: 'peugeot-205-gti', brand: 'Peugeot', model: '205 GTI', year: 1988, country: 'FR', class: 'compacto', tier: 1, price: 18000, color: '#f4f4f2',
    body: { type: 'hatch', length: 3.71, width: 1.57, height: 1.35, wheelbase: 2.42, wheelRadius: 0.28, lights: ['rect', 'rect'],
      prof: { noseCurve: 1.2, rb: 0.78, rw: 0.95 } },
    perf: { hp: 130, kg: 875, nm: 164, rpm: 6500, drive: 'FWD', gears: 5, top: 205 },
    engine: { layout: 'I4', cylinders: 4 }, factory: { rims: 'telefono', vinyl: 'rayas', vinylColor: '#c81e1e', tint: 0.1 },
    desc: 'El hot hatch francés de los 80: ligerito, juguetón y con filetes rojos.' }),
  car({ id: 'renault-5-turbo', brand: 'Renault', model: '5 Turbo', year: 1981, country: 'FR', class: 'rally', tier: 2, price: 52000, color: '#1d5fd1',
    body: { type: 'hatch', length: 3.66, width: 1.75, height: 1.32, wheelbase: 2.43, wheelRadius: 0.3, lights: ['rect', 'rect'], traits: ['wideHips', 'sideIntakes'],
      prof: { noseCurve: 1, hoodCrown: 0, rb: 0.78, rw: 0.95, roofW: 0.76 } },
    perf: { hp: 160, kg: 970, nm: 221, rpm: 6500, drive: 'RWD', gears: 5, top: 200 },
    engine: { layout: 'I4', cylinders: 4, turbo: true, pos: 'M' }, factory: { rims: 'turbina' },
    desc: 'Un auto chiquito con el motor donde iban los asientos traseros y caderas enormes.' }),
  car({ id: 'alpine-a110', brand: 'Alpine', model: 'A110', year: 2018, country: 'FR', class: 'deportivo', tier: 2, price: 68000, color: '#2a6fd6',
    body: { type: 'medio', length: 4.18, width: 1.8, height: 1.25, wheelbase: 2.42, wheelRadius: 0.32, lights: ['quad', 'slim'], prof: { noseCurve: 2, rw: 0.78 } },
    perf: { hp: 252, kg: 1100, nm: 320, rpm: 6750, drive: 'RWD', gears: 7, top: 250 },
    engine: { layout: 'I4', cylinders: 4, turbo: true, pos: 'M' }, factory: { rims: 'cinco', finish: 'metalico' },
    desc: 'Ligero y ágil como sus antepasados de rally, con faros redondos dobles.' }),
  car({ id: 'bugatti-chiron', brand: 'Bugatti', model: 'Chiron', year: 2017, country: 'FR', class: 'hiper', tier: 5, price: 3300000, color: '#1d3fbf',
    body: { type: 'hiper', length: 4.54, width: 2.04, height: 1.21, wheelbase: 2.71, wheelRadius: 0.36, lights: ['quad', 'bar'], traits: ['cLine', 'ovalGrille', 'quadExhaust'] },
    perf: { hp: 1500, kg: 1995, nm: 1600, rpm: 6700, drive: 'AWD', gears: 7, top: 420 },
    engine: { layout: 'W16', cylinders: 16, turbo: true, pos: 'M' }, factory: { rims: 'cinco', spoiler: 'labio', finish: 'perla' },
    desc: 'W16 de cuatro turbos y 1,500 caballos: el rey de la velocidad.' }),

  // ───────────── Corea del Sur ─────────────
  car({ id: 'hyundai-i30n', brand: 'Hyundai', model: 'i30 N', year: 2018, country: 'KR', class: 'compacto', tier: 2, price: 42000, color: '#3d82c4',
    body: { type: 'hatch', length: 4.34, width: 1.8, height: 1.45, wheelbase: 2.65, wheelRadius: 0.34, lights: ['slim', 'rect'], traits: ['redLip'] },
    perf: { hp: 275, kg: 1430, nm: 353, rpm: 6750, drive: 'FWD', gears: 6, top: 250 },
    engine: { layout: 'I4', cylinders: 4, turbo: true }, factory: { rims: 'cinco', rimColor: '#4a4e55', caliper: '#d01818', spoiler: 'labio' },
    desc: 'El hot hatch coreano que aprendió a manejar en Nürburgring.' }),
  car({ id: 'kia-stinger', brand: 'Kia', model: 'Stinger GT', year: 2018, country: 'KR', class: 'deportivo', tier: 2, price: 76000, color: '#b3121b',
    body: { type: 'fastback', length: 4.83, width: 1.87, height: 1.4, wheelbase: 2.91, wheelRadius: 0.35, doors: 4, lights: ['slim', 'bar'], traits: ['quadExhaust', 'hoodVents'] },
    perf: { hp: 365, kg: 1850, nm: 510, rpm: 6500, drive: 'RWD', gears: 8, top: 270 },
    engine: { layout: 'V6', cylinders: 6, turbo: true }, factory: { rims: 'cinco', finish: 'metalico' },
    desc: 'Gran turismo coreano de tracción trasera con V6 biturbo.' }),

  // ───────────── Suecia ─────────────
  car({ id: 'volvo-240', brand: 'Volvo', model: '240 Turbo', year: 1983, country: 'SE', class: 'clasico', tier: 1, price: 14000, color: '#3a4a5c',
    body: { type: 'sedan', length: 4.79, width: 1.71, height: 1.43, wheelbase: 2.64, wheelRadius: 0.31, doors: 4, lights: ['rect', 'rect'],
      prof: { ws: 0.3, rf: 0.38, rb: 0.7, rw: 0.76, nose: 0.56, hood: 0.6, deck: 0.62, tail: 0.62, roofW: 0.84, noseCurve: 1, hoodCrown: 0 } },
    perf: { hp: 155, kg: 1300, nm: 240, rpm: 6000, drive: 'RWD', gears: 5, top: 195 },
    engine: { layout: 'I4', cylinders: 4, turbo: true }, factory: { rims: 'cruz', tint: 0.1 },
    desc: 'El ladrillo sueco: indestructible, cuadrado y con turbo sorpresa.' }),
  car({ id: 'koenigsegg-agera-r', brand: 'Koenigsegg', model: 'Agera R', year: 2013, country: 'SE', class: 'hiper', tier: 5, price: 2600000, color: '#f4f4f2',
    body: { type: 'hiper', length: 4.29, width: 2.05, height: 1.12, wheelbase: 2.66, wheelRadius: 0.35, lights: ['slim', 'round2'], traits: ['sideIntakes'] },
    perf: { hp: 1140, kg: 1435, nm: 1200, rpm: 7500, drive: 'RWD', gears: 7, top: 420 },
    engine: { layout: 'V8', cylinders: 8, turbo: true, pos: 'M' }, factory: { rims: 'turbina', spoiler: 'gt', finish: 'perla' },
    desc: 'Sueco, artesanal y absurdamente rápido: 1,140 caballos con biocombustible.' }),

  // ───────────── Especiales (ocultos) ─────────────
  car({ id: 'formula-monoplaza', brand: 'Fórmula Regia', model: 'FR-26', year: 2026, country: 'MX', class: 'formula', tier: 4, price: 0, hidden: true, color: '#ff5a1f',
    body: { type: 'monoplaza', length: 5.2, width: 1.9, height: 0.95, wheelbase: 3.1, wheelRadius: 0.33, rearRadius: 0.36, lights: ['none', 'rain'] },
    perf: { hp: 620, kg: 755, nm: 500, rpm: 11000, drive: 'RWD', gears: 6, top: 330, grip: 1.45, brake: 1.8, df: 1, wf: 0.45, first: 2.9, last: 0.95 },
    engine: { layout: 'V6', cylinders: 6, turbo: true, pos: 'M' }, factory: { rims: 'carreras', rimColor: '#151515', vinyl: 'circuito', vinylColor: '#ffffff', number: 1, tint: 0 },
    desc: 'Monoplaza de la categoría Fórmula: todos iguales, gana el mejor piloto.' }),
  car({ id: 'patrulla', brand: 'Dodge', model: 'Charger Pursuit (Patrulla)', year: 2020, country: 'US', class: 'muscle', tier: 3, price: 0, hidden: true, color: '#f4f4f2',
    body: { type: 'sedan', length: 5.04, width: 1.91, height: 1.48, wheelbase: 3.05, wheelRadius: 0.36, doors: 4, lights: ['slim', 'bar'], traits: ['turret', 'pushbar'] },
    perf: { hp: 485, kg: 1950, nm: 644, rpm: 6200, drive: 'AWD', gears: 8, top: 265, grip: 1.12, brake: 1.3 },
    engine: { layout: 'V8', cylinders: 8 }, factory: { rims: 'acero', rimColor: '#151515', vinyl: 'policia', vinylColor: '#0c0d10', tint: 0.65 },
    desc: 'Patrulla de persecución: V8, tracción integral, torreta y defensa reforzada.' }),
];

export const CAR_BY_ID = Object.fromEntries(CARS.map(c => [c.id, c]));

const EMPTY = { motor: 0, turbo: 0, transmision: 0, llantas: 0, suspension: 0, frenos: 0, peso: 0, nitro: 0 };
const level = (u, k) => {
  const L = UPGRADES[k].levels;
  return L[clamp((u && u[k]) | 0, 0, L.length - 1)];
};

// PhysicsSpec final con mejoras y daño (daño 1 → −15 % potencia y torque, −5 % agarre).
export function computeSpec(carDef, upgrades = null, damage = 0) {
  const def = typeof carDef === 'string' ? CAR_BY_ID[carDef] : carDef;
  const s = { ...def.spec, gears: def.spec.gears.slice() };
  const u = { ...EMPTY, ...(upgrades || {}) };
  const m = level(u, 'motor'), t = level(u, 'turbo'), tr = level(u, 'transmision'), ll = level(u, 'llantas');
  const su = level(u, 'suspension'), fr = level(u, 'frenos'), pe = level(u, 'peso'), ni = level(u, 'nitro');
  const ev = def.engine.layout === 'EV';
  s.powerKw *= m.power * t.power;
  s.torqueNm *= m.torque * t.torque;
  if (!ev) s.redlineRpm += m.redline;
  s.shiftTime *= tr.shift;
  s.finalDrive *= tr.final;
  s.tireGrip = clamp(s.tireGrip + ll.grip + su.grip, 0.75, 1.6);
  s.cgHeight *= su.cg;
  s.steerLockDeg += su.steer;
  s.brakeG = clamp(s.brakeG + fr.brake, 0.7, 1.95);
  s.massKg *= pe.mass;
  if (def.class !== 'formula') { s.nitroCapacity += ni.capacity; s.nitroBoost += ni.boost; }
  const d = clamp(+damage || 0, 0, 1);
  s.powerKw *= 1 - 0.15 * d;
  s.torqueNm *= 1 - 0.15 * d;
  s.tireGrip *= 1 - 0.05 * d;
  s.powerKw = Math.round(s.powerKw * 10) / 10;
  s.torqueNm = Math.round(s.torqueNm);
  s.massKg = Math.round(s.massKg);
  s.finalDrive = r3(s.finalDrive); s.tireGrip = r3(s.tireGrip); s.brakeG = r3(s.brakeG); s.cgHeight = r3(s.cgHeight);
  s.shiftTime = r3(s.shiftTime); s.nitroBoost = r3(s.nitroBoost);
  s.bodyWidth = def.body.width; s.bodyLength = def.body.length;
  return s;
}

// Estimación de desempeño (para mostrar): velocidad máxima y 0–100 km/h.
export function carPerf(carDef, upgrades = null) {
  const def = typeof carDef === 'string' ? CAR_BY_ID[carDef] : carDef;
  const s = computeSpec(def, upgrades);
  const P = s.powerKw * 1000 * 0.85, m = s.massKg, g = 9.81, Frr = 0.013 * m * g;
  let lo = 5, hi = 200;
  for (let i = 0; i < 40; i++) {
    const v = (lo + hi) / 2;
    if ((0.62 * s.dragCoef * v * v + Frr) * v > P) hi = v; else lo = v;
  }
  const vGear = (s.redlineRpm / 60) * 2 * Math.PI * s.wheelRadius / (s.gears[s.gears.length - 1] * s.finalDrive);
  const topKmh = Math.min(lo, vGear) * 3.6;
  const v100 = 27.78;
  const tPow = 0.5 * m * v100 * v100 / (P * 0.62);
  const k = s.drivetrain === 'AWD' ? 1 : s.drivetrain === 'RWD' ? 0.86 : 0.72;
  const tTrac = v100 / (g * s.tireGrip * k);
  const shifts = s.gears.length > 1 ? Math.min(2, s.gears.length - 1) * s.shiftTime : 0;
  const t100 = Math.sqrt(tPow * tPow + tTrac * tTrac) + shifts;
  return { topKmh: Math.round(topKmh), t100: Math.round(t100 * 10) / 10, hp: Math.round(s.powerKw / 0.7457), kg: s.massKg, spec: s };
}

// Calificaciones 0..10 para las barras de la interfaz.
export function carStats(carDef, upgrades = null) {
  const def = typeof carDef === 'string' ? CAR_BY_ID[carDef] : carDef;
  const p = carPerf(def, upgrades), s = p.spec;
  const r1 = v => Math.round(clamp(v, 0, 10) * 10) / 10;
  const velocidad = (p.topKmh - 130) / (430 - 130) * 10;
  const aceleracion = 10 * (Math.log(16) - Math.log(p.t100)) / (Math.log(16) - Math.log(2.2));
  const manejo = (s.tireGrip - 0.85) / 0.6 * 6.5 + s.downforce * 2 + (1 - clamp((s.massKg - 800) / 1600, 0, 1)) * 1.5 + (s.cgHeight < 0.45 ? 0.5 : 0);
  const frenado = (Math.min(s.brakeG, s.tireGrip * 1.15 + s.downforce * 0.3) - 0.75) / (1.8 - 0.75) * 10;
  return { velocidad: r1(velocidad), aceleracion: r1(aceleracion), manejo: r1(manejo), frenado: r1(frenado) };
}

// Índice de desempeño 100..999 (útil para emparejar rivales y bots).
export function carPI(carDef, upgrades = null) {
  const st = carStats(carDef, upgrades);
  const avg = st.velocidad * 0.3 + st.aceleracion * 0.3 + st.manejo * 0.25 + st.frenado * 0.15;
  return Math.round(clamp(100 + avg * 90, 100, 999));
}
