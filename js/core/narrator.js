// Narrador con speechSynthesis: voz es-MX (luego es-US, luego cualquier es-*), prefiere voces «Natural»/«Online».
// Varias frases por evento, enfriamiento por evento, cola corta; los eventos importantes interrumpen a los menores.
// Si el navegador no tiene voces en español, se queda callado sin errores.
import { audio } from './audio.js';

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
const RATE = 1.1;

// {name} nombre · {lugar} «tercer lugar» · {puesto} «tercero» · {position} número · {value} valor · {tiempo} tiempo hablado
const PHRASES = {
  bienvenida: ['¡Bienvenido a Asfalto Regio!', '¡Qué onda, {name}! Bienvenido a Asfalto Regio.', '¡Arranca motores, {name}, que aquí se corre en serio!', 'Asfalto Regio. ¡Prepárate para quemar llanta!', '¡Bienvenido de vuelta, {name}! La pista te espera.'],
  cuenta3: ['¡Tres!', 'Tres…', '¡Tres!'],
  cuenta2: ['¡Dos!', 'Dos…', '¡Dos!'],
  cuenta1: ['¡Uno!', 'Uno…', '¡Uno!'],
  arranque: ['¡Arrancan!', '¡Fuera!', '¡Ya, a fondo!', '¡Vámonos!', '¡Arrancaaan!'],
  ultimaVuelta: ['¡Última vuelta!', '¡Última vuelta, a darlo todo!', '¡Campana! Última vuelta.', '¡Es la última, no aflojes!'],
  nuevoLider: ['¡{name} toma la punta!', '¡Hay nuevo líder: {name}!', '¡{name} se adueña del primer lugar!', '¡Cambio de líder! Ahora manda {name}.', '¡Cambio de líder!'],
  subePosicion: ['¡Subes al {lugar}!', '¡Bien rebasado! Vas {puesto}.', '¡Ándale! Ya vas en {lugar}.', '¡Uno menos! Ahora eres {puesto}.', '¡Bien rebasado!'],
  bajaPosicion: ['Bajas al {lugar}, ¡no aflojes!', 'Te rebasaron, vas {puesto}.', '¡Aguas! Perdiste un lugar.', 'Caes al {lugar}, ¡échale ganas!'],
  ganador: ['¡{name} gana la carrera!', '¡Victoria para {name}!', '¡Y el ganador es… {name}!', '¡{name} se lleva la bandera a cuadros!', '¡Qué carrerón! Gana {name}.', '¡Tenemos ganador!'],
  podio: ['¡{name} termina en el podio, {lugar}!', '¡Al podio! {name} queda {puesto}.', '¡{name} sube al podio!', '¡Buen resultado: {name} en {lugar}!', '¡Directo al podio!'],
  meta: ['¡Cruzas la meta en {lugar}!', '¡Bandera a cuadros! Terminas {puesto}.', '¡Meta! Quedas en {lugar}.', '¡Cruzas la meta!', '¡Bandera a cuadros!'],
  mejorVuelta: ['¡Vuelta rápida! {tiempo}.', '¡Mejor vuelta: {tiempo}!', '¡Qué chulada de vuelta! {tiempo}.', '¡Vuelta rápida!', '¡Nuevo récord de vuelta!'],
  combo: ['¡Combo de {value}!', '¡Qué derrape! Llevas {value} puntos.', '¡Está que arde! Combo por {value}.', '¡Sigue de lado, no lo sueltes!', '¡Qué nivel de derrape!'],
  alcance: ['¡Aguas! No lo puedes atravesar por detrás.', '¡Ese alcance te costó puntos!', '¡Rebasa por un lado!', '¡Cuidado con la defensa!'],
  eliminado: ['¡{name} queda eliminado!', '¡Fuera! {name} se despide.', '¡Eliminado: {name}!', '¡Adiós, {name}!', '¡Uno menos en la pista!'],
  atrapado: ['¡Atrapado! La patrulla detuvo a {name}.', '¡{name} fue atrapado!', '¡Se acabó la fuga para {name}!', '¡Lo agarraron!', '¡Atrapado!'],
  escapo: ['¡{name} se escapó!', '¡Se les fue {name}!', '¡{name} logró la fuga!', '¡Ni lo vieron, se escapó!', '¡Fuga exitosa!'],
  sentidoContrario: ['¡Vas en sentido contrario!', '¡Date la vuelta!', '¡Al revés no, compadre!', '¡Sentido contrario, da la vuelta!'],
  pits: ['Entrando a pits.', '¡Parada en pits, rápido!', 'Pits: llantas y gasolina.', '¡El equipo te espera en pits!'],
  gasolina: ['Te queda poca gasolina.', '¡Ojo con la gasolina! Entra a pits.', '¡Vas en reserva! Pasa a cargar.', 'Gasolina baja, considera entrar a pits.'],
};
// 3 = interrumpe todo · 2 = interrumpe menores · 1 y 0 = a la cola
const PRIORITY = {
  cuenta3: 3, cuenta2: 3, cuenta1: 3, arranque: 3, ganador: 3,
  meta: 2, ultimaVuelta: 2, eliminado: 2, atrapado: 2, escapo: 2, podio: 2, bienvenida: 1,
  nuevoLider: 1, mejorVuelta: 1, sentidoContrario: 1, gasolina: 1, pits: 1,
  subePosicion: 0, bajaPosicion: 0, combo: 0, alcance: 0,
};
const COOLDOWN = { // segundos
  subePosicion: 4, bajaPosicion: 5, combo: 4, alcance: 6, sentidoContrario: 7, gasolina: 25, pits: 8,
  nuevoLider: 5, mejorVuelta: 6, ultimaVuelta: 10, bienvenida: 20, podio: 3, meta: 3, eliminado: 1.5, atrapado: 1.5, escapo: 1.5,
};
const QUEUE_MAX = 2, STALE_MS = 3500;

const ORD = ['', 'primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];
const ORD_SOLO = ['', 'primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];
function spokenTime(v) {
  if (typeof v === 'string') return v;
  if (typeof v !== 'number' || !isFinite(v)) return null;
  const ms = Math.max(0, v), m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
  const sec = s.toFixed(1).replace(/\.0$/, '');
  return m > 0 ? `${m === 1 ? 'un minuto' : m + ' minutos'} ${sec} segundos` : `${sec} segundos`;
}
function fill(tpl, p) {
  const pos = p.position | 0;
  const map = {
    name: p.name ? String(p.name).slice(0, 24) : null,
    lugar: pos >= 1 && pos <= 10 ? ORD[pos] + ' lugar' : pos > 10 ? 'lugar ' + pos : null,
    puesto: pos >= 1 && pos <= 10 ? ORD_SOLO[pos] : pos > 10 ? 'en el lugar ' + pos : null,
    position: pos ? String(pos) : null,
    value: p.value != null && p.value !== '' ? (typeof p.value === 'number' ? String(Math.round(p.value)) : String(p.value)) : null,
    tiempo: p.value != null ? spokenTime(p.value) : null,
  };
  let ok = true;
  const txt = tpl.replace(/\{(\w+)\}/g, (_, k) => { const v = map[k]; if (v == null) ok = false; return v ?? ''; });
  return ok ? txt : null;
}

let voice = null, voicesTried = false;
function pickVoice() {
  if (!synth) return null;
  const vs = synth.getVoices() || [];
  let best = null, bs = -1;
  for (const v of vs) {
    const lang = String(v.lang || '').toLowerCase().replace('_', '-');
    if (!lang.startsWith('es')) continue;
    let s = lang === 'es-mx' ? 300 : lang === 'es-us' ? 200 : 100 + (lang === 'es-419' ? 20 : 0);
    const n = String(v.name || '').toLowerCase();
    if (n.includes('natural')) s += 60;
    if (n.includes('online')) s += 40;
    if (n.includes('google')) s += 10;
    if (s > bs) { bs = s; best = v; }
  }
  voicesTried = vs.length > 0;
  return best;
}
if (synth) {
  voice = pickVoice();
  try { synth.addEventListener('voiceschanged', () => { voice = pickVoice(); }); } catch { synth.onvoiceschanged = () => { voice = pickVoice(); }; }
}

let enabled = true;
let speaking = null; // { u, pri, ev, t }
const queue = [];
const lastAt = {}, lastIdx = {};

function chooseText(event, params) {
  const list = PHRASES[event];
  if (!list) return null;
  const options = [];
  list.forEach((tpl, i) => { const t = fill(tpl, params); if (t) options.push({ t, i }); });
  if (!options.length) return null;
  // evitar repetir la misma frase dos veces seguidas
  let pool = options.length > 1 ? options.filter(o => o.i !== lastIdx[event]) : options;
  // si hay frases con parámetros completos, preferirlas un poco
  const withParams = pool.filter(o => /\{/.test(list[o.i]));
  if (withParams.length && Math.random() < 0.7) pool = withParams;
  const o = pool[Math.floor(Math.random() * pool.length)];
  lastIdx[event] = o.i;
  return o.t;
}

function speakNow(item) {
  if (!synth || !voice) return;
  const u = new SpeechSynthesisUtterance(item.text);
  u.voice = voice; u.lang = voice.lang; u.rate = RATE; u.pitch = 1;
  u.volume = audio.voiceVolume();
  const cur = { u, pri: item.pri, ev: item.ev, t: performance.now() };
  speaking = cur; // referencia viva (Chrome pierde onend si la utterance se recolecta)
  const done = () => {
    if (speaking !== cur) return;
    speaking = null;
    audio.duckMusic(1);
    setTimeout(next, 60);
  };
  u.onend = done; u.onerror = done;
  u.onstart = () => audio.duckMusic(0.55);
  try { synth.speak(u); } catch { speaking = null; }
}
function next() {
  if (speaking || !enabled) return;
  const now = performance.now();
  while (queue.length) {
    const it = queue.shift();
    if (now - it.at < STALE_MS) { speakNow(it); return; }
  }
}
function cancelAll() {
  queue.length = 0;
  speaking = null;
  if (synth) { try { synth.cancel(); } catch { /* nada */ } }
  audio.duckMusic(1);
}
// Vigilante: si el motor de voz se trabó, liberar.
if (synth) setInterval(() => { if (speaking && performance.now() - speaking.t > 9000) { cancelAll(); } }, 2000);

export const narrator = {
  get enabled() { return enabled; },
  set enabled(v) { enabled = !!v; if (!enabled) cancelAll(); },

  // event: ver PHRASES. params: { name, position, value }. → true si habló o quedó en cola.
  say(event, params = {}) {
    if (!enabled || !synth) return false;
    if (!voice) { voice = pickVoice(); if (!voice) return false; }
    const now = performance.now();
    const cd = (COOLDOWN[event] ?? 1.2) * 1000;
    if (lastAt[event] && now - lastAt[event] < cd) return false;
    const text = chooseText(event, params || {});
    if (!text) return false;
    lastAt[event] = now;
    const pri = PRIORITY[event] ?? 0;
    const item = { text, pri, ev: event, at: now };
    if (pri >= 3) { cancelAll(); speakNow(item); return true; }
    if (speaking || synth.speaking || synth.pending) {
      if (speaking && pri >= 2 && speaking.pri < pri) { cancelAll(); speakNow(item); return true; }
      // cola corta: si está llena, se queda lo más importante
      queue.push(item);
      queue.sort((a, b) => b.pri - a.pri || a.at - b.at);
      while (queue.length > QUEUE_MAX) queue.pop();
      if (!speaking) setTimeout(next, 80);
      return queue.includes(item);
    }
    speakNow(item);
    return true;
  },
  cancel() { cancelAll(); },

  // Extras para pruebas/ajustes
  get voiceName() { return voice ? `${voice.name} (${voice.lang})` : (voicesTried ? 'sin voz en español' : 'cargando voces…'); },
  events: Object.keys(PHRASES),
};
