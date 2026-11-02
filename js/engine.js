// Motor determinista de reglas + narrador automático.
// Todo el estado secreto vive aquí, en el dispositivo anfitrión. Los jugadores solo reciben viewFor().
import { CATALOG } from './catalog.js';

export const BY = Object.fromEntries(CATALOG.map(r => [r.id, r]));
export const DIST = { 5:[3,0,1,1],6:[3,1,1,1],7:[5,0,1,1],8:[5,1,1,1],9:[5,2,1,1],10:[7,0,2,1],11:[7,1,2,1],12:[7,2,2,1],13:[9,0,3,1],14:[9,1,3,1],15:[9,2,3,1] };
export const MIN_PLAYERS = 5, MAX_PLAYERS = 15;

// Roles de la guía que un narrador automático no puede arbitrar con justicia.
export const EXCLUDED = {
  ateo:'Exige que el Narrador rompa las reglas a propósito.',
  amnesico:'Requiere conversar en privado con un Narrador humano.',
  lider_del_culto:'La guía no define un método de conversión arbitrable.',
  ingeniero:'Reescribe el reparto en mitad de la partida sin reglas de límite en la guía.',
  licantropo:'La elección nocturna de la guía no tiene efecto definido.',
  mutante:'Depende de escuchar lo que dicen los jugadores en voz alta.',
  medico_de_la_peste:'El poder lo usaría el propio Narrador, sin criterio definido.',
  politico:'“Quien más contribuyó” es un juicio subjetivo.',
  cerenovus:'Depende de escuchar si alguien finge bien un personaje.',
  mezepheles:'Depende de oír una palabra secreta hablada.',
  hechicero:'Los deseos libres no se pueden validar de forma automática.',
  invocador:'Deja la partida sin Demonio durante tres noches y rompe el arranque automático.',
  psicopata:'Necesita un duelo físico de piedra, papel o tijera.',
  al_hadikhia:'Necesita una ronda secreta extra entre tres jugadores dentro de la noche.',
  pequeno_monstruo:'Depende de pasar un objeto físico en la mesa.',
  senor_de_tifon:'Obliga a recolocar la mesa física.',
  motin:'Es otro modo de juego sin noches.',
  yaggababble:'Depende de oír una frase hablada.',
  zombuul:'Finge la muerte de forma incompatible con el recuento público.',
};
export const AUTO = CATALOG.filter(r => !EXCLUDED[r.id]).map(r => r.id);
export const BASIC = ['lavandera','bibliotecario','investigador','cocinero','empatico','adivina','sepulturero','monje','cuidador_de_cuervos','virgen','cazademonios','soldado','alcalde','mayordomo','borracho','ermitano','santo','envenenador','espia','mujer_escarlata','baron','diablillo'];

const FAR = 1e9, DUSK_MS = 7000, REVEAL_MS = 11000, ROLES_MS = 60000;
const rnd = () => Math.random();
export const pick = a => a[Math.floor(rnd() * a.length)];
export const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const type = r => BY[r].team;
const nm = p => p.name;

// ── Consultas ────────────────────────────────────────────────────────────
const all = G => G.seats.map(id => G.players[id]);
const living = G => all(G).filter(p => p.alive);
const others = (G, p) => living(G).filter(x => x.id !== p.id);
const impaired = (G, p) => p.fake || p.eff.some(e => e.until >= G.t);
const works = (G, p) => !impaired(G, p);
const has = (G, id) => living(G).find(p => p.ab === id && works(G, p));
const isDemon = p => type(p.role) === 'D';
const demon = G => all(G).find(p => isDemon(p) && p.alive);
const seatIdx = (G, p) => G.seats.indexOf(p.id);
function neighbours(G, p, aliveOnly = true) {
  const n = G.seats.length, i = seatIdx(G, p), out = [];
  for (const d of [1, -1]) for (let s = 1; s < n; s++) {
    const q = G.players[G.seats[(i + d * s + n * s) % n]];
    if (!aliveOnly || q.alive) { if (q.id !== p.id) out.push(q); break; }
  }
  return out;
}
const dist = (G, a, b) => { const n = G.seats.length, d = Math.abs(seatIdx(G, a) - seatIdx(G, b)); return Math.min(d, n - d); };
const score = G => { const v = living(G), e = v.filter(p => p.team === 'E').length; return e / Math.max(1, v.length); };
const evilAhead = G => (G.hints?.favor ? G.hints.favor === 'GOOD' : score(G) >= 0.34); // true → el narrador ayuda al Bien
function narr(G, base = .5) { const help = evilAhead(G); return rnd() < (help ? base * .7 : Math.min(.9, base * 1.3)); }
function regEvil(G, t) {
  if (t.ab === 'ermitano' && works(G, t)) return narr(G, .45) || t.team === 'E';
  if (t.ab === 'espia' && works(G, t)) return !narr(G, .55);
  return t.team === 'E';
}
function regDemon(G, t) {
  if (t.ab === 'ermitano' && works(G, t) && narr(G, .3)) return true;
  return isDemon(t);
}
const isViz = G => all(G).some(p => p.alive && p.role === 'vortox' && !impaired(G, p));
function say(G, p, truth, fake) {
  const lie = impaired(G, p) || (p.team === 'G' && isViz(G));
  note(p, G, lie ? fake() : truth());
}
function note(p, G, text) { p.diary.push({ at: stamp(G), text }); p.card.push(text); }
const stamp = G => (G.phase === 'NIGHT' || G.phase === 'REVEAL' || G.phase === 'ROLES') ? `Noche ${Math.max(1, G.night)}` : `Día ${G.day}`;
function feed(G, text, kind = 'info') { G.feed.push({ at: stamp(G), text, kind }); }

function statement(G, truth) {
  const p = pick(all(G)), k = pick(['team', 'team', 'role']);
  if (k === 'team') { const evil = (p.team === 'E') === truth; return `${nm(p)} pertenece al equipo ${evil ? 'malvado' : 'bueno'}.`; }
  const inp = all(G).map(x => x.role), pool = truth ? inp : AUTO.filter(r => !inp.includes(r));
  return `${BY[pick(pool.length ? pool : inp)].name} está en juego.`;
}
const claims = { evil:'es malvado', good:'es bueno', demon:'es el Demonio', minion:'es un Secuaz' };
const claimTrue = (G, t, c) => c === 'evil' ? regEvil(G, t) : c === 'good' ? !regEvil(G, t) : c === 'demon' ? regDemon(G, t) : type(t.role) === 'M';

// ── Reparto ──────────────────────────────────────────────────────────────
export function newGame(list, cfg, code = '') {
  const n = list.length;
  if (n < MIN_PLAYERS) throw new Error(`Hacen falta al menos ${MIN_PLAYERS} jugadores.`);
  if (n > MAX_PLAYERS) throw new Error(`El máximo son ${MAX_PLAYERS} jugadores.`);
  const G = { code, cfg, phase: 'ROLES', phaseEnd: 0, t: 0, night: 0, day: 0, seats: list.map(p => p.id), players: {}, feed: [], vote: null,
    nominators: [], nominated: [], top: 0, block: null, sleep: [], over: null, bluffs: [], hints: null, executed: null, execYesterday: null,
    outsiderDied: -1, demonVoted: false, minionNom: false, gossip: false, noKill: false, mm: 0, princess: 0, moon: null, advocate: null, harpy: null, dawn: '' };
  for (const l of list) G.players[l.id] = { id: l.id, name: l.name, bot: !!l.bot, role: null, ab: null, shown: null, team: 'G', shownTeam: 'G', alive: true, ghost: 1, fake: false, eff: [], used: {}, diary: [], card: [], ready: !!l.bot, prompt: null, choice: null };
  deal(G); firstInfo(G);
  G.phaseEnd = Date.now() + ROLES_MS;
  return G;
}
function deal(G) {
  const ps = all(G), n = ps.length, set = (G.cfg.script === 'basic' ? BASIC : AUTO);
  let [t, o, m, d] = DIST[n];
  const of = c => shuffle(set.filter(r => type(r) === c));
  const minions = of('M').slice(0, m), dem = of('D').slice(0, d);
  if (minions.includes('baron') && t >= 2) { t -= 2; o += 2; }
  let tf = of('T').slice(0, t), out = of('O').slice(0, o);
  if (tf.includes('monaguillo') && !tf.includes('rey')) tf[tf.indexOf(tf.find(x => x !== 'monaguillo'))] = 'rey';
  if (tf.includes('cazador') && !out.includes('damisela')) { if (out.length) out[0] = 'damisela'; else tf[tf.indexOf('cazador')] = of('T').find(x => !tf.includes(x)); }
  const bag = shuffle([...tf, ...out, ...minions, ...dem]);
  ps.forEach((p, i) => { p.role = bag[i]; p.ab = p.shown = bag[i]; p.team = 'GE'[+('MD'.includes(type(bag[i])))]; p.shownTeam = p.team; });
  // Marioneta junto al Demonio
  const mar = ps.find(p => p.role === 'marioneta'), dp = ps.find(isDemon);
  if (mar && !neighbours(G, dp, false).includes(mar)) { const nb = neighbours(G, dp, false)[0]; const si = seatIdx(G, nb), sj = seatIdx(G, mar); [G.seats[si], G.seats[sj]] = [G.seats[sj], G.seats[si]]; }
  const used = new Set(ps.map(p => p.role));
  const free = c => shuffle(AUTO.filter(r => type(r) === c && !used.has(r)));
  G.bluffs = free('T').slice(0, 3); G.bluffs.forEach(b => used.add(b));
  for (const p of ps) {
    if (p.role === 'borracho' || p.role === 'marioneta') { const s = free('T')[0]; used.add(s); p.fake = true; p.ab = p.shown = s; p.shownTeam = 'G'; }
    if (p.role === 'lunatico') { const s = free('D')[0] || 'diablillo'; used.add(s); p.fake = true; p.ab = p.shown = s; p.shownTeam = 'E'; p.lunatic = true; }
    if (p.role === 'alquimista') { p.ab = free('M').find(r => ['envenenador','bruja','abogado_del_diablo'].includes(r)) || 'envenenador'; }
  }
}
function firstInfo(G) {
  const ps = all(G), d = ps.find(isDemon), mins = ps.filter(p => type(p.role) === 'M' && p.role !== 'marioneta');
  const mago = ps.find(p => p.role === 'mago'), lun = ps.find(p => p.lunatic), poppy = ps.some(p => p.role === 'cultivador_de_amapolas');
  const names = a => a.map(nm).join(', ') || 'nadie';
  G.phase = 'ROLES';
  if (!poppy) {
    const shownMinions = shuffle([...mins, ...(mago ? [mago] : [])]);
    note(d, G, `Tus Secuaces: ${names(shownMinions)}. Tres personajes buenos que NO están en juego y puedes fingir: ${G.bluffs.map(b => BY[b].name).join(', ')}.`);
    for (const m of mins) note(m, G, `Tu Demonio es ${nm(d)}. Otros Secuaces: ${names(mins.filter(x => x !== m))}.`);
    if (lun) note(lun, G, `Tus Secuaces: ${names(shuffle(others(G, lun)).slice(0, mins.length))}. Personajes que puedes fingir: ${G.bluffs.map(b => BY[b].name).join(', ')}.`);
  } else [d, ...mins].forEach(p => note(p, G, 'Hay un Cultivador de Amapolas: no sabrás quién es tu equipo hasta que muera.'));
  if (mago) note(mago, G, `Los Secuaces son: ${names(mins)}.`);
  const mar = ps.find(p => p.role === 'marioneta'); if (mar) note(d, G, `Tu Marioneta es ${nm(mar)}: cree ser un Aldeano.`);
  if (ps.some(p => p.role === 'chivato')) { const notIn = shuffle(AUTO.filter(r => !ps.some(p => p.role === r))).slice(0, 3); mins.forEach(m => note(m, G, `Chivato: ${notIn.map(r => BY[r].name).join(', ')} no están en juego.`)); }
  const god = ps.find(p => p.ab === 'padrino'); if (god) note(god, G, `Forasteros en juego: ${names(ps.filter(p => type(p.role) === 'O')) }.`);
  const vis = ps.find(p => p.role === 'visir'); if (vis) feed(G, `${nm(vis)} es el Visir: todo el pueblo lo sabe.`, 'alert');
  const rey = ps.find(p => p.ab === 'rey'); if (rey) note(d, G, `El Rey es ${nm(rey)}.`);
  const adi = ps.find(p => p.ab === 'adivina'); if (adi) G.herring = pick(ps.filter(p => p.team === 'G' && p.id !== adi.id)).id;
  const gem = ps.find(p => p.ab === 'gemelo_malvado');
  if (gem) { const tw = pick(ps.filter(p => type(p.role) === 'T')); gem.twin = tw?.id; if (tw) { note(gem, G, `Tu gemelo es ${nm(tw)} (${BY[tw.role].name}).`); note(tw, G, `Tu gemelo malvado es ${nm(gem)} (${BY[gem.role].name}).`); } }
  const pz = ps.find(p => p.ab === 'maestro_de_los_acertijos'); if (pz) { const v = pick(others(G, pz)); v.eff.push({ until: FAR }); }
  const nd = ps.find(p => p.ab === 'no_dashii'); if (nd) for (const dir of neighboursTF(G, nd)) dir.eff.push({ until: FAR });
  const duen = ps.find(p => p.ab === 'duendecillo');
  if (duen) { const c = pick(ps.filter(p => type(p.role) === 'T' && p !== duen)); if (c) { duen.pixie = c.id; note(duen, G, `Conoces un Aldeano en juego: ${BY[c.shown].name}.`); } }
}
const neighboursTF = (G, p) => { const n = G.seats.length, i = seatIdx(G, p), out = []; for (const d of [1, -1]) for (let s = 1; s < n; s++) { const q = G.players[G.seats[(i + d * s + n * s) % n]]; if (type(q.role) === 'T') { out.push(q); break; } } return out; };

// ── Habilidades nocturnas: orden, campos del formulario y efecto ─────────
const P = (label, pool = 'others', opt = false) => ({ k: 'p', label, pool, opt });
const Rf = (label, set, opt = false) => ({ k: 'r', label, set, opt });
const once = (id) => (G, p) => !p.used[id];
const notFirst = G => G.night > 1;
const firstOnly = G => G.night === 1;
const inScript = G => (G.cfg.script === 'basic' ? BASIC : AUTO);
const NOT_IN_PLAY_GOOD = G => AUTO.filter(r => ['T', 'O'].includes(type(r)) && !all(G).some(p => p.role === r || p.ab === r));
const anyDead = G => all(G).some(p => !p.alive);

function poison(G, t, until) { t.eff.push({ until }); }
function kill(G, c, t, kind) {
  if (!t || !t.alive) return false;
  if (kind !== 'assassin') {
    if (kind === 'demon' && (c.safe.includes(t.id) || G.noKill)) return false;
    if (kind === 'demon' && t.ab === 'soldado' && works(G, t)) return false;
    if (t.ab === 'marinero' && works(G, t)) return false;
    if (neighbours(G, t).some(x => x.ab === 'senora_del_te' && works(G, x)) && t.team === 'G') { const tea = neighbours(G, t).find(x => x.ab === 'senora_del_te'); if (neighbours(G, tea).every(x => x.team === 'G')) return false; }
    if (kind === 'demon' && t.ab === 'alcalde' && works(G, t) && !c.bounced) { c.bounced = true; const o = others(G, t).filter(x => !isDemon(x)); if (o.length) return kill(G, c, pick(o), 'demon'); }
    if (t.ab === 'tonto' && works(G, t) && !t.used.tonto) { t.used.tonto = 1; return false; }
    if (t.role === 'sanguijuela' && all(G).some(p => p.id === t.leech && p.alive)) return false;
  }
  die(G, t, kind === 'demon' ? 'demon' : 'night');
  c.dead.push(t.id);
  return true;
}
function changeRole(G, p, role, team) { p.role = p.ab = p.shown = role; p.fake = false; if (team) p.team = p.shownTeam = team; }
function die(G, t, how) {
  if (!t.alive) return; t.alive = false; t.ghost = 1;
  const night = how === 'demon' || how === 'night';
  if (type(t.role) === 'O') G.outsiderDied = G.day;
  if (how === 'demon' && t.ab === 'banshee' && works(G, t)) { t.ghost = 2; feed(G, `Un lamento recorre el pueblo: ${nm(t)} era la Banshee.`, 'alert'); }
  if (how === 'demon' && t.ab === 'sabio' && works(G, t)) { const dp = demon(G); if (dp) { const o = pick(others(G, dp)) || dp; note(t, G, `Uno de estos jugadores es el Demonio: ${shuffle([dp, o]).map(nm).join(' o ')}.`); } }
  if (how === 'demon') { for (const a of all(G).filter(a => a.ab === 'abuela' && a.grand === t.id && a.alive && works(G, a))) die(G, a, 'night'); if (t.ab === 'rey') { const m = all(G).find(p => p.ab === 'monaguillo' && p.alive); const dp = demon(G); if (m && dp) say(G, m, () => `Tu Rey ha caído: el Demonio es ${nm(dp)}.`, () => `Tu Rey ha caído: el Demonio es ${nm(pick(others(G, m)))}.`); } }
  if (night && t.ab === 'granjero' && works(G, t)) { const g = pick(living(G).filter(p => p.team === 'G')); if (g) { g.role = g.ab = g.shown = 'granjero'; note(g, G, 'Ahora eres el Granjero.'); } }
  if (night && t.ab === 'sombrerero' && works(G, t)) for (const e of living(G).filter(p => p.team === 'E')) { const f = AUTO.filter(r => type(r) === type(e.role) && r !== 'baron' && !all(G).some(p => p.role === r)); if (f.length && rnd() < .5) { changeRole(G, e, pick(f)); note(e, G, `El Sombrerero ha muerto: ahora eres ${BY[e.role].name}.`); } }
  if (night && t.ab === 'barbero' && works(G, t)) { const o = shuffle(living(G).filter(p => !isDemon(p))); if (o.length >= 2) { const [a, b] = o; [a.role, b.role] = [b.role, a.role]; [a.ab, b.ab] = [b.ab, a.ab]; [a.shown, b.shown] = [b.shown, a.shown]; [a.fake, b.fake] = [b.fake, a.fake]; [a, b].forEach(x => note(x, G, `El Barbero ha muerto: ahora eres ${BY[x.shown].name}.`)); } }
  if (t.ab === 'amado' && works(G, t)) { const o = pick(living(G)); if (o) poison(G, o, FAR); }
  if (t.ab === 'torpe' && works(G, t)) t.must = 'torpe';
  if (t.role === 'cultivador_de_amapolas') { const ev = all(G).filter(p => p.team === 'E'); ev.forEach(e => note(e, G, `Tu equipo: ${ev.map(nm).join(', ')}.`)); }
  if (isDemon(t)) demonDied(G, t);
}
function demonDied(G, t) {
  const sw = living(G).find(p => p.ab === 'mujer_escarlata' && works(G, p));
  if (sw && living(G).length + 1 >= 5) { changeRole(G, sw, t.role, 'E'); note(sw, G, `El Demonio ha muerto: ahora eres ${BY[t.role].name}.`); }
}

// id → { order, when, fields, run(G, c, p, v, ok) }
const A = {
  envenenador:{ o:10, when:()=>true, f:()=>[P('Elige a quién envenenar')], run(G,c,p,[t],ok){ if(ok&&t) poison(G,t,G.t+1);} },
  viuda:{ o:11, when:firstOnly, f:()=>[P('Elige a quién envenenar para siempre')], run(G,c,p,[t],ok){ grim(G,p); if(ok&&t) poison(G,t,FAR);} },
  espia:{ o:12, when:()=>true, run(G,c,p){ grim(G,p);} },
  cortesano:{ o:13, when:once('cortesano'), f:G=>[Rf('Personaje a emborrachar (opcional)',inScript(G),true)], run(G,c,p,[,r],ok,v){ const id=v[0]; if(!id)return; p.used.cortesano=1; const t=all(G).find(x=>x.role===id); if(ok&&t) poison(G,t,G.t+6);} },
  marinero:{ o:14, when:()=>true, f:()=>[P('Elige un jugador vivo')], run(G,c,p,[t],ok){ if(ok&&t) poison(G,rnd()<.5?t:p,G.t+1);} },
  posadero:{ o:15, when:notFirst, f:()=>[P('Primer protegido'),P('Segundo protegido')], run(G,c,p,[a,b],ok){ if(ok&&a&&b){ c.safe.push(a.id,b.id); poison(G,rnd()<.5?a:b,G.t+1);} } },
  exorcista:{ o:16, when:notFirst, f:()=>[P('Elige a un jugador')], run(G,c,p,[t],ok){ if(ok&&t&&isDemon(t)){ c.exorcised=t.id; note(t,G,`${nm(p)} te ha exorcizado: esta noche no matas.`);} } },
  monje:{ o:17, when:notFirst, f:()=>[P('Elige a quién proteger')], run(G,c,p,[t],ok){ if(ok&&t) c.safe.push(t.id);} },
  abogado_del_diablo:{ o:18, when:()=>true, f:()=>[P('Elige a quién salvar de la ejecución','alive')], run(G,c,p,[t],ok){ G.advocate=ok&&t?t.id:null;} },
  arpia:{ o:19, when:()=>true, f:()=>[P('Jugador obligado'),P('Debe votar contra','alive')], run(G,c,p,[a,b],ok){ G.harpy=ok&&a&&b?{a:a.id,b:b.id}:null;} },
  bruja:{ o:20, when:()=>true, f:()=>[P('Elige a quién maldecir')], run(G,c,p,[t],ok){ if(ok&&t){ t.cursed=G.day+1; } } },
  alarmista:{ o:21, when:firstOnly, f:()=>[P('Objetivo público')], run(G,c,p,[t],ok){ if(ok&&t){ G.alarm=t.id; feed(G,`Una voz señala a ${nm(t)}: si el pueblo lo ejecuta, el Mal gana.`,'alert'); } } },
  predicador:{ o:22, when:()=>true, f:()=>[P('Elige a un jugador')], run(G,c,p,[t],ok){ if(ok&&t&&type(t.role)==='M') poison(G,t,FAR);} },
  encantador_de_serpientes:{ o:23, when:()=>true, f:()=>[P('Elige a un jugador')], run(G,c,p,[t],ok){ if(ok&&t&&isDemon(t)){ const r=t.role, q=p.role; changeRole(G,p,r,'E'); changeRole(G,t,q,'G'); note(p,G,`Has encantado al Demonio: ahora tú eres ${BY[r].name}.`); note(t,G,`Te han encantado: ahora eres ${BY[q].name} del equipo bueno.`);} } },
  bruja_del_pozo:{ o:24, when:notFirst, f:G=>[P('Jugador a transformar'),Rf('Nuevo personaje',AUTO.filter(r=>type(r)!=='D'&&!all(G).some(x=>x.role===r)))], run(G,c,p,[t],ok,v){ if(ok&&t&&v[1]&&!isDemon(t)&&BY[v[1]]){ t.role=t.ab=t.shown=v[1]; t.fake=false; note(t,G,`Una magia oscura te transforma: ahora eres ${BY[v[1]].name}.`);} } },
  ogro:{ o:25, when:firstOnly, f:()=>[P('Elige a tu aliado')], run(G,c,p,[t],ok){ if(ok&&t) p.team=t.team; } },
  mayordomo:{ o:26, when:()=>true, f:()=>[P('Elige a tu amo')], run(G,c,p,[t]){ p.master=t?.id;} },
  cuidador_de_cuervos:{ o:27, when:()=>true, f:()=>[P('Si mueres esta noche, a quién investigas')], late:1, run(G,c,p,[t],ok){ if(c.dead.includes(p.id)&&t){ const f=pick(AUTO); say(G,p,()=>`${nm(t)} es ${BY[t.role].name}.`,()=>`${nm(t)} es ${BY[f].name}.`);} } },
  sanguijuela:{ o:30, when:()=>true, f:G=>[P(G.night===1?'Elige a tu huésped del equipo bueno':'Elige a quién matar')], run(G,c,p,[t],ok){ if(!t)return; if(G.night===1) p.leech=t.id; else if(ok) demonGate(G,c,p,()=>kill(G,c,t,'demon')); } },
  diablillo:{ o:31, when:notFirst, f:()=>[P('Elige a quién matar','alive')], run(G,c,p,[t],ok){ if(!ok||!t)return; demonGate(G,c,p,()=>{ if(t===p){ die(G,p,'demon'); if(!demon(G)){ const m=pick(living(G).filter(x=>type(x.role)==='M')); if(m){ changeRole(G,m,'diablillo','E'); note(m,G,'El Diablillo te ha pasado su poder: ahora eres el Demonio.'); } } c.dead.push(p.id);} else kill(G,c,t,'demon');}); } },
  fang_gu:{ o:31, when:notFirst, f:()=>[P('Elige a quién matar')], run(G,c,p,[t],ok){ if(!ok||!t)return; demonGate(G,c,p,()=>{ if(type(t.role)==='O'&&!p.used.fang&&t.alive){ p.used.fang=1; changeRole(G,t,'fang_gu','E'); note(t,G,'Fang Gu ha saltado a ti: ahora eres el Demonio.'); die(G,p,'night'); c.dead.push(p.id);} else kill(G,c,t,'demon');}); } },
  no_dashii:{ o:31, when:notFirst, f:()=>[P('Elige a quién matar')], run(G,c,p,[t],ok){ if(ok&&t) demonGate(G,c,p,()=>kill(G,c,t,'demon')); } },
  vortox:{ o:31, when:notFirst, f:()=>[P('Elige a quién matar')], run(G,c,p,[t],ok){ if(ok&&t) demonGate(G,c,p,()=>kill(G,c,t,'demon')); } },
  po:{ o:31, when:notFirst, f:(G,p)=>p.po?[P('Víctima 1'),P('Víctima 2'),P('Víctima 3')]:[P('A quién matar (o nadie para cargar)','others',true)], run(G,c,p,v,ok){ const ts=v.filter(Boolean); if(!p.po&&!ts.length){ p.po=1; return;} p.po=0; if(ok) demonGate(G,c,p,()=>ts.forEach(t=>kill(G,c,t,'demon'))); } },
  pukka:{ o:31, when:()=>true, f:()=>[P('Elige a quién envenenar')], run(G,c,p,[t],ok){ const prev=G.players[p.prevP]; if(ok&&prev) demonGate(G,c,p,()=>kill(G,c,prev,'demon')); if(ok&&t){ poison(G,t,G.t+1); p.prevP=t.id;} } },
  shabaloth:{ o:31, when:notFirst, f:()=>[P('Primera víctima'),P('Segunda víctima')], run(G,c,p,[a,b],ok){ if(!ok)return; const prev=(p.vict||[]).map(i=>G.players[i]).filter(x=>!x.alive); if(prev.length&&rnd()<.25){ const r=pick(prev); r.alive=true; feed(G,`${nm(r)} ha vuelto de entre los muertos.`,'alert'); } const d0=c.dead.length; demonGate(G,c,p,()=>{ kill(G,c,a,'demon'); kill(G,c,b,'demon');}); p.vict=c.dead.slice(d0);} },
  ojo:{ o:31, when:notFirst, f:G=>[Rf('Nombra un personaje',inScript(G))], run(G,c,p,_,ok,v){ const t=all(G).find(x=>x.role===v[0]&&x.alive); if(ok&&t) demonGate(G,c,p,()=>kill(G,c,t,'demon')); } },
  asesino:{ o:40, when:(G,p)=>notFirst(G)&&!p.used.asesino, f:()=>[P('Víctima (opcional)','others',true)], run(G,c,p,[t],ok){ if(t){ p.used.asesino=1; if(ok) kill(G,c,t,'assassin'); } } },
  padrino:{ o:41, when:G=>G.outsiderDied===G.day&&G.day>0, f:()=>[P('Elige a quién matar')], run(G,c,p,[t],ok){ if(ok&&t) kill(G,c,t,'night'); } },
  acrobata:{ o:42, when:notFirst, run(G,c,p,_,ok){ if(ok&&neighbours(G,p).some(x=>impaired(G,x))) kill(G,c,p,'night'); } },
  apostador:{ o:43, when:notFirst, f:()=>[P('Jugador'),Rf('Su rol exacto',AUTO)], run(G,c,p,[t],ok,v){ if(ok&&t&&t.role!==v[1]) kill(G,c,p,'night'); } },
  hijo_de_la_luna:{ o:44, dead:1, when:(G,p)=>G.moon===p.id, f:()=>[P('Elige a un jugador','alive')], run(G,c,p,[t],ok){ G.moon=null; if(ok&&t&&t.team==='G') kill(G,c,t,'night'); } },
  // información
  cazarrecompensas:{ o:60, when:firstOnly, run(G,c,p){ const e=pick(others(G,p).filter(x=>x.team==='E'))||pick(others(G,p)); say(G,p,()=>`${nm(e)} es malvado.`,()=>`${nm(pick(others(G,p).filter(x=>x.team==='G')))} es malvado.`);} },
  cocinero:{ o:60, when:firstOnly, run(G,c,p){ let n=0; const s=all(G); s.forEach((a,i)=>{ if(regEvil(G,a)&&regEvil(G,s[(i+1)%s.length])) n++; }); say(G,p,()=>`Hay ${n} pares de malvados sentados juntos.`,()=>`Hay ${(n+1)%3} pares de malvados sentados juntos.`);} },
  relojero:{ o:60, when:firstOnly, run(G,c,p){ const d=demon(G), ms=all(G).filter(x=>type(x.role)==='M'); const v=ms.length?Math.min(...ms.map(m=>dist(G,d,m))):1; say(G,p,()=>`El Demonio está a ${v} asientos de su Secuaz más cercano.`,()=>`El Demonio está a ${v+1} asientos de su Secuaz más cercano.`);} },
  abuela:{ o:60, when:firstOnly, run(G,c,p){ const t=pick(others(G,p).filter(x=>type(x.role)==='T'))||pick(others(G,p)); p.grand=t.id; say(G,p,()=>`Tu nieto es ${nm(t)}: ${BY[t.shown].name}.`,()=>`Tu nieto es ${nm(t)}: ${BY[pick(AUTO.filter(r=>type(r)==='T'))].name}.`);} },
  investigador:{ o:60, when:firstOnly, run:(G,c,p)=>pair(G,p,'M','Secuaz') },
  bibliotecario:{ o:60, when:firstOnly, run:(G,c,p)=>pair(G,p,'O','Forastero') },
  lavandera:{ o:60, when:firstOnly, run:(G,c,p)=>pair(G,p,'T','Aldeano') },
  caballero:{ o:60, when:firstOnly, run(G,c,p){ const g=shuffle(others(G,p).filter(x=>!regDemon(G,x))).slice(0,2); const d=demon(G); say(G,p,()=>`${g.map(nm).join(' y ')} no son el Demonio.`,()=>`${shuffle([d,g[0]]).map(x=>nm(x||p)).join(' y ')} no son el Demonio.`);} },
  noble:{ o:60, when:firstOnly, run(G,c,p){ const o=others(G,p), e=o.filter(x=>x.team==='E'), g=o.filter(x=>x.team==='G'); const t=shuffle([pick(e),...shuffle(g).slice(0,2)].filter(Boolean)); say(G,p,()=>`Entre ${t.map(nm).join(', ')}, exactamente uno es malvado.`,()=>`Entre ${shuffle(g).slice(0,3).map(nm).join(', ')}, exactamente uno es malvado.`);} },
  shugenja:{ o:60, when:firstOnly, run(G,c,p){ const n=G.seats.length,i=seatIdx(G,p); let d=0; for(let s=1;s<n;s++){ const r=G.players[G.seats[(i+s)%n]].team==='E', l=G.players[G.seats[(i-s+n)%n]].team==='E'; if(r||l){ d=r&&l?pick([1,-1]):r?1:-1; break;} } const w=x=>x>0?'derecha':'izquierda'; say(G,p,()=>`El malvado más cercano está a tu ${w(d)}.`,()=>`El malvado más cercano está a tu ${w(-d)}.`);} },
  administrador:{ o:60, when:firstOnly, run(G,c,p){ const g=pick(others(G,p).filter(x=>x.team==='G'))||pick(others(G,p)); const e=pick(others(G,p).filter(x=>x.team==='E')); say(G,p,()=>`${nm(g)} es del equipo bueno.`,()=>`${nm(e||g)} es del equipo bueno.`);} },
  aeronauta:{ o:61, when:()=>true, run(G,c,p){ const types=['T','O','M','D'].filter(x=>x!==p.lastT); const t=pick(others(G,p).filter(x=>types.includes(type(x.role))))||pick(others(G,p)); if(!t)return; p.lastT=type(t.role); const lbl={T:'Aldeano',O:'Forastero',M:'Secuaz',D:'Demonio'}; say(G,p,()=>`${nm(t)} es ${lbl[p.lastT]}.`,()=>`${nm(t)} es ${lbl[pick(types)]}.`);} },
  empatico:{ o:61, when:()=>true, run(G,c,p){ const n=neighbours(G,p).filter((x,i,a)=>a.indexOf(x)===i).filter(x=>regEvil(G,x)).length; say(G,p,()=>`${n} de tus vecinos vivos son malvados.`,()=>`${(n+1)%3} de tus vecinos vivos son malvados.`);} },
  adivina:{ o:61, when:()=>true, f:()=>[P('Primer jugador','all'),P('Segundo jugador','all')], run(G,c,p,[a,b]){ if(!a||!b)return; const y=regDemon(G,a)||regDemon(G,b)||[a.id,b.id].includes(G.herring); say(G,p,()=>y?'SÍ: uno de ellos podría ser el Demonio.':'NO: ninguno es el Demonio.',()=>y?'NO: ninguno es el Demonio.':'SÍ: uno de ellos podría ser el Demonio.');} },
  sonador:{ o:61, when:()=>true, f:()=>[P('Elige a un jugador')], run(G,c,p,[t]){ if(!t)return; const good=pick(AUTO.filter(r=>'TO'.includes(type(r)))), bad=pick(AUTO.filter(r=>'MD'.includes(type(r)))); const real=t.role, two=shuffle(t.team==='G'?[real,bad]:[good,real]); say(G,p,()=>`${nm(t)} es ${two.map(r=>BY[r].name).join(' o ')}.`,()=>`${nm(t)} es ${BY[good].name} o ${BY[bad].name}.`);} },
  florista:{ o:61, when:notFirst, run(G,c,p){ const y=G.demonVoted; say(G,p,()=>y?'El Demonio votó ayer.':'El Demonio no votó ayer.',()=>y?'El Demonio no votó ayer.':'El Demonio votó ayer.');} },
  general:{ o:61, when:()=>true, run(G,c,p){ const s=score(G), w=s>=.4?'el malo':s<=.2?'el bueno':'empate'; say(G,p,()=>`Va ganando: ${w}.`,()=>`Va ganando: ${pick(['el malo','el bueno','empate'])}.`);} },
  rey:{ o:61, when:()=>true, run(G,c,p){ const n=living(G).length; say(G,p,()=>`Quedan ${n} jugadores vivos.`,()=>`Quedan ${n+1} jugadores vivos.`);} },
  matematico:{ o:61, when:()=>true, run(G,c,p){ const n=others(G,p).filter(x=>impaired(G,x)).length; say(G,p,()=>`${n} habilidades han fallado.`,()=>`${n+1} habilidades han fallado.`);} },
  oraculo:{ o:61, when:notFirst, run(G,c,p){ const n=all(G).filter(x=>!x.alive&&x.team==='E').length; say(G,p,()=>`Hay ${n} malvados entre los muertos.`,()=>`Hay ${n+1} malvados entre los muertos.`);} },
  pregonero:{ o:61, when:notFirst, run(G,c,p){ const y=G.minionNom; say(G,p,()=>y?'Un Secuaz nominó ayer.':'Ningún Secuaz nominó ayer.',()=>y?'Ningún Secuaz nominó ayer.':'Un Secuaz nominó ayer.');} },
  sepulturero:{ o:61, when:G=>notFirst(G)&&!!G.execYesterday, run(G,c,p){ const t=G.players[G.execYesterday]; say(G,p,()=>`${nm(t)} era ${BY[t.role].name}.`,()=>`${nm(t)} era ${BY[pick(AUTO)].name}.`);} },
  suma_sacerdotisa:{ o:61, when:()=>true, run(G,c,p){ const pool=others(G,p), good=pool.filter(x=>x.team==='G'), t=pick(evilAhead(G)?good:pool)||pick(pool); if(t) note(p,G,`Deberías hablar con ${nm(t)}.`);} },
  tonto_del_pueblo:{ o:61, when:()=>true, f:()=>[P('Elige a un jugador')], run(G,c,p,[t]){ if(!t)return; if(rnd()<.2) poison(G,p,G.t); const e=regEvil(G,t); say(G,p,()=>`${nm(t)} ${e?'ES':'NO es'} malvado.`,()=>`${nm(t)} ${e?'NO es':'ES'} malvado.`);} },
  costurera:{ o:61, when:once('costurera'), f:()=>[P('Primer jugador','others',true),P('Segundo jugador','others',true)], run(G,c,p,[a,b]){ if(!a||!b)return; p.used.costurera=1; const y=regEvil(G,a)===regEvil(G,b); say(G,p,()=>y?'Son del mismo equipo.':'Son de equipos distintos.',()=>y?'Son de equipos distintos.':'Son del mismo equipo.');} },
  artista:{ o:61, when:once('artista'), f:()=>[P('Pregunta (opcional): este jugador…','others',true),{k:'c',label:'…',opts:claims,opt:true}], run(G,c,p,[t],ok,v){ if(!t||!claims[v[1]])return; p.used.artista=1; const y=claimTrue(G,t,v[1]); say(G,p,()=>`¿${nm(t)} ${claims[v[1]]}? ${y?'SÍ':'NO'}.`,()=>`¿${nm(t)} ${claims[v[1]]}? ${y?'NO':'SÍ'}.`);} },
  sereno:{ o:61, when:once('sereno'), f:()=>[P('Jugador al que confirmarte (opcional)','others',true)], run(G,c,p,[t],ok){ if(!t)return; p.used.sereno=1; if(ok) note(t,G,`El Narrador confirma: ${nm(p)} es el Sereno.`);} },
  cazador:{ o:61, when:once('cazador'), f:()=>[P('Busca a la Damisela (opcional)','others',true)], run(G,c,p,[t],ok){ if(!t)return; p.used.cazador=1; if(ok&&t.role==='damisela'){ const f=NOT_IN_PLAY_GOOD(G).filter(r=>type(r)==='T'); if(f.length){ changeRole(G,t,pick(f),'G'); note(t,G,`Te han encontrado: ahora eres ${BY[t.role].name}.`);} } } },
  filosofo:{ o:5, when:once('filosofo'), f:G=>[Rf('Personaje bueno a copiar (opcional)',NOT_IN_PLAY_GOOD(G),true)], run(G,c,p,_,ok,v){ if(!v[0])return; p.used.filosofo=1; if(ok&&A[v[0]]){ p.ab=v[0]; note(p,G,`Has adquirido la habilidad de ${BY[v[0]].name}.`);} } },
  profesor:{ o:50, when:(G,p)=>once('profesor')(G,p)&&notFirst(G)&&all(G).some(x=>!x.alive&&type(x.role)==='T'), f:()=>[P('Aldeano a resucitar (opcional)','deadT',true)], run(G,c,p,[t],ok){ if(!t)return; p.used.profesor=1; if(ok&&!t.alive){ t.alive=true; feed(G,`${nm(t)} ha vuelto a la vida.`,'alert');} } },
};
function pair(G, p, cl, word) {
  const o = others(G, p), ts = all(G).filter(x => type(x.role) === cl && x.id !== p.id);
  if (!ts.length) return say(G, p, () => `No hay ${word === 'Forastero' ? 'Forasteros' : word + 's'} en juego.`, () => `${nm(pick(o))} o ${nm(pick(o))} es ${BY[pick(AUTO.filter(r => type(r) === cl))].name}.`);
  const t = pick(ts), x = pick(o.filter(q => q !== t)) || t, two = shuffle([t, x]).map(nm).join(' o ');
  const f = shuffle(o).slice(0, 2).map(nm).join(' o ');
  say(G, p, () => `${two} es ${BY[t.role].name}.`, () => `${f} es ${BY[pick(AUTO.filter(r => type(r) === cl))].name}.`);
}
function grim(G, p) { note(p, G, 'Hoja del Narrador: ' + all(G).map(x => `${nm(x)}: ${BY[x.role].name}`).join(' · ')); }
function demonGate(G, c, p, fn) { if (c.exorcised === p.id || G.noKill) return; fn(); }
A.espectro = { ...A.envenenador, dead: 1 };
const leviatanNote = G => { const l = all(G).find(p => p.role === 'leviatan'); if (l && !G.levSaid) { G.levSaid = 1; feed(G, 'El Leviatán acecha: el pueblo tiene 5 días y no debe ejecutar a un inocente.', 'alert'); } };

const ORDER = Object.keys(A).sort((a, b) => A[a].o - A[b].o);
const dead = (G, p) => !p.alive && A[p.ab]?.dead;

// ── Fases ────────────────────────────────────────────────────────────────
function promptFor(G, p) {
  const a = A[p.ab], active = (p.alive || dead(G, p)) && a?.f && a.when(G, p);
  if (active) return { fields: a.f(G, p), title: `Acción de ${BY[p.ab].name}` };
  return { fields: [P('¿De quién sospechas esta noche?', 'all', true)], title: 'Observa en silencio', decoy: true };
}
function startNight(G, now) {
  G.phase = 'NIGHT'; G.night++; G.t++; G.vote = null; G.sleep = []; G.dawn = ''; G.hints = null;
  for (const p of all(G)) { p.card = []; p.choice = null; p.prompt = promptFor(G, p); p.ready = false; }
  G.phaseEnd = now + G.cfg.nightSec * 1000;
}
const pool = (G, p, f) => (f.pool === 'alive' ? living(G) : f.pool === 'all' ? all(G) : f.pool === 'deadT' ? all(G).filter(x => !x.alive && type(x.role) === 'T') : others(G, p));
function complete(G, p) {
  const { fields, decoy } = p.prompt, v = p.choice ? [...p.choice] : [];
  fields.forEach((f, i) => {
    if (v[i] || f.opt || decoy) return;
    if (f.k === 'p') v[i] = pick(pool(G, p, f).filter(x => !v.includes(x.id)))?.id ?? null;
    else if (f.k === 'r') v[i] = pick(f.set);
    else v[i] = pick(Object.keys(f.opts));
  });
  return v;
}
export function resolveNight(G, now) {
  const c = { safe: [], dead: [], bounced: false, exorcised: null };
  G.phase = 'NIGHT';
  const queue = all(G).filter(p => { const a = A[p.ab]; return a && (p.alive || a.dead) && (a.f ? !p.prompt.decoy : a.when(G, p)); });
  const firstHit = {};
  const plan = queue.map(p => { const a = A[p.ab], v = a.f ? complete(G, p) : []; const players = v.map((x, i) => a.f && p.prompt.fields[i]?.k === 'p' ? G.players[x] : undefined); return { p, a, v, players }; })
    .sort((x, y) => x.a.o - y.a.o);
  for (const it of plan) for (const t of it.players) if (t?.ab === 'maton' && t.alive && !firstHit[t.id]) { firstHit[t.id] = 1; if (works(G, t)) t.team = it.p.team; }
  for (const it of plan) {
    if (G.over) break;
    if (it.a.late) continue;
    if (!it.p.alive && !it.a.dead) continue;
    it.a.run(G, c, it.p, it.players, works(G, it.p), it.v);
    checkWin(G);
  }
  for (const it of plan) if (it.a.late && !G.over) it.a.run(G, c, it.p, it.players, works(G, it.p), it.v);
  G.noKill = false;
  if (G.gossip && !G.over) { G.gossip = false; const t = pick(living(G)); if (t) { kill(G, c, t, 'night'); } }
  const names = [...new Set(c.dead)].map(id => nm(G.players[id]));
  G.lastDead = names;
  G.dawn = names.length ? `Han muerto durante la noche: ${names.join(', ')}.` : 'Esta noche no ha muerto nadie.';
  for (const p of all(G)) if (!p.card.length) p.card.push(pick(['La noche pasa sin novedades.', 'No has visto nada extraño.', 'Solo escuchas el viento.']));
  checkWin(G);
  if (G.over) feed(G, G.dawn, 'dawn');
  if (!G.over) { G.phase = 'REVEAL'; G.phaseEnd = now + REVEAL_MS; }
}
function startDay(G, now) {
  G.phase = 'DAY'; G.day++; G.t++; G.nominators = []; G.nominated = []; G.top = 0; G.block = null; G.sleep = []; G.vote = null; G.executed = null;
  G.demonVoted = false; G.minionNom = false; G.harpyVoted = false; G.harpyNom = false;
  feed(G, `Amanece el día ${G.day}. ${G.dawn}`, 'dawn');
  leviatanNote(G);
  for (const p of living(G)) if (p.ab === 'erudito') { const t = statement(G, true), f = statement(G, false), [a, b] = shuffle([t, f]); say(G, p, () => `Una es cierta: «${a}» / «${b}»`, () => `Una es cierta: «${f}» / «${statement(G, false)}»`); }
  for (const p of all(G)) if (p.ab === 'hojalatero' && p.alive && G.day >= 2 && narr(G, .12)) { die(G, p, 'day'); feed(G, `${nm(p)} ha caído de repente.`, 'alert'); }
  checkWin(G);
  if (!G.over) G.phaseEnd = now + G.cfg.daySec * 1000;
}
function closeVote(G, now) {
  const v = G.vote; G.vote = null;
  const t = G.players[v.target], need = Math.ceil(living(G).length / 2);
  const hands = all(G).filter(p => {
    let up = v.hands.includes(p.id) || (p.ab === 'fanatico' && p.alive && works(G, p));
    if (!up) return false;
    if (!p.alive && p.ghost <= 0) return false;
    if (p.ab === 'mayordomo' && works(G, p) && p.master && !v.hands.includes(p.master)) return false;
    return true;
  });
  hands.forEach(p => { if (!p.alive) p.ghost--; if (isDemon(p)) G.demonVoted = true; });
  if (G.harpy && G.harpy.b === t.id) { G.harpyNom = true; if (v.hands.includes(G.harpy.a)) G.harpyVoted = true; }
  const n = hands.length, secret = living(G).some(p => p.ab === 'organillero' && works(G, p));
  feed(G, secret ? `${nm(t)} recibe ${n} de ${need} votos necesarios.` : `${nm(t)} recibe ${n} votos (${hands.map(nm).join(', ') || 'nadie'}). Hacían falta ${need}.`);
  if (n >= need && n > G.top) { G.top = n; G.block = t.id; feed(G, `${nm(t)} va a la horca si nadie le supera.`, 'alert'); }
  else if (n >= need && n === G.top) { G.block = null; feed(G, 'Empate: nadie irá a la horca salvo que alguien supere esa cifra.', 'alert'); }
  G.phaseEnd = Math.max(G.phaseEnd, now + 20000);
}
function endDay(G, now) {
  if (G.vote) closeVote(G, now);
  for (const p of all(G)) if (p.must === 'torpe') { p.must = null; torpe(G, p, pick(living(G))); }
  G.sleep = [];
  if (!G.executed) G.execYesterday = null;
  const t = G.block ? G.players[G.block] : null;
  if (G.mm && G.day >= G.mm) { G.over = t ? { winner: 'E', reason: 'La Mente Maestra aprovechó su último día: otra ejecución dio la victoria al Mal.' } : { winner: 'G', reason: 'El día extra de la Mente Maestra terminó sin ejecución.' }; finish(G); return; }
  if (t) execute(G, t); else { feed(G, 'Hoy no hay ejecución.'); const m = living(G).length === 3 && has(G, 'alcalde'); if (m) win(G, 'G', 'Quedaban 3 jugadores, no hubo ejecución y el Alcalde mantuvo la paz.'); }
  if (G.harpy && G.harpyNom && !G.harpyVoted) { const a = G.players[G.harpy.a]; if (a.alive) { die(G, a, 'day'); feed(G, `${nm(a)} no obedeció a la Arpía y muere.`, 'alert'); } } G.harpy = null;
  if (G.day >= 5 && all(G).some(p => p.role === 'leviatan' && p.alive)) win(G, 'E', 'Han pasado 5 días y el Leviatán sigue vivo.');
  if (!demon(G) && !G.mm && (G.noDemonDays = (G.noDemonDays || 0) + 1) >= 3) G.twinOver = true; // el gemelo solo aguanta 3 días sin Demonio
  checkWin(G);
  if (!G.over) { G.phase = 'DUSK'; G.phaseEnd = now + DUSK_MS; }
}
function execute(G, t) {
  if (t.ab === 'visir' && works(G, t) && t.alive) { feed(G, `${nm(t)} es el Visir y no puede morir ejecutado.`); return; }
  if (G.advocate === t.id) { feed(G, `${nm(t)} sube al patíbulo, pero sobrevive misteriosamente.`, 'alert'); G.advocate = null; return; }
  if (t.team === 'G' && has(G, 'pacifista') && narr(G, .4)) { feed(G, `${nm(t)} sube al patíbulo, pero sobrevive misteriosamente.`, 'alert'); return; }
  if (t.ab === 'tonto' && works(G, t) && !t.used.tonto) { t.used.tonto = 1; feed(G, `${nm(t)} sube al patíbulo, pero sobrevive misteriosamente.`, 'alert'); return; }
  if (t.role === 'sanguijuela' && G.players[t.leech]?.alive) { feed(G, `${nm(t)} sube al patíbulo, pero no muere.`, 'alert'); return; }
  G.executed = G.execYesterday = t.id;
  const wasMM = isDemon(t) && has(G, 'mente_maestra');
  const ok = works(G, t), wasAlive = t.alive;
  die(G, t, 'exec');
  feed(G, `${nm(t)} ha sido ejecutado.`, 'death');
  if (wasMM && !G.mm) G.mm = G.day + 1;
  if (t.ab === 'santo' && ok) return win(G, 'E', `${nm(t)} era el Santo: su ejecución condena al pueblo.`);
  if (t.role === 'goblin') return win(G, 'E', `${nm(t)} era el Goblin: su ejecución da la victoria al Mal.`);
  if (G.alarm === t.id) return win(G, 'E', `El pueblo ejecutó al objetivo de la Alarmista.`);
  if (t.role === 'boomdandy' && ok) { const v = shuffle(living(G)); v.slice(3).forEach(x => die(G, x, 'day')); feed(G, 'Boomdandy explota: solo quedan 3 en pie.', 'alert'); }
  if (all(G).some(p => p.role === 'leviatan' && p.alive && works(G, p)) && t.team === 'G') return win(G, 'E', 'El Leviatán se alimenta de la sangre inocente.');
  const gem = all(G).find(p => p.ab === 'gemelo_malvado' && p.alive); if (gem && gem.twin === t.id && works(G, gem)) return win(G, 'E', 'El gemelo bueno ha sido ejecutado.');
  if (t.ab === 'princesa' && G.princess === G.day) G.noKill = true;
  if (t.ab === 'hijo_de_la_luna' && ok) G.moon = t.id;
  if ('MD'.includes(type(t.role)) && has(G, 'juglar')) all(G).filter(p => 'MD'.includes(type(p.role))).forEach(p => poison(G, p, G.t + 1));
  const can = has(G, 'canibal') || living(G).find(p => p.role === 'canibal' && works(G, p));
  if (can) { can.ab = t.team === 'G' && A[t.ab] ? t.ab : 'canibal'; if (can.ab !== 'canibal') note(can, G, `Has devorado la habilidad de ${BY[t.ab].name}.`); }
}
function torpe(G, p, t) { if (!t) return; feed(G, `${nm(p)}, el Torpe, señala a ${nm(t)}.`, 'alert'); if (t.team === 'E' && p.team === 'G') win(G, 'E', 'El Torpe señaló a un malvado.'); }
function win(G, w, reason) {
  if (G.over) return;
  if (w === 'G' && !G.twinOver && all(G).some(p => p.ab === 'gemelo_malvado' && p.alive && G.players[p.twin]?.alive)) return;
  if (has(G, 'hereje')) { w = w === 'G' ? 'E' : 'G'; reason += ' Pero el Hereje invierte el resultado.'; }
  G.over = { winner: w, reason }; finish(G);
}
function finish(G) { G.phase = 'OVER'; G.vote = null; G.phaseEnd = 0; }
export function checkWin(G) {
  if (G.over) return true;
  if (!demon(G)) { if (G.mm && G.day <= G.mm) return false; win(G, 'G', 'El Demonio ha sido destruido.'); }
  else if (living(G).length <= 2) win(G, 'E', 'Solo quedan 2 jugadores y el Demonio sigue vivo.');
  if (!G.over && !demon(G) && !G.mm && living(G).length <= 2) win(G, 'E', 'El pueblo ha quedado desolado.');
  return !!G.over;
}

// Acciones de día
function dayActs(G, p) {
  const out = [];
  if (G.phase !== 'DAY' || G.vote) { if (p.ab === 'visir' && p.alive && G.vote && !p.used.visir) out.push({ id:'visir', label:'Forzar la ejecución', fields:[] }); return out; }
  if (p.must === 'torpe') out.push({ id:'torpe', label:'Eres el Torpe: señala a un jugador', fields:[P('Jugador vivo','alive')] });
  if (!p.alive) return out;
  if (p.shown === 'cazademonios' && !p.used.caza) out.push({ id:'caza', label:'Cazademonios: disparar en público', fields:[P('Jugador')] });
  if (p.shown === 'princesa' && !p.used.princesa) out.push({ id:'princesa', label:'Revelar a la Princesa en público', fields:[] });
  if (p.shown === 'pescador' && !p.used.pescador) out.push({ id:'pescador', label:'Pedir consejo al Narrador', fields:[] });
  if (p.shown === 'cotilla' && !p.used['cotilla' + G.day]) out.push({ id:'cotilla', label:'Hacer una afirmación pública', fields:[P('Afirmo que','all'),{ k:'c', label:'…', opts:claims }] });
  if (p.shown === 'malabarista' && G.day === 1 && !p.used.mal) out.push({ id:'mal', label:'Adivinar roles en público', fields:[1,2,3].flatMap(i => [P(`Jugador ${i}`,'others',i>1),Rf(`Rol ${i}`,AUTO,i>1)]) });
  if (p.shown === 'maestro_de_los_acertijos' && !p.used.ma) out.push({ id:'ma', label:'Adivinar quién es el Demonio', fields:[P('Jugador')] });
  if (p.ab === 'duendecillo' && !p.used.duen && G.players[p.pixie] && !G.players[p.pixie].alive) out.push({ id:'duen', label:`Reclamar la habilidad de ${BY[G.players[p.pixie].shown].name}`, fields:[] });
  if (type(p.role) === 'M' && p.role !== 'marioneta' && !p.used.dam) out.push({ id:'dam', label:'Adivinar quién es la Damisela', fields:[P('Jugador')] });
  return out;
}
function doDay(G, p, a, v, now) {
  const by = i => G.players[v[i]];
  switch (a) {
    case 'torpe': { p.must = null; torpe(G, p, by(0)); break; }
    case 'caza': { p.used.caza = 1; const t = by(0); feed(G, `${nm(p)} señala a ${nm(t)} como el Demonio.`, 'alert'); if (works(G, p) && regDemon(G, t) && t.alive) { die(G, t, 'day'); feed(G, `¡${nm(t)} cae fulminado!`, 'death'); } else feed(G, 'No ocurre nada.'); break; }
    case 'princesa': { p.used.princesa = 1; feed(G, `${nm(p)} se declara Princesa.`, 'alert'); if (works(G, p)) G.princess = G.day; break; }
    case 'pescador': { p.used.pescador = 1; say(G, p, () => statement(G, true), () => statement(G, false)); break; }
    case 'cotilla': { p.used['cotilla' + G.day] = 1; const t = by(0); feed(G, `${nm(p)} afirma: ${nm(t)} ${claims[v[1]] ?? ''}.`, 'alert'); if (works(G, p) && claims[v[1]] && claimTrue(G, t, v[1])) G.gossip = true; break; }
    case 'mal': { p.used.mal = 1; let n = 0; for (let i = 0; i < v.length; i += 2) if (v[i] && v[i + 1] && G.players[v[i]]?.role === v[i + 1]) n++; feed(G, `${nm(p)} hace malabares con sus sospechas.`); say(G, p, () => `Aciertos: ${n}.`, () => `Aciertos: ${n + 1}.`); break; }
    case 'ma': { p.used.ma = 1; const t = by(0); if (isDemon(t)) note(p, G, `Correcto: ${nm(t)} es el Demonio.`); else note(p, G, 'El Narrador guarda silencio.'); break; }
    case 'duen': { p.used.duen = 1; const c = G.players[p.pixie]; if (works(G, p) && A[c.ab]) { p.ab = c.ab; note(p, G, `Has reclamado la habilidad de ${BY[c.ab].name}.`); } break; }
    case 'dam': { p.used.dam = 1; const t = by(0); if (t.role === 'damisela' && t.alive && works(G, t)) win(G, 'E', `${nm(p)} ha encontrado a la Damisela.`); break; }
    case 'visir': { p.used.visir = 1; G.block = G.vote.target; G.top = 99; feed(G, `${nm(p)}, el Visir, ordena la ejecución de ${nm(G.players[G.vote.target])}.`, 'alert'); closeVote(G, now); break; }
  }
  checkWin(G);
}

// API para el anfitrión ───────────────────────────────────────────────────
export function act(G, pid, m, now = Date.now()) {
  const p = G.players[pid]; if (!p) return 'No estás en la partida.';
  if (m.type === 'ready') { if (G.phase === 'ROLES') p.ready = true; return; }
  if (m.type === 'choose') {
    if (G.phase !== 'NIGHT' || !Array.isArray(m.values)) return 'Ahora no.';
    const f = p.prompt.fields; if (m.values.length > f.length) return 'Elección inválida.';
    for (let i = 0; i < m.values.length; i++) { const v = m.values[i]; if (v == null || v === '') continue;
      if (f[i].k === 'p' ? !pool(G, p, f[i]).some(x => x.id === v) : f[i].k === 'r' ? !f[i].set.includes(v) : !f[i].opts[v]) return 'Elección inválida.'; }
    p.choice = m.values.map(v => v || null); return;
  }
  if (m.type === 'nominate') {
    if (G.phase !== 'DAY' || G.vote) return 'No se puede nominar ahora.';
    const t = G.players[m.target]; if (!t) return 'Jugador desconocido.';
    if (!p.alive) return 'Los muertos no nominan.';
    if (G.nominators.includes(pid)) return 'Ya has nominado hoy.';
    if (G.nominated.includes(t.id)) return 'Ya ha sido nominado hoy.';
    G.nominators.push(pid); G.nominated.push(t.id);
    if (type(p.role) === 'M') G.minionNom = true;
    feed(G, `${nm(p)} nomina a ${nm(t)}.`);
    if (p.cursed === G.day && !impaired(G, p)) { die(G, p, 'day'); feed(G, `${nm(p)} cae fulminado por una maldición.`, 'death'); if (checkWin(G)) return; }
    if (p.alive && p.ab === 'golem' && works(G, p) && !p.used.golem) { p.used.golem = 1; if (type(t.role) === 'T' && t.alive) { die(G, t, 'day'); feed(G, `El Gólem aplasta a ${nm(t)}.`, 'death'); if (checkWin(G)) return; } }
    if (t.ab === 'virgen' && works(G, t) && !t.used.virgen) { t.used.virgen = 1; if (type(p.role) === 'T') { feed(G, `La pureza de ${nm(t)} condena a ${nm(p)}.`, 'alert'); G.block = null; execute(G, p); if (checkWin(G)) return; endDay(G, now); return; } }
    G.vote = { target: t.id, by: pid, hands: [], seen: [], end: now + G.cfg.voteSec * 1000 };
    return;
  }
  if (m.type === 'hand') {
    if (!G.vote) return 'No hay votación.';
    if (!p.alive && p.ghost <= 0) return 'Ya no te quedan votos.';
    G.vote.hands = G.vote.hands.filter(x => x !== pid); if (m.up) G.vote.hands.push(pid);
    if (!G.vote.seen.includes(pid)) G.vote.seen.push(pid); return;
  }
  if (m.type === 'sleep') { if (G.phase === 'DAY' && p.alive && !G.sleep.includes(pid)) G.sleep.push(pid); return; }
  if (m.type === 'day') { const a = dayActs(G, p).find(x => x.id === m.id); if (!a) return 'Esa acción no está disponible.';
    const v = m.values || []; for (const [i, f] of a.fields.entries()) if (!v[i] && !f.opt) return 'Completa la acción.';
    doDay(G, p, a.id, v, now); return; }
  return 'Acción desconocida.';
}
export function tick(G, now = Date.now()) {
  if (G.phase === 'OVER') return false;
  if (G.phase === 'ROLES') { if (now >= G.phaseEnd || all(G).every(p => p.ready)) { startNight(G, now); return true; } return false; }
  if (G.phase === 'NIGHT') { if (now >= G.phaseEnd) { return 'NIGHT_END'; } return false; }
  if (G.phase === 'REVEAL') { if (now >= G.phaseEnd) { startDay(G, now); return true; } return false; }
  if (G.phase === 'DUSK') { if (now >= G.phaseEnd) { startNight(G, now); return true; } return false; }
  if (G.phase === 'DAY') {
    if (G.vote) { const need = living(G).length + all(G).filter(p => !p.alive && p.ghost > 0).length; if (now >= G.vote.end || G.vote.seen.length >= need) { closeVote(G, now); checkWin(G); return true; } return false; }
    if (now >= G.phaseEnd || G.sleep.length > living(G).length / 2) { endDay(G, now); return true; }
  }
  return false;
}

// Lo ÚNICO que sale del anfitrión hacia cada jugador.
export function viewFor(G, pid, now = Date.now()) {
  const p = G.players[pid] || null, secret = G.vote && living(G).some(x => x.ab === 'organillero' && works(G, x));
  const view = {
    code: G.code, phase: G.phase, night: G.night, day: G.day, left: Math.max(0, (G.vote ? G.vote.end : G.phaseEnd) - now),
    seats: all(G).map(x => ({ id: x.id, name: x.name, alive: x.alive, ghost: x.ghost > 0 })),
    feed: G.feed.slice(-30), block: G.block, top: G.top, need: Math.ceil(living(G).length / 2), nominators: G.nominators, nominated: G.nominated, sleep: G.sleep.length,
    vote: G.vote && { target: G.vote.target, by: G.vote.by, hands: secret ? G.vote.hands.filter(i => i === pid) : G.vote.hands, secret: !!secret },
    over: G.over ? { ...G.over, reveal: all(G).map(x => ({ id: x.id, name: x.name, role: BY[x.role].name, team: x.team, alive: x.alive, type: type(x.role) })) } : null,
  };
  if (p) view.you = { id: p.id, role: p.shown, roleName: BY[p.shown].name, roleText: BY[p.shown].text, type: type(p.shown), team: p.shownTeam, alive: p.alive, ghost: p.ghost, diary: p.diary, ready: p.ready,
    prompt: G.phase === 'NIGHT' ? strip(G, p, p.prompt) : null, choice: p.choice, card: G.phase === 'REVEAL' ? p.card : null, acts: dayActs(G, p).map(a => ({ ...a, fields: a.fields.map(f => cleanF(G, p, f)) })) };
  return view;
}
function opts(G, p, f) { return f.k === 'p' ? { ...f, ids: pool(G, p, f).map(x => x.id) } : f.k === 'r' ? { ...f, options: f.set.map(r => [r, BY[r].name]) } : { ...f, options: Object.entries(f.opts) }; }
const cleanF = (G, p, f) => { const { set, ...o } = opts(G, p, f); return o; };
const strip = (G, p, pr) => pr && { title: pr.title, fields: pr.fields.map(f => cleanF(G, p, f)) };

// Bots para probar sin 5 móviles y para las simulaciones.
export function botAct(G, pid, now = Date.now()) {
  const p = G.players[pid]; const r = rnd();
  if (G.phase === 'NIGHT' && !p.choice) { p.choice = complete(G, p); return; }
  if (G.phase !== 'DAY') return;
  if (G.vote) { if (r < .45 && (p.alive || p.ghost > 0)) act(G, pid, { type: 'hand', up: true }, now); return; }
  const a = dayActs(G, p);
  if (a.length && r < .3) { const x = pick(a); act(G, pid, { type: 'day', id: x.id, values: x.fields.map(f => opts(G, p, f)).map(f => f.ids ? pick(f.ids) : pick(f.options)?.[0]) }, now); return; }
  if (r < .35 && p.alive) { const t = pick(all(G).filter(x => !G.nominated.includes(x.id))); if (t) act(G, pid, { type: 'nominate', target: t.id }, now); return; }
  if (r < .7) act(G, pid, { type: 'sleep' }, now);
}
export { startNight, living };
