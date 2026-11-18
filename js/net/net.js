// Red de Asfalto Regio.
// - Una sala = un canal de Supabase Realtime (presencia + broadcast) para mensajes de control y señalización.
// - Los autos viajan por WebRTC P2P (DataChannel sin orden ni reintentos) a ~20 Hz.
// - Si con alguien no se logra P2P, ese par se cubre por Supabase a menor frecuencia (respaldo).
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, CODE_CHARS, ICE_SERVERS, NET_RATE_RELAY, MAX_PLAYERS } from '../config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 40 } },
});

export function newCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

const EVENTS = ['room', 'chat', 'load', 'loaded', 'go', 'fin', 'results', 'elim', 'bust', 'ping', 'pong', 'sig', 'car', 'event', 'lobby', 'kick'];

// ---------------------------------------------------------------------------------------------
export class Room {
  // me = { id, name }, meta = datos de presencia (auto, listo…)
  constructor(code, me, meta, { onMembers, onMessage, onFast, onStatus, onPeers } = {}) {
    this.code = code;
    this.me = me;
    this.meta = { ...meta };
    this.joinedAt = Date.now();
    this.onMembers = onMembers || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onFast = onFast || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onPeers = onPeers || (() => {});
    this.members = [];
    this.channel = null;
    this.closed = false;
    this.mesh = new PeerMesh(this);
    this.lastRelay = 0;
    this.clockOffset = 0;      // horaAnfitrion ≈ Date.now() + clockOffset
    this.bestRtt = Infinity;
  }

  get hostId() { return this.members.length ? this.members[0].id : this.me.id; }
  get isHost() { return this.hostId === this.me.id; }
  hostNow() { return Date.now() + (this.isHost ? 0 : this.clockOffset); }

  connect(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const ch = sb.channel(`ar-room-${this.code}`, {
        config: { broadcast: { self: false, ack: false }, presence: { key: this.me.id } },
      });
      this.channel = ch;
      ch.on('presence', { event: 'sync' }, () => {
        const st = ch.presenceState();
        const list = [];
        for (const key of Object.keys(st)) {
          const metas = st[key];
          if (!metas || !metas.length) continue;
          const m = metas[metas.length - 1];
          if (m && m.id) list.push({ ...m });
        }
        list.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || (a.id < b.id ? -1 : 1));
        this.members = list;
        this.mesh.syncMembers(list.map(m => m.id));
        this.onMembers(list);
      });
      for (const ev of EVENTS) {
        ch.on('broadcast', { event: ev }, ({ payload }) => {
          if (!payload || payload._from === this.me.id) return;
          if (payload._to && payload._to !== this.me.id) return;
          const from = payload._from;
          if (ev === 'sig') { this.mesh.handleSignal(from, payload); return; }
          if (ev === 'car') { this.onFast(payload.d, from, 'relay'); return; }
          if (ev === 'ping') { if (this.isHost) this.send('pong', { t0: payload.t0, th: Date.now() }, from); return; }
          if (ev === 'pong') { this._pong(payload); return; }
          this.onMessage(ev, payload, from);
        });
      }
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('timeout')); } }, timeoutMs);
      ch.subscribe(async (status) => {
        this.onStatus(status);
        if (status === 'SUBSCRIBED') {
          await this._track();
          if (!settled) { settled = true; clearTimeout(timer); resolve(); }
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
          settled = true; clearTimeout(timer); reject(new Error(status));
        }
      });
    });
  }

  async _track() {
    if (!this.channel || this.closed) return;
    try {
      await this.channel.track({ ...this.meta, id: this.me.id, name: this.me.name, joinedAt: this.joinedAt });
    } catch { /* reintento en el siguiente cambio */ }
  }
  setMeta(partial) {
    this.meta = { ...this.meta, ...partial };
    clearTimeout(this._metaT);
    this._metaT = setTimeout(() => this._track(), 120); // agrupa cambios rápidos (límite de presencia)
  }
  setName(name) { this.me.name = name; this.setMeta({}); }

  // Mensaje de control por Supabase. to = id de un jugador (opcional).
  send(event, payload = {}, to = null) {
    if (!this.channel || this.closed) return;
    const p = { ...payload, _from: this.me.id };
    if (to) p._to = to;
    this.channel.send({ type: 'broadcast', event, payload: p }).catch(() => {});
  }

  // Estado de autos: P2P a quien se pueda; respaldo por Supabase si algún miembro no tiene P2P.
  sendFast(data) {
    const str = JSON.stringify(data);
    this.mesh.broadcast(str);
    const others = this.members.filter(m => m.id !== this.me.id);
    const needRelay = others.some(m => !this.mesh.isOpen(m.id));
    if (needRelay) {
      const now = performance.now();
      if (now - this.lastRelay >= 1000 / NET_RATE_RELAY) {
        this.lastRelay = now;
        this.send('car', { d: data });
      }
    }
  }

  // Sincroniza el reloj con el del anfitrión (varias muestras; se queda con la de menor latencia).
  async syncClock(samples = 8) {
    if (this.isHost) { this.clockOffset = 0; return; }
    this.bestRtt = Infinity;
    for (let i = 0; i < samples; i++) {
      this.send('ping', { t0: Date.now() }, this.hostId);
      await new Promise(r => setTimeout(r, 250));
    }
    await new Promise(r => setTimeout(r, 400));
  }
  _pong({ t0, th }) {
    const t1 = Date.now();
    const rtt = t1 - t0;
    if (rtt < this.bestRtt) { this.bestRtt = rtt; this.clockOffset = th + rtt / 2 - t1; }
  }

  peerStatus() { return this.mesh.status(); }

  async leave() {
    this.closed = true;
    this.mesh.closeAll();
    if (this.channel) {
      try { await this.channel.untrack(); } catch { /* nada */ }
      try { await sb.removeChannel(this.channel); } catch { /* nada */ }
      this.channel = null;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Malla P2P: cada par de jugadores abre un RTCPeerConnection; inicia el de id menor.
class PeerMesh {
  constructor(room) {
    this.room = room;
    this.peers = new Map(); // id → { pc, dc, open, tries, timer, pending:[] }
  }
  get myId() { return this.room.me.id; }

  syncMembers(ids) {
    for (const id of ids) {
      if (id === this.myId) continue;
      if (!this.peers.has(id) && this.myId < id) this._start(id);
    }
    for (const id of [...this.peers.keys()]) if (!ids.includes(id)) this.close(id);
    this.room.onPeers(this.status());
  }

  _newPeer(id) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const p = { pc, dc: null, open: false, tries: (this.peers.get(id)?.tries || 0), timer: null, pending: [], failed: false };
    this.peers.set(id, p);
    pc.onicecandidate = e => { if (e.candidate) this.room.send('sig', { k: 'ice', c: e.candidate.toJSON() }, id); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') this._fail(id);
    };
    pc.ondatachannel = e => this._bindChannel(id, e.channel);
    p.timer = setTimeout(() => { if (!p.open) this._fail(id); }, 12000);
    return p;
  }

  async _start(id) {
    const p = this._newPeer(id);
    p.tries++;
    const dc = p.pc.createDataChannel('autos', { ordered: false, maxRetransmits: 0 });
    this._bindChannel(id, dc);
    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      this.room.send('sig', { k: 'offer', sdp: p.pc.localDescription.toJSON() }, id);
    } catch (e) { console.warn('P2P oferta', e); this._fail(id); }
  }

  _bindChannel(id, dc) {
    const p = this.peers.get(id);
    if (!p) return;
    p.dc = dc;
    dc.onopen = () => { p.open = true; clearTimeout(p.timer); this.room.onPeers(this.status()); };
    dc.onclose = () => { p.open = false; this.room.onPeers(this.status()); };
    dc.onmessage = e => {
      let d; try { d = JSON.parse(e.data); } catch { return; }
      this.room.onFast(d, id, 'p2p');
    };
  }

  async handleSignal(from, msg) {
    let p = this.peers.get(from);
    try {
      if (msg.k === 'offer') {
        if (p) this._closePeer(p);
        p = this._newPeer(from);
        await p.pc.setRemoteDescription(msg.sdp);
        for (const c of p.pending) await p.pc.addIceCandidate(c).catch(() => {});
        p.pending = [];
        const ans = await p.pc.createAnswer();
        await p.pc.setLocalDescription(ans);
        this.room.send('sig', { k: 'answer', sdp: p.pc.localDescription.toJSON() }, from);
      } else if (msg.k === 'answer') {
        if (!p || p.pc.signalingState !== 'have-local-offer') return;
        await p.pc.setRemoteDescription(msg.sdp);
        for (const c of p.pending) await p.pc.addIceCandidate(c).catch(() => {});
        p.pending = [];
      } else if (msg.k === 'ice') {
        if (!p) return;
        if (!p.pc.remoteDescription) p.pending.push(msg.c);
        else await p.pc.addIceCandidate(msg.c).catch(() => {});
      }
    } catch (e) { console.warn('P2P señal', e); }
  }

  _fail(id) {
    const p = this.peers.get(id);
    if (!p || p.failed) return;
    p.failed = true;
    p.open = false;
    this._closePeer(p);
    this.room.onPeers(this.status());
    // Un reintento; después se queda en respaldo por Supabase.
    if (p.tries < 2 && this.myId < id && !this.room.closed) {
      setTimeout(() => {
        if (this.room.closed || !this.room.members.some(m => m.id === id)) return;
        this.peers.delete(id);
        const tries = p.tries;
        this._start(id).then(() => { const q = this.peers.get(id); if (q) q.tries = Math.max(q.tries, tries + 1); });
      }, 3000);
    }
  }

  _closePeer(p) {
    clearTimeout(p.timer);
    try { p.dc && p.dc.close(); } catch { /* nada */ }
    try { p.pc.close(); } catch { /* nada */ }
  }
  close(id) { const p = this.peers.get(id); if (p) this._closePeer(p); this.peers.delete(id); }
  closeAll() { for (const id of [...this.peers.keys()]) this.close(id); }

  isOpen(id) { const p = this.peers.get(id); return !!(p && p.open && p.dc && p.dc.readyState === 'open'); }
  broadcast(str) {
    for (const p of this.peers.values()) {
      if (p.open && p.dc && p.dc.readyState === 'open') { try { p.dc.send(str); } catch { /* nada */ } }
    }
  }
  status() {
    const out = {};
    for (const [id, p] of this.peers) out[id] = p.open ? 'p2p' : (p.failed ? 'respaldo' : 'conectando');
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Salas públicas: los anfitriones se anuncian por presencia en el canal de vestíbulo.
export function findPublicRooms(timeoutMs = 2600) {
  return new Promise(resolve => {
    const ch = sb.channel('ar-lobby', { config: { presence: { key: 'q' + Math.random().toString(36).slice(2, 10) } } });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const rooms = [];
      try {
        const st = ch.presenceState();
        for (const k of Object.keys(st)) {
          const m = st[k][st[k].length - 1];
          if (m && m.code && Date.now() - (m.at || 0) < 6 * 3600e3) rooms.push(m);
        }
      } catch { /* nada */ }
      sb.removeChannel(ch).catch(() => {});
      rooms.sort((a, b) => (b.players || 0) - (a.players || 0));
      resolve(rooms);
    };
    ch.on('presence', { event: 'sync' }, () => setTimeout(finish, 450));
    ch.subscribe(s => { if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') finish(); });
    setTimeout(finish, timeoutMs);
  });
}

export class LobbyAd {
  constructor() { this.ch = null; this.info = null; this.ready = null; }
  async set(info) {
    if (!info) return this.stop();
    if (!this.ch) {
      this.ch = sb.channel('ar-lobby', { config: { presence: { key: 'r-' + info.code } } });
      this.ready = new Promise(res => this.ch.subscribe(s => { if (s === 'SUBSCRIBED') res(); }));
    }
    await this.ready;
    const key = JSON.stringify(info);
    if (key !== this.info && this.ch) {
      this.info = key;
      try { await this.ch.track({ ...info, max: MAX_PLAYERS, at: Date.now() }); } catch { /* nada */ }
    }
  }
  stop() {
    if (this.ch) { const ch = this.ch; this.ch = null; this.info = null; sb.removeChannel(ch).catch(() => {}); }
  }
}

// ---------------------------------------------------------------------------------------------
// Récords en línea por pista y modo (tabla ar_records con RLS: cualquiera lee e inserta).
export async function submitRecord(entry) {
  const { error } = await sb.from('ar_records').insert(entry);
  if (error) throw error;
}
export async function fetchRecords(trackId, modeId, limit = 25) {
  const { data, error } = await sb.from('ar_records')
    .select('player_name,car_id,ms,created_at')
    .eq('track_id', trackId).eq('mode_id', modeId)
    .order('ms', { ascending: true }).limit(limit);
  if (error) throw error;
  return (data || []).map(r => ({ name: r.player_name, car: r.car_id, ms: r.ms, at: r.created_at }));
}
