import { Host } from './host.js';
import { ClientNet } from './net.js';
import { CATALOG } from './catalog.js';
import { EXCLUDED, BASIC, MIN_PLAYERS } from './engine.js';

const $ = s => document.querySelector(s), app = $('#app'), sheet = $('#sheet');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const safePhoto = s => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s || '') ? s : '';
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
const params = new URLSearchParams(location.search);

const S = { me: store.get('ct_me') || { name: '', photo: '' }, host: null, net: null, v: null, pid: null, photos: {}, key: '', tab: 'mesa', endAt: 0, online: true, code: params.get('sala')?.toUpperCase() || '', night: { vals: [], typed: 0, phrase: '' }, lastPhase: '', seen: false, acked: false };

function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3200); }
const buzz = p => { try { navigator.vibrate?.(p); } catch {} };
async function wake() { try { if (document.visibilityState === 'visible' && !S.lock) { S.lock = await navigator.wakeLock?.request('screen'); S.lock?.addEventListener?.('release', () => S.lock = null); } } catch {} }
document.addEventListener('visibilitychange', () => { if (S.v) wake(); });

const ui = { toast, photo(id, d) { if (safePhoto(d)) S.photos[id] = d; }, view: v => show(v), me: () => S.me, hostReady(h) { S.code = h.code; } };
const ava = (id, name) => { const p = S.photos[id]; return `<span class="ava">${p ? `<img alt="" src="${p}">` : `<i>${esc((name || '?')[0].toUpperCase())}</i>`}</span>`; };

// ── Inicio ───────────────────────────────────────────────────────────────
function home() {
  S.key = 'home';
  const hs = Host.saved(), cs = store.get('ct_client');
  app.innerHTML = `
  <h1>Blood on the<br>Clocktower</h1><p class="center mute">Una sala, tus amigos y un narrador que no duerme.</p>
  ${hs ? `<div class="banner row"><span class="grow">Tienes la sala <b>${esc(hs.code)}</b> abierta.</span><button class="mini" data-do="resumeHost">Volver</button><button class="mini ghost" data-do="dropHost">Cerrar</button></div>` : ''}
  ${!hs && cs ? `<div class="banner row"><span class="grow">Estabas en la sala <b>${esc(cs.code)}</b>.</span><button class="mini" data-do="resumeClient">Volver</button><button class="mini ghost" data-do="dropClient">Olvidar</button></div>` : ''}
  <button class="profile" data-do="camera" aria-label="Hacerte una foto">${S.me.photo ? `<span class="ava"><img alt="Tu foto" src="${S.me.photo}"></span>` : `<span class="ava"><i>Foto</i></span>`}</button>
  <p class="center small mute">Toca el círculo para hacerte una foto</p>
  <label class="f"><span>Tu nombre</span><input id="name" maxlength="18" autocomplete="nickname" value="${esc(S.me.name)}" placeholder="Álvaro"></label>
  <div class="card">
    <label class="f" style="margin-top:0"><span>Código de la sala</span><input id="code" maxlength="4" autocapitalize="characters" value="${esc(S.code)}" placeholder="ABCD" style="text-transform:uppercase;letter-spacing:.2em;font-family:Cinzel,serif"></label>
    <button class="main" data-do="join">Unirme a la sala</button>
  </div>
  <button class="wide" data-do="create">Crear una sala nueva</button>
  <p class="center"><button class="ghost" data-do="guide">Guía de roles</button></p>`;
}
function saveMe() { const n = $('#name'); if (n) S.me.name = n.value.trim().slice(0, 18); store.set('ct_me', S.me); }

// Cámara
async function camera() {
  saveMe();
  sheet.innerHTML = `<div class="sh"><h3>Tu foto de perfil</h3><div style="max-width:280px;margin:12px auto"><video id="vid" autoplay playsinline muted></video></div><p id="camerr" class="small mute center"></p>
  <div class="row"><button class="main" id="shot" data-do="shoot" disabled>Hacer foto</button></div>
  <div class="row" style="margin-top:8px"><label class="btn grow center" style="padding-top:16px">Subir imagen<input id="file" type="file" accept="image/*" capture="user" hidden></label><button data-do="closeCam">Cancelar</button></div></div>`;
  $('#file').onchange = async e => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.src = URL.createObjectURL(f); await img.decode(); setPhoto(img, img.naturalWidth, img.naturalHeight); };
  try { S.cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false }); const v = $('#vid'); v.srcObject = S.cam; await v.play(); $('#shot').disabled = false; }
  catch { $('#camerr').textContent = 'No se pudo abrir la cámara. Da permiso en el navegador o sube una imagen.'; }
}
function stopCam() { S.cam?.getTracks().forEach(t => t.stop()); S.cam = null; sheet.innerHTML = ''; }
function setPhoto(src, w, h) {
  const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d'), s = Math.min(w, h);
  x.translate(160, 0); if (src.tagName === 'VIDEO') x.scale(-1, 1); else x.setTransform(1, 0, 0, 1, 0, 0);
  x.drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 160, 160);
  S.me.photo = c.toDataURL('image/jpeg', .72); store.set('ct_me', S.me); stopCam();
  if (S.host) { const m = S.host.member(S.host.myId); if (m) { m.photo = S.me.photo; S.host.push(true); } } else if (S.net) S.net.send({ t: 'photo', photo: S.me.photo });
  S.key = ''; if (S.v) show(S.v); else home();
}

// ── Salas ────────────────────────────────────────────────────────────────
function need() { saveMe(); if (!S.me.name) { toast('Escribe tu nombre.'); $('#name')?.focus(); return false; } return true; }
function create() { if (!need()) return; S.host = new Host(ui); S.pid = null; S.host.open(S.me); S.pid = S.host.myId; if (S.me.photo) ui.photo(S.pid, S.me.photo); app.innerHTML = '<p class="center mute">Abriendo la sala…</p>'; S.key = 'wait'; wake(); }
function join(cred) {
  const code = (cred?.code || $('#code')?.value || '').trim().toUpperCase();
  if (!cred && !need()) return;
  if (!/^[A-Z]{4}$/.test(code)) return toast('El código tiene 4 letras.');
  S.code = code; app.innerHTML = `<p class="center mute">Buscando la sala ${esc(code)}…</p>`; S.key = 'wait'; wake();
  const hello = () => { const c = cred || store.get('ct_client'); S.net.send({ t: 'hello', name: S.me.name, photo: S.me.photo, ...(c?.code === code ? { pid: c.pid, secret: c.secret } : {}) }); };
  S.net = new ClientNet({
    onOpen: () => { S.online = true; hello(); },
    onDown: () => { S.online = false; paintNet(); },
    onMissing: () => { if (!S.v) { toast('No encuentro esa sala.'); leave(); } },
    onMessage: m => {
      if (m.t === 'welcome') { S.pid = m.pid; store.set('ct_client', { code: m.code, pid: m.pid, secret: m.secret }); }
      else if (m.t === 'view') { S.online = true; paintNet(); show(m.v); }
      else if (m.t === 'photo') { ui.photo(m.id, m.data); S.key = ''; if (S.v && S.v.phase !== 'NIGHT') show(S.v); }
      else if (m.t === 'err') toast(m.msg);
      else if (m.t === 'refused') { toast(m.msg); store.del('ct_client'); leave(); }
    } });
  S.net.connect(code);
}
function leave() { S.net?.stop(); S.net = null; S.host?.close(); S.host = null; S.v = null; S.pid = null; store.del('ct_client'); home(); }
const send = m => { if (S.host) { const e = S.host.apply(S.pid, m); if (e) toast(e); } else S.net?.send({ t: 'act', m }); };
function paintNet() { let b = $('#netb'); if (!S.online && S.v) { if (!b) { b = document.createElement('div'); b.id = 'netb'; b.className = 'banner'; b.textContent = 'Reconectando con la sala…'; app.prepend(b); } } else b?.remove(); }

// ── Router de vistas ─────────────────────────────────────────────────────
function show(v) {
  S.v = v; S.endAt = Date.now() + (v.left || 0);
  const phase = v.lobby ? 'LOBBY' : v.phase;
  document.body.classList.toggle('night', phase === 'NIGHT' || phase === 'REVEAL');
  if (v.vote && !S.votingNow) { S.tab = 'mesa'; closeSheet(); } S.votingNow = !!v.vote;
  if (phase !== S.lastPhase) {
    if (phase === 'NIGHT') { buzz([100, 50, 100]); S.night = { vals: [], typed: 0, phrase: pickPhrase() }; S.tab = 'mesa'; closeSheet(); }
    if (phase === 'REVEAL') buzz(300); if (phase === 'DAY') { buzz(120); S.tab = 'mesa'; } if (phase === 'OVER') { buzz([200, 100, 200]); closeSheet(); }
    if (phase === 'ROLES') S.seen = false;
    S.lastPhase = phase;
  }
  const { left, ...rest } = v;
  const key = phase === 'NIGHT' ? `N${v.night}` : JSON.stringify(rest) + S.tab + S.seen;
  if (key === S.key) return; S.key = key;
  ({ LOBBY: lobby, ROLES: roles, NIGHT: night, REVEAL: reveal, DAY: day, DUSK: day, OVER: over }[phase] || home)(v);
  paintNet();
}
setInterval(() => { const s = Math.max(0, Math.ceil((S.endAt - Date.now()) / 1000)); document.querySelectorAll('.tick').forEach(e => e.textContent = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`); }, 250);

function lobby(v) {
  const h = S.host, c = h?.cfg, opt = (val, cur, t) => `<option value="${val}" ${String(val) === String(cur) ? 'selected' : ''}>${t}</option>`;
  const n = v.members.length;
  app.innerHTML = `<h3 class="center">Código de la sala</h3><div class="code">${esc(v.code)}</div>
  <p class="center"><button class="ghost" data-do="share">Compartir enlace</button> <button class="ghost" data-do="camera">Cambiar foto</button></p>
  <div class="card"><h3>Mesa · ${n} de ${MIN_PLAYERS}–15</h3>${h ? '<p class="small mute">Colocad la lista en el orden real en que estáis sentados.</p>' : ''}
  <ul class="list">${v.members.map(m => `<li class="${m.online ? '' : 'off'}">${ava(m.id, m.name)}<span class="grow">${esc(m.name)}${m.id === S.pid ? ' <span class="mute">(tú)</span>' : ''}${m.bot ? ' <span class="mute">(bot)</span>' : ''}</span>
  ${h ? `<button class="mini ghost" data-do="up" data-id="${esc(m.id)}" aria-label="Subir">↑</button><button class="mini ghost" data-do="down" data-id="${esc(m.id)}" aria-label="Bajar">↓</button>${m.id !== h.myId ? `<button class="mini ghost" data-do="kick" data-id="${esc(m.id)}" aria-label="Expulsar">×</button>` : ''}` : ''}</li>`).join('')}</ul></div>
  ${h ? `<div class="card"><h3>Partida</h3>
    <label class="f"><span>Roles</span><select data-cfg="script">${opt('full', c.script, 'Edición Yogscast completa')}${opt('basic', c.script, 'Iniciación (roles sencillos)')}</select></label>
    <div class="row"><label class="f grow"><span>Noche</span><select data-cfg="nightSec" data-num>${[30, 45, 60, 90].map(x => opt(x, c.nightSec, x + ' s')).join('')}</select></label>
    <label class="f grow"><span>Debate</span><select data-cfg="daySec" data-num>${[120, 180, 300, 420, 600].map(x => opt(x, c.daySec, x / 60 + ' min')).join('')}</select></label>
    <label class="f grow"><span>Voto</span><select data-cfg="voteSec" data-num>${[8, 12, 20].map(x => opt(x, c.voteSec, x + ' s')).join('')}</select></label></div>
    <label class="row small"><input type="checkbox" style="width:22px;min-height:22px" data-cfg="table" ${c.table ? 'checked' : ''}> Este dispositivo solo es pantalla de mesa (no juega)</label>
    <details style="margin-top:8px"><summary>Narrador con Gemini (opcional)</summary><p class="small mute">La clave se guarda solo aquí. Sin ella, el narrador automático funciona igual.</p><input id="aikey" type="password" autocomplete="off" placeholder="Clave de Gemini" value="${esc(h.aiKey)}"></details>
    <details><summary>Probar sin gente</summary><button class="wide" data-do="bot">Añadir un bot</button></details>
  </div><button class="main" data-do="start" ${n < MIN_PLAYERS ? 'disabled' : ''}>${n < MIN_PLAYERS ? `Faltan ${MIN_PLAYERS - n} jugadores` : 'Empezar la partida'}</button>` : `<p class="center mute">Esperando a que el anfitrión empiece…</p>`}
  <p class="center"><button class="ghost" data-do="guide">Guía de roles</button> <button class="ghost" data-do="leave">Salir</button></p>`;
  const k = $('#aikey'); if (k) k.onchange = () => { h.aiKey = k.value.trim(); h.persist(); };
}

const roleCard = y => `<div class="role ${y.team}"><span class="tag">${y.team === 'E' ? 'Equipo del Mal' : 'Equipo del Bien'}</span><h2>${esc(y.roleName)}</h2><p>${esc(y.roleText)}</p></div>`;
const diary = y => y.diary.length ? `<div class="diary">${[...y.diary].reverse().map(d => `<p><em>${esc(d.at)}</em>${esc(d.text)}</p>`).join('')}</div>` : '<p class="mute small">Aún no has recibido información.</p>';

function roles(v) {
  const y = v.you;
  if (!y) { app.innerHTML = `<h2 class="center">Cada jugador mira su rol</h2><p class="center mute">Tapad la pantalla.</p>${clock(v)}`; return; }
  app.innerHTML = `<div class="top"><h3>Tu identidad</h3><span class="tick mute"></span></div>
  ${S.seen ? `${roleCard(y)}<div class="card">${diary(y)}</div>` : `<button class="cover" data-do="seeRole">Tapa la pantalla y toca aquí</button>`}
  <button class="main" data-do="ready" ${y.ready || !S.seen ? 'disabled' : ''} style="margin-top:12px">${y.ready ? 'Esperando a los demás…' : 'Lo tengo'}</button>`;
}

const PHRASES = ['El reloj de la torre marca la hora en que nadie duerme tranquilo en este pueblo', 'Mantengo la mente en calma mientras la niebla cubre las calles vacías', 'Nadie sabe quién llama a la puerta cuando la vela se apaga'];
const pickPhrase = () => PHRASES[Math.floor(Math.random() * PHRASES.length)];

function field(f, i, v) {
  if (f.k === 'p') return `<p class="small">${esc(f.label)}</p><div class="pgrid">${f.ids.map(id => { const s = v.seats.find(x => x.id === id); return `<button data-do="pick" data-i="${i}" data-id="${esc(id)}">${ava(id, s.name)}${esc(s.name)}</button>`; }).join('')}</div>`;
  return `<label class="f"><span>${esc(f.label)}</span><select data-pick="${i}"><option value="">—</option>${f.options.map(([k, t]) => `<option value="${esc(k)}">${esc(t)}</option>`).join('')}</select></label>`;
}
function night(v) {
  const y = v.you;
  app.innerHTML = `<div class="night"><h3 class="center">La noche cae · ${v.night}</h3><p class="timer tick"></p>
  ${y ? `<div class="card"><p class="small">${esc(y.prompt.title)}</p>${y.prompt.fields.map((f, i) => field(f, i, v)).join('')}</div>
  <div class="card"><p class="small">Escribe sin parar hasta que amanezca. Así nadie distingue quién actúa.</p><p class="small"><i>${esc(S.night.phrase)}</i></p>
  <textarea id="cam" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea><div class="bar"><div id="cambar"></div></div></div>` : `${clock(v)}`}</div>`;
  const t = $('#cam'); if (t) t.oninput = () => { S.night.typed++; $('#cambar').style.width = Math.min(100, S.night.typed / 1.2) + '%'; };
  document.querySelectorAll('[data-pick]').forEach(s => s.onchange = () => { S.night.vals[+s.dataset.pick] = s.value; chooseNow(); });
}
const chooseNow = () => send({ type: 'choose', values: Array.from({ length: S.v.you.prompt.fields.length }, (_, i) => S.night.vals[i] || null) });

function reveal(v) {
  app.innerHTML = `<div class="night"><h3 class="center">Antes del alba</h3><p class="timer tick"></p>${v.you ? `<div class="card">${v.you.card.map(t => `<p>${esc(t)}</p>`).join('')}</div>` : ''}<p class="center small">Memorízalo. Queda guardado en tu diario.</p></div>`;
}

function clock(v) {
  const n = v.seats.length, s = Math.max(15, Math.min(21, 150 / n));
  const hands = new Set(v.vote?.hands || []);
  return `<div class="clock" style="--s:${s}%">${v.seats.map((p, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n, x = 50 + 41 * Math.cos(a), y = 50 + 41 * Math.sin(a);
    return `<button class="seat ${p.alive ? '' : 'dead'} ${p.id === S.pid ? 'me' : ''} ${v.block === p.id ? 'block' : ''} ${hands.has(p.id) ? 'hand' : ''}" style="left:${x}%;top:${y}%" data-do="seat" data-id="${esc(p.id)}" aria-label="${esc(p.name)}">${ava(p.id, p.name)}${!p.alive && p.ghost ? '<span class="tok"></span>' : ''}<small>${esc(p.name)}</small></button>`; }).join('')}
    <div class="hub">${v.phase === 'DUSK' ? '<span class="mute">Anochece</span>' : `<span class="mute">Día ${v.day || '—'}</span>`}<b class="tick"></b><span class="small mute">${v.need ? `${v.need} votos para ejecutar` : ''}</span></div></div>`;
}
const feedHtml = v => `<div class="feed" id="feed">${v.feed.slice().reverse().map(f => `<p class="${esc(f.kind)}"><em>${esc(f.at)}</em>${esc(f.text)}</p>`).join('')}</div>`;

function day(v) {
  const y = v.you, g = S.tab;
  const tabs = y ? `<div class="tabs">${[['mesa', 'Mesa'], ['diario', 'Diario'], ['rol', 'Mi rol']].map(([k, t]) => `<button class="${g === k ? 'on' : ''}" data-do="tab" data-id="${k}">${t}</button>`).join('')}</div>` : '';
  if (g === 'rol' && y) { app.innerHTML = tabs + roleCard(y); return; }
  if (g === 'diario' && y) { app.innerHTML = tabs + `<div class="card">${diary(y)}</div>`; return; }
  const vt = v.vote, seat = id => v.seats.find(s => s.id === id), up = vt?.hands.includes(S.pid);
  const canVote = y && (y.alive || y.ghost > 0);
  const voteBox = vt ? `<div class="card vote"><div class="vt">${ava(vt.target, seat(vt.target).name)}<div class="grow"><h3>${esc(seat(vt.by).name)} nomina a</h3><h2>${esc(seat(vt.target).name)}</h2><span class="tick mute"></span> · <span class="mute">${vt.secret ? 'voto secreto' : `${vt.hands.length} manos`} de ${v.need}</span></div></div>
    ${canVote ? `<div class="row" style="margin-top:10px"><button class="grow ${up ? 'on' : ''}" data-do="hand" data-id="1">${y.alive ? 'A favor' : 'Gastar voto fantasma'}</button><button class="grow" data-do="hand" data-id="0">En contra</button></div>` : '<p class="small mute">Ya no te quedan votos.</p>'}</div>` : '';
  const acts = (y?.acts || []).map((a, i) => `<button class="wide" style="margin-top:6px" data-do="act" data-id="${i}">${esc(a.label)}</button>`).join('');
  const canSleep = v.phase === 'DAY' && !vt && y?.alive;
  app.innerHTML = tabs + clock(v) + voteBox + acts +
    (!vt && v.phase === 'DAY' && y?.alive ? `<p class="center small mute" style="margin:6px 0">${v.nominators.includes(S.pid) ? 'Ya has nominado hoy.' : 'Toca un retrato para nominar.'}</p>` : '') +
    (canSleep ? `<button class="wide" data-do="sleep">Terminar el día (${v.sleep})</button>` : '') + `<div class="card">${feedHtml(v)}</div>`;
}

function over(v) {
  const o = v.over;
  app.innerHTML = `<h3 class="center">Fin de la partida</h3><h1>${o.winner === 'G' ? 'Gana el Bien' : 'Gana el Mal'}</h1><p class="center mute">${esc(o.reason)}</p>
  <div class="card reveal">${o.reveal.map(r => `<div class="${r.team}">${ava(r.id, r.name)}<b>${esc(r.name)}</b><br>${esc(r.role)}${r.alive ? '' : ' ✝'}</div>`).join('')}</div>
  ${S.host ? '<button class="main" data-do="again">Otra partida con la misma sala</button>' : '<p class="center mute">El anfitrión puede abrir otra partida.</p>'}
  <p class="center"><button class="ghost" data-do="leave">Salir</button></p><div class="card">${feedHtml(v)}</div>`;
}

// ── Hojas ────────────────────────────────────────────────────────────────
const closeSheet = () => { if (!S.cam) sheet.innerHTML = ''; };
function guide() {
  const names = { T: 'Aldeanos', O: 'Forasteros', M: 'Secuaces', D: 'Demonios' };
  sheet.innerHTML = `<div class="sh"><div class="row"><h3 class="grow">Guía de roles</h3><button class="mini ghost" data-do="close">Cerrar</button></div><input id="q" placeholder="Buscar rol" style="margin:8px 0"><div id="rl"></div></div>`;
  const draw = q => { $('#rl').innerHTML = Object.keys(names).map(t => { const l = CATALOG.filter(r => r.team === t && (r.name + r.text).toLowerCase().includes(q)); return l.length ? `<h3 style="margin-top:12px">${names[t]}</h3>` + l.map(r => `<div class="roleitem"><b>${esc(r.name)}</b>${BASIC.includes(r.id) ? ' <span class="small mute">· iniciación</span>' : ''}<br>${esc(r.text)}${EXCLUDED[r.id] ? `<br><span class="small mute">No entra en el reparto automático: ${esc(EXCLUDED[r.id])}</span>` : ''}</div>`).join('') : ''; }).join(''); };
  draw(''); $('#q').oninput = e => draw(e.target.value.toLowerCase());
}
function dayAct(a) {
  sheet.innerHTML = `<div class="sh"><h3>${esc(a.label)}</h3>${a.fields.map((f, i) => f.k === 'p' ? `<label class="f"><span>${esc(f.label)}</span><select data-f="${i}"><option value="">—</option>${f.ids.map(id => `<option value="${esc(id)}">${esc(S.v.seats.find(s => s.id === id).name)}</option>`).join('')}</select></label>` : `<label class="f"><span>${esc(f.label)}</span><select data-f="${i}"><option value="">—</option>${f.options.map(([k, t]) => `<option value="${esc(k)}">${esc(t)}</option>`).join('')}</select></label>`).join('')}
  <div class="row" style="margin-top:10px"><button class="grow main" id="go">Confirmar</button><button data-do="close">Cancelar</button></div></div>`;
  $('#go').onclick = () => { send({ type: 'day', id: a.id, values: a.fields.map((_, i) => document.querySelector(`[data-f="${i}"]`).value || null) }); closeSheet(); };
}

const actions = {
  camera, closeCam: stopCam, create, guide, close: closeSheet, leave, join: () => join(),
  shoot() { const v = $('#vid'); setPhoto(v, v.videoWidth, v.videoHeight); },
  resumeHost() { need(); S.host = new Host(ui); const s = Host.saved(); S.pid = s.myId; S.host.open(S.me, s); S.key = 'wait'; app.innerHTML = '<p class="center mute">Recuperando la sala…</p>'; wake(); },
  dropHost() { Host.forget(); home(); }, dropClient() { store.del('ct_client'); home(); },
  resumeClient() { join(store.get('ct_client')); },
  async share() { const u = `${location.origin}${location.pathname}?sala=${S.v.code}`; try { if (navigator.share) await navigator.share({ title: 'Clocktower', text: `Únete a la sala ${S.v.code}`, url: u }); else { await navigator.clipboard.writeText(u); toast('Enlace copiado.'); } } catch {} },
  up: e => S.host.move(e.dataset.id, -1), down: e => S.host.move(e.dataset.id, 1), kick: e => S.host.kick(e.dataset.id), bot: () => S.host.addBot(), start: () => S.host.start(), again: () => { S.lastPhase = ''; S.host.reset(); },
  seeRole() { S.seen = true; S.key = ''; show(S.v); }, ready: () => send({ type: 'ready' }),
  pick(e) { const i = +e.dataset.i, id = e.dataset.id; S.night.vals[i] = S.night.vals[i] === id ? null : id; e.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b === e && S.night.vals[i] === id)); chooseNow(); },
  tab(e) { S.tab = e.dataset.id; S.key = ''; show(S.v); },
  seat(e) { const v = S.v, id = e.dataset.id; if (v.phase !== 'DAY' || v.vote || !v.you?.alive) return; const s = v.seats.find(x => x.id === id);
    if (v.nominators.includes(S.pid)) return toast('Ya has nominado hoy.'); if (v.nominated.includes(id)) return toast('Ya fue nominado hoy.');
    sheet.innerHTML = `<div class="sh"><div class="row"><div style="width:56px">${ava(id, s.name)}</div><h2 class="grow">¿Nominar a ${esc(s.name)}?</h2></div><div class="row" style="margin-top:12px"><button class="grow main" id="go">Nominar</button><button data-do="close">Cancelar</button></div></div>`;
    $('#go').onclick = () => { send({ type: 'nominate', target: id }); closeSheet(); }; },
  hand(e) { send({ type: 'hand', up: e.dataset.id === '1' }); },
  sleep: () => send({ type: 'sleep' }), act(e) { const a = S.v.you.acts[+e.dataset.id]; a.fields.length ? dayAct(a) : send({ type: 'day', id: a.id, values: [] }); },
};
document.addEventListener('click', e => { const el = e.target.closest('[data-do]'); if (el) actions[el.dataset.do]?.(el); if (e.target === sheet) { if (S.cam) stopCam(); else closeSheet(); } });
document.addEventListener('change', e => { const c = e.target.dataset?.cfg; if (c && S.host) S.host.setCfg({ [c]: e.target.type === 'checkbox' ? e.target.checked : 'num' in e.target.dataset ? +e.target.value : e.target.value }); });
home();
if (params.has('signal')) window.__S = S; // solo para las pruebas automáticas
