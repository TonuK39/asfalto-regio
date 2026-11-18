// Modos de juego: reglas que lee js/game/race.js y textos que muestra la interfaz.
// ranking: 'position' (orden de llegada), 'score' (puntos), 'time' (menor tiempo), 'bestLap' (mejor vuelta), 'survival'.

export const MODES = [
  {
    id: 'circuito', name: 'Carrera de circuito', short: 'Circuito',
    desc: 'Vueltas al circuito: el primero en cruzar la meta gana.',
    kinds: ['circuit', 'street', 'oval'], ranking: 'position',
    laps: { def: 3, min: 1, max: 20 }, nitro: true, bots: true, prize: 9000,
  },
  {
    id: 'formula', name: 'Fórmula', short: 'Fórmula',
    desc: 'Todos con el mismo monoplaza: gana el mejor piloto, no el mejor auto.',
    kinds: ['circuit'], ranking: 'position', forcedCar: 'formula-monoplaza',
    laps: { def: 4, min: 1, max: 30 }, nitro: false, bots: true, prize: 11000,
  },
  {
    id: 'callejero', name: 'Callejero', short: 'Callejero',
    desc: 'Carrera por las calles, con nitro y tráfico. Si alcanzas a un auto por detrás, pierdes.',
    kinds: ['street'], ranking: 'position', traffic: true,
    laps: { def: 3, min: 1, max: 10 }, nitro: true, bots: true, prize: 10000,
  },
  {
    id: 'drift', name: 'Drift', short: 'Drift',
    desc: 'Derrapa con estilo: ángulo, velocidad y combos dan puntos. Pegarle al muro rompe el combo.',
    kinds: ['circuit', 'arena', 'street'], ranking: 'score',
    laps: { def: 3, min: 1, max: 10 }, nitro: false, bots: false, prize: 9000,
  },
  {
    id: 'contrarreloj', name: 'Contrarreloj', short: 'Contrarreloj',
    desc: 'Tu mejor vuelta contra el reloj y contra el fantasma de tu récord.',
    kinds: ['circuit', 'street', 'oval', 'sprint'], ranking: 'bestLap', ghost: true,
    laps: { def: 5, min: 1, max: 20 }, nitro: false, bots: false, prize: 6000,
  },
  {
    id: 'arrancones', name: 'Arrancones', short: 'Arrancones',
    desc: 'Cuarto de milla en recta: buena salida y cambios a tiempo.',
    kinds: ['drag'], ranking: 'time', laps: { def: 1, min: 1, max: 1 },
    nitro: true, bots: true, prize: 5000, suggestManual: true,
  },
  {
    id: 'touge', name: 'Touge', short: 'Touge',
    desc: 'Bajada de montaña de punta a punta, curva tras curva.',
    kinds: ['sprint'], themes: ['montana'], ranking: 'position', laps: { def: 1, min: 1, max: 1 },
    nitro: false, bots: true, prize: 9000,
  },
  {
    id: 'rally', name: 'Rally', short: 'Rally',
    desc: 'Tierra, grava y nieve contra el reloj.',
    kinds: ['sprint', 'circuit'], surfaces: ['tierra', 'nieve'], ranking: 'time',
    laps: { def: 1, min: 1, max: 5 }, nitro: false, bots: true, prize: 9000,
  },
  {
    id: 'eliminacion', name: 'Eliminación', short: 'Eliminación',
    desc: 'Al terminar cada vuelta, el último queda fuera.',
    kinds: ['circuit', 'street', 'oval'], ranking: 'position', eliminate: true,
    laps: { def: 0, min: 0, max: 0 }, // vueltas = participantes − 1
    nitro: true, bots: true, prize: 10000,
  },
  {
    id: 'resistencia', name: 'Resistencia', short: 'Resistencia',
    desc: 'Carrera larga: las llantas se gastan y la gasolina se acaba. Entra a pits para recargar.',
    kinds: ['circuit', 'oval'], ranking: 'position', wear: true,
    laps: { def: 12, min: 5, max: 60 }, nitro: false, bots: true, prize: 16000,
  },
  {
    id: 'persecucion', name: 'Persecución', short: 'Persecución',
    desc: 'Policías contra fugitivos. La patrulla atrapa si se mantiene pegada detrás; el fugitivo gana si aguanta.',
    kinds: ['street', 'circuit'], ranking: 'survival', roles: true, timeLimitS: 180,
    laps: { def: 0, min: 0, max: 0 }, nitro: true, bots: true, prize: 10000,
  },
  {
    id: 'ovalo', name: 'Óvalo', short: 'Óvalo',
    desc: 'Pegado al de adelante vas más rápido (rebufo). Pura estrategia.',
    kinds: ['oval'], ranking: 'position', slipstream: 2.2,
    laps: { def: 8, min: 2, max: 50 }, nitro: false, bots: true, prize: 9000,
  },
  {
    id: 'gymkhana', name: 'Gymkhana', short: 'Gymkhana',
    desc: 'Dos minutos para sumar puntos: derrapes, donas alrededor de postes y puertas. Tirar conos resta.',
    kinds: ['arena'], ranking: 'score', timeLimitS: 120,
    laps: { def: 0, min: 0, max: 0 }, nitro: true, bots: false, prize: 8000,
  },
  {
    id: 'libre', name: 'Libre', short: 'Libre',
    desc: 'Maneja sin reglas para conocer la pista y probar el auto.',
    kinds: ['circuit', 'street', 'sprint', 'drag', 'oval', 'arena'], ranking: 'none',
    laps: { def: 0, min: 0, max: 0 }, nitro: true, bots: false, prize: 0,
  },
];

export const MODE_BY_ID = Object.fromEntries(MODES.map(m => [m.id, m]));

// ¿Se puede jugar este modo en esta pista?
export function modeFitsTrack(mode, track) {
  if (!mode || !track) return false;
  if (track.modes && track.modes.length) return track.modes.includes(mode.id);
  if (!mode.kinds.includes(track.kind)) return false;
  if (mode.themes && !mode.themes.includes(track.theme)) return false;
  if (mode.surfaces && !mode.surfaces.includes(track.surface)) return false;
  return true;
}

export const TIMES = [
  { id: 'day', name: 'Día' },
  { id: 'sunset', name: 'Atardecer' },
  { id: 'night', name: 'Noche' },
];
export const WEATHERS = [
  { id: 'clear', name: 'Despejado' },
  { id: 'rain', name: 'Lluvia' },
  { id: 'fog', name: 'Niebla' },
  { id: 'snow', name: 'Nieve' },
];

// Dinero al terminar: premio del modo repartido por posición, más puntos convertidos y bono por carrera limpia.
export function prizeFor(mode, pos, total, { score = 0, clean = false, dnf = false } = {}) {
  if (!mode || !mode.prize) return 0;
  if (dnf) return Math.round(mode.prize * 0.1);
  const n = Math.max(1, total);
  const share = n === 1 ? 0.6 : [1, 0.62, 0.42, 0.3, 0.22, 0.16, 0.12, 0.1][pos - 1] ?? 0.08;
  const crowd = 0.75 + Math.min(n, 8) * 0.0625;   // más rivales, más premio
  return Math.round(mode.prize * share * crowd + Math.max(0, score) * 0.5 + (clean ? mode.prize * 0.1 : 0));
}
