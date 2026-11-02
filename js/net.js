// Transporte sin dependencias: WebRTC nativo + señalización con el protocolo de PeerServer.
import { SIGNAL, ICE, ROOM_PREFIX } from './config.js';
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 16);

class Signal {
  constructor(id, token, on) { this.id = id; this.token = token; this.on = on; this.open(); }
  open() {
    const base = SIGNAL.url.endsWith('/') ? SIGNAL.url : SIGNAL.url + '/';
    this.ws = new WebSocket(`${base}peerjs?key=${SIGNAL.key || 'peerjs'}&id=${encodeURIComponent(this.id)}&token=${this.token}&version=1.5.4`);
    this.ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'OPEN') { this.ready(); return; }
      if (m.type === 'ID-TAKEN') { this.closed = true; this.ws.close(); this.on.taken?.(); return; }
      if (m.type === 'ERROR') { this.on.error?.(m.payload?.msg); return; }
      this.on.message?.(m); };
    this.ws.onopen = () => { this.hb = setInterval(() => this.raw({ type: 'HEARTBEAT' }), 5000); this.wait = setTimeout(() => this.ready(), 1500); };
    this.ws.onclose = () => { clearInterval(this.hb); clearTimeout(this.wait); this.isReady = false; if (!this.closed) { this.on.lost?.(); setTimeout(() => !this.closed && this.open(), 1500); } };
    this.ws.onerror = () => this.on.error?.('signal');
  }
  ready() { clearTimeout(this.wait); if (!this.isReady) { this.isReady = true; this.on.open?.(); } }
  raw(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  send(dst, type, payload) { this.raw({ type, dst, payload }); }
  close() { this.closed = true; this.ws.close(); }
}

function wirePc(sig, peer, cid, onState) {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  pc.onicecandidate = e => e.candidate && sig.send(peer, 'CANDIDATE', { cid, c: e.candidate });
  pc.onconnectionstatechange = () => onState?.(pc.connectionState);
  return pc;
}

// Anfitrión: recibe conexiones de los móviles.
export class HostNet {
  constructor({ onMessage, onClose, onReady, onTaken, onLost }) { Object.assign(this, { onMessage, onClose, onReady, onTaken, onLost }); this.conns = new Map(); }
  start(code, token) {
    this.code = code;
    this.sig = new Signal(ROOM_PREFIX + code, token, { open: () => this.onReady?.(), taken: () => this.onTaken?.(), lost: () => this.onLost?.(), error: () => {}, message: m => this.signal(m) });
  }
  async signal(m) {
    const { cid } = m.payload || {};
    if (m.type === 'OFFER') {
      const pc = wirePc(this.sig, m.src, cid, s => { if (['failed', 'closed'].includes(s)) this.drop(cid); });
      const c = { pc, dc: null, pending: [] }; this.conns.set(cid, c);
      pc.ondatachannel = e => { c.dc = e.channel;
        e.channel.onmessage = ev => { let o; try { o = JSON.parse(ev.data); } catch { return; } this.onMessage(cid, o); };
        e.channel.onclose = () => this.drop(cid); };
      await pc.setRemoteDescription(m.payload.sdp);
      for (const x of c.pending) await pc.addIceCandidate(x).catch(() => {}); c.pending = null;
      await pc.setLocalDescription(await pc.createAnswer());
      this.sig.send(m.src, 'ANSWER', { cid, sdp: pc.localDescription });
    } else if (m.type === 'CANDIDATE') {
      const c = this.conns.get(cid); if (!c) return;
      if (c.pending) c.pending.push(m.payload.c); else await c.pc.addIceCandidate(m.payload.c).catch(() => {});
    }
  }
  drop(cid) { const c = this.conns.get(cid); if (!c) return; this.conns.delete(cid); try { c.pc.close(); } catch {} this.onClose?.(cid); }
  send(cid, o) { const c = this.conns.get(cid); if (c?.dc?.readyState === 'open') try { c.dc.send(JSON.stringify(o)); } catch {} }
  stop() { this.conns.forEach((_, k) => this.drop(k)); this.sig?.close(); }
}

// Jugador: se conecta al anfitrión y reintenta solo.
export class ClientNet {
  constructor({ onOpen, onMessage, onDown, onMissing }) { Object.assign(this, { onOpen, onMessage, onDown, onMissing }); this.stopped = false; this.tries = 0; }
  connect(code) {
    this.code = code; this.host = ROOM_PREFIX + code; this.me = ROOM_PREFIX + 'c-' + rid();
    this.sig = new Signal(this.me, rid(), { open: () => this.dial(), message: m => this.signal(m), error: () => {} });
  }
  async dial() {
    if (this.stopped) return;
    this.teardown(); const cid = this.cid = rid();
    const pc = this.pc = wirePc(this.sig, this.host, cid, s => { if (['failed', 'disconnected'].includes(s) && cid === this.cid) this.retry(); });
    this.pending = [];
    const dc = this.dc = pc.createDataChannel('game', { ordered: true });
    dc.onopen = () => { clearTimeout(this.timer); this.tries = 0; this.onOpen?.(); };
    dc.onmessage = ev => { let o; try { o = JSON.parse(ev.data); } catch { return; } this.lastSeen = Date.now(); this.onMessage(o); };
    dc.onclose = () => { if (cid === this.cid) this.retry(); };
    await pc.setLocalDescription(await pc.createOffer());
    this.sig.send(this.host, 'OFFER', { cid, sdp: pc.localDescription });
    this.timer = setTimeout(() => this.retry(), 12000);
  }
  async signal(m) {
    if (m.type === 'EXPIRE' || m.type === 'LEAVE') { if (this.tries === 0 && !this.everOpen) this.onMissing?.(); this.retry(); return; }
    const p = m.payload || {}; if (p.cid !== this.cid) return;
    if (m.type === 'ANSWER') { await this.pc.setRemoteDescription(p.sdp); for (const c of this.pending) await this.pc.addIceCandidate(c).catch(() => {}); this.pending = null; }
    else if (m.type === 'CANDIDATE') { if (this.pending) this.pending.push(p.c); else await this.pc.addIceCandidate(p.c).catch(() => {}); }
  }
  retry() {
    if (this.stopped || this.retrying) return; this.retrying = true; this.onDown?.();
    clearTimeout(this.timer); this.teardown(); this.tries++;
    setTimeout(() => { this.retrying = false; this.dial(); }, Math.min(800 * this.tries, 5000));
  }
  teardown() { this.cid = null; try { this.dc?.close(); this.pc?.close(); } catch {} }
  send(o) { if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(o)); }
  stop() { this.stopped = true; clearTimeout(this.timer); this.teardown(); this.sig?.close(); }
}
