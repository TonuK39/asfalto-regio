// Asfalto Regio — arranque y flujo del juego: menús, práctica, salas en línea, carreras y resultados.
import { save } from './core/save.js';
import { MODES, MODE_BY_ID, modeFitsTrack } from './data/modes.js';
import { MAX_PLAYERS } from './config.js';
import { rng, uid, clamp } from './core/util.js';

const bootMsg = t => { const el = document.querySelector('#boot .boot-msg'); if (el) el.textContent = t; };
const bootError = e => {
  const el = document.querySelector('#boot .boot-msg');
  if (el) { el.className = 'boot-err'; el.textContent = 'No se pudo iniciar el juego:\n' + (e && (e.stack || e.message) || e); }
  console.error(e);
};

const BOT_NAMES = ['El Chato', 'La Güera', 'Toño Turbo', 'Doña Lupe', 'El Pirata', 'Neto Nitro', 'Memo Derrape', 'Paty Pistón',
  'Rafa Rebufo', 'Chuy Chasis', 'Lalo Llanta', 'Male Marcha', 'Beto Bujía', 'Cuca Curva', 'Pancho Piano', 'Sofi Slick'];

let M = {}; // módulos cargados
let world, ui, input;
let screen = 'menu';
let room = null, roomState = null, lobbyAd = null, wasHost = false;
let session = null, sessionCfg = null;
let loadedSet = new Set(), loadTimer = null, raceId = null, resultsShown = false;

boot().catch(bootError);

async function boot() {
  bootMsg('Cargando motor 3D…');
  const [three, cars, parts, tracks, carmodel, audioM, musicM, narr, inputM, uiM, worldM, net] = await Promise.all([
    import('three'),
    import('./data/cars.js'), import('./data/parts.js'), import('./data/tracks.js'), import('./game/carmodel.js'),
    import('./core/audio.js'), import('./core/music.js'), import('./core/narrator.js'), import('./core/input.js'),
    import('./ui/ui.js'), import('./game/world.js'), import('./net/net.js'),
  ]);
  M = { three, cars, parts, tracks, carmodel, audio: audioM.audio, music: musicM.music, narrator: narr.narrator, net, worldM };
  bootMsg('Preparando el garaje…');

  input = new inputM.Input(window);
  world = new worldM.World(document.getElementById('game'), save.data.settings);
  world.onError = e => ui && ui.toast('Error: ' + (e.message || e));
  ui = new uiM.UI(document.getElementById('ui'), {
    save, CARS: cars.CARS, CAR_BY_ID: cars.CAR_BY_ID, COUNTRIES: cars.COUNTRIES, UPGRADES: parts.UPGRADES,
    CUSTOM_OPTIONS: parts.CUSTOM_OPTIONS, defaultCustom: parts.defaultCustom, upgradePrice: parts.upgradePrice,
    computeSpec: cars.computeSpec, carStats: cars.carStats, TRACKS: tracks.TRACKS, TRACK_BY_ID: tracks.TRACK_BY_ID,
    trackOutline: tracks.trackOutline, MODES, MODE_BY_ID, modeFitsTrack, buildCarModel: carmodel.buildCarModel,
    audio: M.audio, music: M.music, input, quality: save.data.settings.graphics,
  });
  applyAudioSettings(save.data.settings);

  // El audio del navegador solo arranca con un gesto del usuario.
  const unlock = () => {
    M.audio.unlock();
    if (screen !== 'race') M.music.play('menu');
    removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock);
  };
  addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  addEventListener('beforeunload', () => { if (room) room.leave(); if (lobbyAd) lobbyAd.stop(); });
  save.onChange(() => { if (screen === 'menu' || screen === 'garage') world.showShowroom(save.currentCar()); });

  if (new URLSearchParams(location.search).has('debug')) window.ar = { save, world, ui, input, M, practice: startPractice, createRoom, joinRoom, startOnlineRace, get session() { return session; }, get room() { return room; } };

  document.getElementById('boot').classList.add('hide');
  setTimeout(() => document.getElementById('boot').remove(), 600);
  goMenu();

  // Unirse directo con ?sala=CODIGO
  const code = M.net.cleanCode(new URLSearchParams(location.search).get('sala'));
  if (code.length === 5) joinRoom(code);
}

function applyAudioSettings(s) {
  M.audio.setVolumes({ master: s.masterVol, music: s.musicVol, sfx: s.sfxVol, engine: s.engineVol, voice: s.voiceVol });
  M.narrator.enabled = !!s.narrator;
}
function onSettingsChange(s) {
  world.applySettings(s);
  applyAudioSettings(s);
  if (session && session.local && session.local.physics) session.local.physics.gearbox = s.gearbox;
}

// ============================================================================================
// Menús
function goMenu() {
  screen = 'menu';
  world.showShowroom(save.currentCar());
  if (M.music && M.audio.ctx && M.audio.ctx.state === 'running') M.music.play('menu');
  ui.showMain({
    onOnline: goLobby,
    onPractice: goPractice,
    onGarage: () => { screen = 'garage'; ui.showGarage({ onBack: goMenu }); },
    onDealer: () => { screen = 'garage'; ui.showDealer({ onBack: goMenu }); },
    onRecords: () => ui.showRecords({ onBack: goMenu, fetch: (t, m) => M.net.fetchRecords(t, m) }),
    onSettings: () => ui.showSettings({ onBack: goMenu, onChange: onSettingsChange }),
    onSaveCode: () => ui.showSaveCode({ onBack: goMenu }),
  });
}

function goPractice() {
  screen = 'menu';
  ui.showPractice({
    onBack: goMenu,
    onStart: s => startPractice(s),
  });
}

// ============================================================================================
// Práctica (sin red)
async function startPractice(s) {
  const mode = MODE_BY_ID[s.modeId];
  const trackDef = M.tracks.TRACK_BY_ID[s.trackId];
  if (!mode || !trackDef) return ui.toast('Elige una pista y un modo.');
  const me = myInfo();
  const participants = [{ ...me, role: mode.roles ? 'fugitivo' : null, color: M.worldM.PLAYER_COLORS[0] }];
  const nBots = mode.bots ? clamp(s.bots ?? 3, 0, MAX_PLAYERS - 1) : 0;
  const bots = makeBots(nBots, me.carId, 'p' + Date.now());
  bots.forEach((b, i) => participants.push({ ...b, color: M.worldM.PLAYER_COLORS[(i + 1) % 8], role: mode.roles ? 'policia' : null }));
  const seed = 'practica-' + Date.now();
  await runRace({ trackDef, mode, settings: s, seed, participants, isHost: true, net: null });
  session.beginCountdown(performance.now() + 3500);
}

function myInfo() {
  const c = save.currentCar();
  return { id: save.data.playerId, name: save.data.playerName, carId: c.carId, custom: c.custom, upgrades: c.upgrades, isBot: false };
}

function makeBots(n, refCarId, seed) {
  const r = rng(seed);
  const { CARS, CAR_BY_ID } = M.cars;
  const ref = CAR_BY_ID[refCarId] || CARS[0];
  const pool = CARS.filter(c => !c.hidden && Math.abs((c.tier || 1) - (ref.tier || 1)) <= 1);
  const names = [...BOT_NAMES].sort(() => r() - 0.5);
  const out = [];
  for (let i = 0; i < n; i++) {
    const def = pool[Math.floor(r() * pool.length)] || ref;
    const custom = { ...M.parts.defaultCustom(def), paint: ['#e63946', '#1d3557', '#f1c40f', '#2ecc71', '#9b59b6', '#ecf0f1', '#ff7f11', '#00b4d8'][Math.floor(r() * 8)] };
    const lvl = Math.max(0, (ref.tier || 1) - 1);
    out.push({ id: 'bot-' + uid(), name: names[i % names.length], carId: def.id, custom, upgrades: { motor: lvl, llantas: lvl, frenos: lvl }, isBot: true });
  }
  return out;
}

// ============================================================================================
// Carrera (práctica o en línea)
async function runRace({ trackDef, mode, settings, seed, participants, isHost, net }) {
  screen = 'race';
  resultsShown = false;
  ui.hideAll();
  ui.showLoading('Cargando ' + trackDef.name + '…', 0);
  world.hideShowroom();
  sessionCfg = {
    trackDef, mode, settings, seed, participants, isHost, net, input, save,
    localId: save.data.playerId,
    hooks: {
      ui,
      onPause: () => openPause(),
      onCamera: cam => save.setSettings({ camera: cam }),
      onRaceOver: results => raceOver(results),
    },
  };
  input.enabled = true;
  session = await world.startSession(sessionCfg);
  ui.hideAll();
  ui.hud.show();
  if (trackDef.minimap !== false) ui.hud.minimap(session.track.minimap);
  return session;
}

function openPause() {
  if (!session) return;
  session.setPaused(true);
  input.enabled = false;
  world.rig.mirror = false;
  const resume = () => { ui.hideAll(); ui.hud.show(); input.enabled = true; world.rig.mirror = !!save.data.settings.mirror; session && session.setPaused(false); };
  ui.showPause({
    onResume: resume,
    onRestart: sessionCfg.net ? null : () => restartPractice(),
    onSettings: () => ui.showSettings({ onBack: () => openPause(), onChange: onSettingsChange }),
    onQuit: () => quitRace(),
  });
}

async function restartPractice() {
  const c = sessionCfg;
  world.endSession();
  session = null;
  await runRace({ trackDef: c.trackDef, mode: c.mode, settings: c.settings, seed: c.seed, participants: c.participants, isHost: true, net: null });
  session.beginCountdown(performance.now() + 3500);
}

function quitRace() {
  const online = sessionCfg && sessionCfg.net;
  if (online && room) {
    if (room.isHost) {
      // el anfitrión se sale: la carrera termina para todos con lo que llevaban
      const results = session.race.buildResults();
      room.send('results', { raceId, results });
      endRaceToRoom();
      roomState.phase = 'lobby';
      pushRoom();
    } else {
      room.send('event', { k: 'quit', id: save.data.playerId });
      endRaceToRoom();
    }
    return;
  }
  world.endSession();
  session = null;
  ui.hud.hide();
  goMenu();
}

function raceOver(results) {
  if (sessionCfg.net) {
    if (!room || !room.isHost) return;
    room.send('results', { raceId, results });
    roomState.phase = 'lobby';
    pushRoom();
  }
  showResults(results);
}

function showResults(results) {
  if (resultsShown || !session) return;
  resultsShown = true;
  const race = session.race;
  race.end(results);
  const earned = race.localPrize(results);
  const me = results.find(r => r.id === save.data.playerId);
  if (earned > 0) save.addMoney(earned);
  // estadísticas y récords
  const st = save.data.stats;
  st.races++;
  if (me && me.pos === 1 && results.length > 1) st.wins++;
  if (me && me.pos <= 3 && results.length > 1) st.podiums++;
  if (me && me.score > st.bestDrift && race.mode.id === 'drift') st.bestDrift = me.score;
  const local = race.local;
  if (local) st.distanceKm += Math.max(0, local.prog.total) / 1000;
  if (local && race.mode.roles) { st.busts += local.prog.busts || 0; if (local.prog.role === 'fugitivo' && !local.prog.busted) st.escapes++; }
  save.persist();
  const rec = race.localRecord();
  let newRecord = false;
  if (rec && local) {
    const isNew = newRecord = save.setRecord(sessionCfg.trackDef.id, race.mode.id, rec.ms, local.carDef.id);
    if (isNew) {
      ui.toast('¡Nuevo récord personal!');
      M.net.submitRecord({ track_id: sessionCfg.trackDef.id, mode_id: race.mode.id, player_name: save.data.playerName, car_id: local.carDef.id, ms: Math.round(rec.ms) }).catch(() => {});
    }
  }
  M.music.play('resultados');
  world.rig.mirror = false;
  input.enabled = false;
  ui.hud.hide();
  const carName = r => r.car;
  ui.showResults({
    rows: results.map(r => ({ pos: r.pos, name: r.name, car: carName(r), time: r.time, best: r.best, score: r.score, money: r.id === save.data.playerId ? earned : null, isLocal: r.id === save.data.playerId, dnf: r.dnf, role: r.role, busted: r.busted })),
    earned, mode: race.mode, track: sessionCfg.trackDef.name, newRecord,
  }, {
    onContinue: () => {
      if (sessionCfg.net && room) endRaceToRoom();
      else { world.endSession(); session = null; goMenu(); }
    },
  });
}

// ============================================================================================
// En línea: vestíbulo y salas
function goLobby() {
  screen = 'lobby';
  ui.showLobby({
    listRooms: () => M.net.findPublicRooms(),
    onCreate: ({ name, isPublic }) => createRoom(name, isPublic),
    onJoinCode: code => joinRoom(M.net.cleanCode(code)),
    onJoin: code => joinRoom(M.net.cleanCode(code)),
    onBack: goMenu,
  });
}

function presenceMeta(ready = false) {
  const c = save.currentCar();
  return { carId: c.carId, custom: c.custom, upgrades: c.upgrades, ready };
}

async function createRoom(name, isPublic) {
  const code = M.net.newCode();
  const firstTrack = M.tracks.TRACKS[0];
  roomState = {
    name: String(name || `Sala de ${save.data.playerName}`).slice(0, 28), isPublic: !!isPublic, phase: 'lobby',
    settings: { trackId: firstTrack.id, modeId: firstFit(firstTrack).id, laps: firstFit(firstTrack).laps.def, timeOfDay: firstTrack.defaultTime || 'day', weather: 'clear' },
    bots: [], chat: [], raceId: null,
  };
  await enterRoom(code);
}
function firstFit(track) { return MODES.find(m => modeFitsTrack(m, track) && m.id !== 'libre') || MODE_BY_ID.libre; }

async function joinRoom(code) {
  if (!code || code.length !== 5) return ui.toast('El código tiene 5 caracteres.');
  roomState = null;
  await enterRoom(code);
}

async function enterRoom(code) {
  if (room) await leaveRoom(true);
  ui.showLoading('Entrando a la sala ' + code + '…', 0.3);
  const me = { id: save.data.playerId, name: save.data.playerName };
  room = new M.net.Room(code, me, presenceMeta(false), {
    onMembers: onMembers,
    onMessage: onRoomMessage,
    onFast: (d, from) => { if (session && session.ready) session.onFast(d, from); },
    onStatus: s => { if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') ui.toast('Conexión inestable…'); },
    onPeers: () => refreshRoom(),
  });
  try {
    await room.connect();
  } catch (e) {
    room = null;
    ui.toast('No se pudo conectar a la sala. Revisa tu internet.');
    return goLobby();
  }
  screen = 'room';
  wasHost = false;
  // Espera un momento a la presencia para saber quién es el anfitrión.
  await new Promise(r => setTimeout(r, 700));
  if (!room) return;
  if (!roomState && !room.isHost) room.send('event', { k: 'hello' });
  if (room.members.filter(m => !m.id.startsWith('bot')).length > MAX_PLAYERS) {
    ui.toast('La sala está llena.');
    return leaveRoom();
  }
  showRoomScreen();
  room.syncClock();
}

async function leaveRoom(silent = false) {
  if (lobbyAd) { lobbyAd.stop(); lobbyAd = null; }
  if (session) { world.endSession(); session = null; ui.hud.hide(); }
  if (room) { const r = room; room = null; await r.leave(); }
  roomState = null;
  if (!silent) goLobby();
}

function onMembers(list) {
  if (!room) return;
  if (room.isHost && !wasHost) {
    wasHost = true;
    if (!roomState) {
      // heredé la sala sin estado: arranca uno nuevo
      const t = M.tracks.TRACKS[0];
      roomState = { name: 'Sala ' + room.code, isPublic: true, phase: 'lobby', settings: { trackId: t.id, modeId: firstFit(t).id, laps: firstFit(t).laps.def, timeOfDay: t.defaultTime || 'day', weather: 'clear' }, bots: [], chat: [], raceId: null };
    }
    if (session && session.ready) session.adoptBots();
    if (roomState.phase === 'racing' && !session) roomState.phase = 'lobby';
    ui.toast('Ahora eres el anfitrión.');
  }
  if (room.isHost) {
    // mantener el cupo: quitar bots si no caben
    const humans = list.length;
    while (roomState.bots.length && humans + roomState.bots.length > MAX_PLAYERS) roomState.bots.pop();
    pushRoom();
  }
  // jugadores que se fueron a media carrera
  if (session && session.ready) {
    const ids = new Set(list.map(m => m.id));
    for (const e of [...session.entities]) if (!e.isBot && e.kind === 'remote' && !ids.has(e.id)) session.removePlayer(e.id);
  }
  refreshRoom();
}

function onRoomMessage(ev, p, from) {
  if (!room) return;
  switch (ev) {
    case 'room':
      if (from !== room.hostId) return;
      roomState = p.state;
      refreshRoom();
      break;
    case 'chat':
      if (roomState) { roomState.chat.push({ name: p.name, text: String(p.text).slice(0, 140) }); roomState.chat = roomState.chat.slice(-40); }
      refreshRoom();
      break;
    case 'event':
      if (p.k === 'hello' && room.isHost) pushRoom();
      if (p.k === 'quit' && session) session.removePlayer(p.id);
      break;
    case 'load':
      if (from !== room.hostId) return;
      loadOnlineRace(p);
      break;
    case 'loaded':
      if (room.isHost && p.raceId === raceId) { loadedSet.add(from); maybeGo(); }
      break;
    case 'go':
      if (from !== room.hostId || p.raceId !== raceId || !session) return;
      session.beginCountdown(performance.now() + (p.startAt - room.hostNow()));
      break;
    case 'results':
      if (p.raceId === raceId && session) showResults(p.results);
      break;
    case 'fin': case 'elim': case 'bust':
      if (session && session.ready) session.onMessage(ev, p);
      break;
  }
}

// --- anfitrión ---
function pushRoom() {
  if (!room || !room.isHost || !roomState) return;
  room.send('room', { state: roomState });
  if (roomState.isPublic) {
    if (!lobbyAd) lobbyAd = new M.net.LobbyAd();
    const t = M.tracks.TRACK_BY_ID[roomState.settings.trackId];
    lobbyAd.set({ code: room.code, name: roomState.name, host: save.data.playerName, players: room.members.length + roomState.bots.length, track: t ? t.name : '', mode: (MODE_BY_ID[roomState.settings.modeId] || {}).name || '', status: roomState.phase === 'racing' ? 'En carrera' : 'En sala' });
  } else if (lobbyAd) { lobbyAd.stop(); lobbyAd = null; }
  refreshRoom();
}
setInterval(() => { if (room && room.isHost && roomState && screen === 'room') pushRoom(); }, 5000);

function changeSettings(partial) {
  if (!room || !room.isHost || !roomState) return;
  const s = { ...roomState.settings, ...partial };
  const track = M.tracks.TRACK_BY_ID[s.trackId];
  let mode = MODE_BY_ID[s.modeId];
  if (!modeFitsTrack(mode, track)) { mode = firstFit(track); s.modeId = mode.id; }
  if (partial.trackId && track.defaultTime && !partial.timeOfDay) s.timeOfDay = track.defaultTime;
  if (partial.modeId || partial.trackId) s.laps = mode.laps.def;
  s.laps = mode.laps.max ? clamp(s.laps, mode.laps.min, mode.laps.max) : 0;
  roomState.settings = s;
  if (!mode.bots) roomState.bots = [];
  pushRoom();
}

function addBot() {
  if (!room || !room.isHost) return;
  const mode = MODE_BY_ID[roomState.settings.modeId];
  if (!mode.bots) return ui.toast('Este modo no lleva bots.');
  if (room.members.length + roomState.bots.length >= MAX_PLAYERS) return ui.toast('La sala está llena.');
  const [b] = makeBots(1, save.currentCar().carId, 'b' + Date.now());
  const used = new Set(roomState.bots.map(x => x.name));
  b.name = BOT_NAMES.find(n => !used.has(n)) || b.name;
  roomState.bots.push(b);
  pushRoom();
}
function removeBot(id) {
  if (!room || !room.isHost) return;
  roomState.bots = roomState.bots.filter(b => b.id !== id);
  pushRoom();
}

function startOnlineRace() {
  if (!room || !room.isHost || !roomState || roomState.phase === 'racing') return;
  const s = roomState.settings;
  const mode = MODE_BY_ID[s.modeId];
  const seed = room.code + '-' + Date.now();
  const r = rng(seed);
  const people = room.members.map(m => ({ id: m.id, name: m.name, carId: m.carId, custom: m.custom, upgrades: m.upgrades, isBot: false }));
  const bots = mode.bots ? roomState.bots.map(b => ({ ...b })) : [];
  const participants = [...people, ...bots].map((p, i) => ({ ...p, color: M.worldM.PLAYER_COLORS[i % 8] }));
  if (mode.roles) {
    const n = participants.length;
    const cops = Math.max(1, Math.round(n / 3));
    const order = participants.map((p, i) => ({ i, k: (p.isBot ? 0 : 1) + r() })); // los bots primero como patrullas
    order.sort((a, b) => a.k - b.k);
    participants.forEach(p => { p.role = 'fugitivo'; });
    for (let j = 0; j < cops && j < n - 1; j++) participants[order[j].i].role = 'policia';
    if (n === 1) participants[0].role = 'fugitivo';
  }
  raceId = seed;
  roomState.phase = 'racing';
  roomState.raceId = raceId;
  pushRoom();
  const payload = { raceId, seed, settings: s, participants };
  room.send('load', payload);
  loadOnlineRace(payload);
}

async function loadOnlineRace(p) {
  raceId = p.raceId;
  loadedSet = new Set();
  const trackDef = M.tracks.TRACK_BY_ID[p.settings.trackId];
  const mode = MODE_BY_ID[p.settings.modeId];
  if (!p.participants.some(x => x.id === save.data.playerId)) {
    ui.toast('Hay una carrera en curso; entras en la siguiente.');
    return;
  }
  try {
    await runRace({ trackDef, mode, settings: p.settings, seed: p.seed, participants: p.participants, isHost: room.isHost, net: room });
  } catch (e) {
    console.error(e);
    ui.toast('No se pudo cargar la carrera.');
    return;
  }
  await room.syncClock(4);
  if (room.isHost) {
    loadedSet.add(save.data.playerId);
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => go(true), 25000);
    maybeGo();
  } else room.send('loaded', { raceId });
}

function maybeGo() {
  if (!room || !room.isHost || !session) return;
  const humans = sessionCfg.participants.filter(p => !p.isBot).map(p => p.id);
  if (humans.every(id => loadedSet.has(id) || !room.members.some(m => m.id === id))) go(false);
}
function go() {
  clearTimeout(loadTimer);
  if (!room || !session || session.race.started) return;
  const startAt = room.hostNow() + 4500;
  room.send('go', { raceId, startAt });
  session.beginCountdown(performance.now() + 4500);
}

function endRaceToRoom() {
  if (session) { world.endSession(); session = null; }
  if (room) room.setMeta({ ready: false });
  ui.hud.hide();
  input.enabled = false;
  showRoomScreen();
}

// --- pantalla de sala ---
function showRoomScreen() {
  screen = 'room';
  world.showShowroom(save.currentCar());
  if (M.audio.ctx && M.audio.ctx.state === 'running') M.music.play('menu');
  ui.showRoom({
    onSettings: partial => changeSettings(partial),
    onReady: ready => { room && room.setMeta({ ready }); },
    onStart: () => startOnlineRace(),
    onLeave: () => leaveRoom(),
    onAddBot: () => addBot(),
    onRemoveBot: id => removeBot(id),
    onChat: text => {
      text = String(text || '').trim().slice(0, 140);
      if (!text || !room) return;
      room.send('chat', { name: save.data.playerName, text });
      if (roomState) { roomState.chat.push({ name: save.data.playerName, text }); roomState.chat = roomState.chat.slice(-40); }
      refreshRoom();
    },
    onPickCar: () => { if (room) room.setMeta(presenceMeta(false)); world.showShowroom(save.currentCar()); },
  });
  refreshRoom();
}

function refreshRoom() {
  if (!room || screen !== 'room' || !ui) return;
  const st = roomState || { name: 'Sala ' + room.code, isPublic: false, settings: {}, bots: [], chat: [], phase: 'lobby' };
  const carName = id => { const d = M.cars.CAR_BY_ID[id]; return d ? `${d.brand} ${d.model}` : ''; };
  const peers = room.peerStatus();
  const players = room.members.map(m => ({
    id: m.id, name: m.name, car: carName(m.carId), ready: !!m.ready, isHost: m.id === room.hostId, isBot: false,
    link: m.id === room.me.id ? null : (peers[m.id] || 'conectando'),
  }));
  for (const b of st.bots || []) players.push({ id: b.id, name: b.name, car: carName(b.carId), ready: true, isHost: false, isBot: true });
  const othersReady = room.members.filter(m => m.id !== room.hostId).every(m => m.ready);
  ui.updateRoom({
    code: room.code, name: st.name, isPublic: st.isPublic, isHost: room.isHost, myId: room.me.id,
    settings: st.settings, players, chat: st.chat || [], phase: st.phase,
    canStart: room.isHost && st.phase !== 'racing' && othersReady,
  });
}
