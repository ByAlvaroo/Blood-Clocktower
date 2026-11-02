// Cerebro del anfitrión: sala, jugadores, fotos, partida y guardado para sobrevivir a una recarga.
import { HostNet } from './net.js';
import { newGame, act, tick, viewFor, botAct, resolveNight, forceDawn, MAX_PLAYERS } from './engine.js';
import { GEMINI_KEY } from './config.js';
import { narratorHints, dawnText } from './ai.js';
const KEY = 'ct_host';
const code4 = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const rid = () => Math.random().toString(36).slice(2, 10);

export class Host {
  constructor(ui) { this.ui = ui; this.members = []; this.cfg = { script: 'full', chaos: 'alto', daySec: 420, voteSec: 20, table: false }; this.G = null; this.cids = new Map(); this.aiKey = GEMINI_KEY; this.lock = false; this.sent = new Map(); }
  static saved() { const s = load(KEY); return s && Date.now() - s.at < 6 * 3600e3 ? s : null; }
  static forget() { try { localStorage.removeItem(KEY); } catch {} }
  open(me, resume) {
    if (resume) Object.assign(this, { code: resume.code, token: resume.token, members: resume.members, cfg: resume.cfg, G: resume.G, myId: resume.myId });
    else { this.code = code4(); this.token = rid() + rid(); this.myId = rid(); this.members = [{ id: this.myId, name: me.name, photo: me.photo, online: true, secret: rid() }]; }
    this.net = new HostNet({
      onReady: () => { this.ui.hostReady(this); this.push(true); },
      onTaken: () => { if (resume) this.ui.toast('La sala sigue reservada: reintentando…'), setTimeout(() => this.open(me, resume), 4000); else this.open(me); },
      onLost: () => this.ui.toast('Reconectando con el servidor…'),
      onMessage: (cid, m) => this.message(cid, m),
      onClose: cid => this.closed(cid) });
    this.net.start(this.code, this.token);
    clearInterval(this.loop); this.loop = setInterval(() => this.step(), 500);
  }
  persist() { save(KEY, { at: Date.now(), code: this.code, token: this.token, members: this.members, cfg: this.cfg, G: this.G, myId: this.myId }); }
  member(id) { return this.members.find(m => m.id === id); }
  message(cid, m) {
    if (m.t === 'hello') return this.hello(cid, m);
    const id = this.cids.get(cid); if (!id) return;
    if (m.t === 'act') { const e = this.apply(id, m.m); if (e) this.net.send(cid, { t: 'err', msg: e }); }
    if (m.t === 'photo') { const x = this.member(id); if (x) { x.photo = m.photo; this.push(true); } }
  }
  hello(cid, m) {
    let x = m.pid && this.member(m.pid);
    if (x && x.secret !== m.secret) x = null;
    if (!x) {
      if (this.G) return this.net.send(cid, { t: 'refused', msg: 'La partida ya ha empezado.' });
      if (this.members.length >= MAX_PLAYERS) return this.net.send(cid, { t: 'refused', msg: 'La sala está llena.' });
      const name = String(m.name || '').trim().slice(0, 18);
      if (!name) return this.net.send(cid, { t: 'refused', msg: 'Falta tu nombre.' });
      if (this.members.some(y => y.name.toLowerCase() === name.toLowerCase())) return this.net.send(cid, { t: 'refused', msg: 'Ese nombre ya está en la sala.' });
      x = { id: rid(), name, photo: String(m.photo || '').slice(0, 40000), secret: rid() };
      this.members.push(x);
    }
    x.online = true; x.grace = 0;
    for (const [k, v] of this.cids) if (v === x.id && k !== cid) this.cids.delete(k);
    this.cids.set(cid, x.id);
    this.net.send(cid, { t: 'welcome', pid: x.id, secret: x.secret, code: this.code });
    this.photos(cid); this.push(true);
  }
  photos(cid) { const got = this.sent.get(cid) || new Map(); this.sent.set(cid, got); for (const m of this.members) if (m.photo && got.get(m.id) !== m.photo) { got.set(m.id, m.photo); this.net.send(cid, { t: 'photo', id: m.id, data: m.photo }); } }
  closed(cid) { const id = this.cids.get(cid); this.cids.delete(cid); this.sent.delete(cid); const x = id && this.member(id); if (x && ![...this.cids.values()].includes(id)) { x.online = false; x.grace = Date.now() + 25000; this.push(true); } }
  addBot() { if (this.members.length >= MAX_PLAYERS) return; const n = ['Ada','Bruno','Clara','Dante','Elena','Fausto','Greta','Hugo','Irene','Julio','Karla','Lope','Marta','Nilo'].find(x => !this.member(x)); this.members.push({ id: n, name: n, bot: true, online: true }); this.push(true); }
  setCfg(c) { Object.assign(this.cfg, c); if (c.table !== undefined) { if (c.table) this.members = this.members.filter(m => m.id !== this.myId); else if (!this.member(this.myId)) this.members.unshift({ id: this.myId, ...this.ui.me(), online: true, secret: rid() }); } this.push(true); }
  move(id, d) { const a = this.members, i = a.findIndex(m => m.id === id), j = i + d; if (i < 0 || j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; this.push(true); }
  kick(id) { this.members = this.members.filter(m => m.id !== id); this.push(true); }
  start() { try { this.G = newGame(this.members.map(m => ({ id: m.id, name: m.name, bot: m.bot })), this.cfg, this.code); this.push(true); } catch (e) { this.ui.toast(e.message); } }
  reset() { this.G = null; this.members = this.members.filter(m => m.bot || m.online || m.id === this.myId); this.push(true); }
  forceDawn() { if (this.G) { forceDawn(this.G); this.push(true); } }
  apply(id, m) { if (!this.G) return 'La partida no ha empezado.'; const e = act(this.G, id, m); this.push(); return e; }
  async nightEnd() {
    this.lock = true; const G = this.G;
    if (this.aiKey) G.hints = await narratorHints(this.aiKey, G);
    resolveNight(G, Date.now());
    if (this.aiKey && G.phase === 'REVEAL') { const t = await dawnText(this.aiKey, G); if (t) G.dawn = t; }
    this.lock = false; this.push(true);
  }
  step() {
    const now = Date.now();
    if (!this.G) { let ch = false; this.members = this.members.filter(m => { const gone = m.id !== this.myId && !m.bot && !m.online && m.grace && now > m.grace; ch ||= gone; return !gone; }); if (ch) this.push(true); return; }
    if (this.lock) return;
    this.G.absent = this.members.filter(m => !m.bot && m.id !== this.myId && !m.online && m.grace && now > m.grace).map(m => m.id);
    if (Math.random() < .5) for (const m of this.members) if (m.bot && Math.random() < .12) botAct(this.G, m.id, now);
    const r = tick(this.G, now);
    if (r === 'NIGHT_END') return void this.nightEnd();
    this.push(!!r);
  }
  lobbyView() { return { lobby: true, code: this.code, cfg: { script: this.cfg.script, chaos: this.cfg.chaos, daySec: this.cfg.daySec }, members: this.members.map(m => ({ id: m.id, name: m.name, online: m.online !== false, bot: !!m.bot })) }; }
  viewOf(id) { return this.G ? viewFor(this.G, id) : this.lobbyView(); }
  push(hard) {
    if (hard) this.persist();
    for (const [cid, id] of this.cids) this.net.send(cid, { t: 'view', v: this.viewOf(id) });
    const seen = new Set(); for (const m of this.members) if (m.photo && !seen.has(m.id)) { seen.add(m.id); this.ui.photo(m.id, m.photo); }
    if (hard) for (const [cid] of this.cids) this.photos(cid);
    this.ui.view(this.viewOf(this.myId));
  }
  close() { clearInterval(this.loop); this.net?.stop(); Host.forget(); }
}
