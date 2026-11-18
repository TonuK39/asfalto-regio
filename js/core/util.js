// Utilidades compartidas por todos los módulos.

// Generador pseudoaleatorio con semilla (mulberry32). rng('texto') o rng(123) → función que da 0..1.
export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// 83456 ms → "1:23.456"
export function fmtTime(ms, withMs = true) {
  if (ms == null || !isFinite(ms)) return '--:--' + (withMs ? '.---' : '');
  const neg = ms < 0; ms = Math.abs(ms);
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), r = Math.floor(ms % 1000);
  return (neg ? '-' : '') + m + ':' + String(s).padStart(2, '0') + (withMs ? '.' + String(r).padStart(3, '0') : '');
}

// 1234567 → "$1,234,567"
export const fmtMoney = n => '$' + Math.round(n).toLocaleString('es-MX');

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
