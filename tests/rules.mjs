// Comprueba reglas concretas con repartos forzados.
import assert from 'node:assert/strict';
import { newGame, act, tick, viewFor, resolveNight, BY, DIST, startNight } from '../js/engine.js';
const cfg = { script: 'full', nightSec: 30, daySec: 60, voteSec: 8 };
function game(roles) {
  const list = roles.map((_, i) => ({ id: 'p' + i, name: 'J' + i }));
  const G = newGame(list, cfg, 'T');
  roles.forEach((r, i) => { const p = G.players['p' + i]; const base = r.replace('!', ''); p.role = p.ab = p.shown = base; p.team = 'MD'.includes(BY[base].team) ? 'E' : 'G'; p.shownTeam = p.team; p.fake = false; p.eff = []; p.diary = []; p.card = []; p.used = {}; p.ready = true; });
  G.bluffs = []; G.feed = []; G.herring = null; return G;
}
let now = 1e12;
const night = (G, ch = {}) => { if (G.phase !== 'NIGHT') { startNight(G, now); } for (const [k, v] of Object.entries(ch)) assert.equal(act(G, k, { type: 'choose', values: v }, now), undefined, 'choose ' + k); resolveNight(G, now); };
const toDay = G => { now += 2e4; tick(G, now); };
const vote = (G, by, t, hands) => { assert.equal(act(G, by, { type: 'nominate', target: t }, now), undefined); hands.forEach(h => act(G, h, { type: 'hand', up: true }, now)); now += 2e4; tick(G, now); };
const endDay = G => { now += 3e5; tick(G, now); };
const T = ['monje','soldado','cocinero','empatico','oraculo'];
let n = 0; const ok = (name, fn) => { fn(); n++; console.log(' ✓', name); };

ok('tabla oficial de reparto 5–15', () => { const want = { 5:[3,0,1,1],7:[5,0,1,1],10:[7,0,2,1],12:[7,2,2,1],15:[9,2,3,1] }; for (const k in want) assert.deepEqual(DIST[k], want[k]); for (let i = 5; i <= 15; i++) assert.equal(DIST[i].reduce((a, b) => a + b), i); });
ok('Borracho se cree Aldeano y no ve su rol real', () => { for (let i = 0; i < 300; i++) { const G = newGame(Array.from({ length: 9 }, (_, k) => ({ id: 'p' + k, name: 'J' + k })), cfg, 'T'); for (const p of Object.values(G.players)) if (p.role === 'borracho') { const v = viewFor(G, p.id); assert.notEqual(v.you.role, 'borracho'); assert.equal(BY[v.you.role].team, 'T'); assert.equal(v.you.team, 'G'); } } });
ok('Diablillo mata; el Monje protege; el Soldado resiste', () => {
  let G = game(['diablillo','envenenador','monje','soldado','cocinero','empatico','virgen']); G.night = 1;
  night(G, { p0: ['p4'], p1: ['p5'], p2: ['p4'] }); assert.equal(G.players.p4.alive, true);
  G = game(['diablillo','envenenador','monje','soldado','cocinero','empatico','virgen']); G.night = 1;
  night(G, { p0: ['p3'], p1: ['p2'], p2: ['p6'] }); assert.equal(G.players.p3.alive, true);
  G = game(['diablillo','envenenador','monje','soldado','cocinero','empatico','virgen']); G.night = 1;
  night(G, { p0: ['p6'], p1: ['p2'], p2: ['p6'] }); assert.equal(G.players.p6.alive, false, 'Monje envenenado no protege'); });
ok('Veneno: el Empático envenenado recibe dato falso', () => { const G = game(['diablillo','envenenador','empatico','monje','santo']); G.night = 1; G.seats = ['p0','p2','p1','p3','p4']; night(G, { p1: ['p2'], p0: ['p3'] }); assert.doesNotMatch(G.players.p2.card.join(), /^2 de tus/); /* la verdad es 2 */ });
ok('Pase del Diablillo a un Secuaz', () => { const G = game(['diablillo','envenenador',...T]); G.night = 1; night(G, { p0: ['p0'], p1: ['p2'] }); assert.equal(G.over, null); assert.equal(G.players.p1.role, 'diablillo'); });
ok('Mujer Escarlata hereda con 5+ vivos', () => { const G = game(['diablillo','mujer_escarlata',...T]); toDayNom(G); vote(G, 'p2', 'p0', ['p1','p2','p3','p4']); endDay(G); assert.equal(G.over, null); assert.equal(G.players.p1.role, 'diablillo'); });
function toDayNom(G) { G.night = 0; startNight(G, now); act(G, 'p1', { type: 'choose', values: ['p0'] }, now); resolveNight(G, now); toDay(G); G.players.p0.eff = []; }
ok('Ejecutar al Demonio da la victoria al Bien', () => { const G = game(['diablillo','envenenador',...T]); toDayNom(G); vote(G, 'p2', 'p0', ['p2','p3','p4','p5']); endDay(G); assert.equal(G.over.winner, 'G'); });
ok('Umbral: mitad de vivos redondeada arriba; empate no ejecuta', () => { const G = game(['diablillo','envenenador',...T]); toDayNom(G); vote(G, 'p2', 'p3', ['p1','p2']); assert.equal(G.block, null); vote(G, 'p4', 'p5', ['p1','p2','p3','p4']); assert.equal(G.block, 'p5'); vote(G, 'p5', 'p6', ['p1','p2','p3','p4']); assert.equal(G.block, null); endDay(G); assert.equal(G.players.p5.alive, true); });
ok('Solo una nominación por persona y día; los muertos no nominan', () => { const G = game(['diablillo','envenenador',...T]); toDayNom(G); vote(G, 'p2', 'p3', []); assert.match(act(G, 'p2', { type: 'nominate', target: 'p4' }, now), /Ya has/); assert.match(act(G, 'p4', { type: 'nominate', target: 'p3' }, now), /Ya ha sido/); G.players.p4.alive = false; assert.match(act(G, 'p4', { type: 'nominate', target: 'p5' }, now), /muertos/); });
ok('Voto fantasma: una sola vez', () => { const G = game(['diablillo','envenenador',...T]); toDayNom(G); G.players.p2.alive = false; vote(G, 'p3', 'p4', ['p2']); assert.equal(G.players.p2.ghost, 0); assert.ok(G.nominated.includes('p4')); act(G, 'p4', { type: 'nominate', target: 'p5' }, now); assert.match(act(G, 'p2', { type: 'hand', up: true }, now), /no te quedan/); });
ok('Virgen ejecuta al Aldeano que la nomina', () => { const G = game(['diablillo','envenenador','monje','virgen','cocinero','empatico','soldado']); toDayNom(G); act(G, 'p2', { type: 'nominate', target: 'p3' }, now); assert.equal(G.players.p2.alive, false); assert.equal(G.phase, 'DUSK'); });
ok('Santo ejecutado: gana el Mal', () => { const G = game(['diablillo','envenenador','santo','monje','cocinero','empatico','virgen']); toDayNom(G); vote(G, 'p3', 'p2', ['p1','p3','p4','p5']); endDay(G); assert.equal(G.over.winner, 'E'); });
ok('Quedan 2 con Demonio vivo: gana el Mal', () => { const G = game(['diablillo','envenenador',...T]); ['p2','p3','p4','p5'].forEach(p => G.players[p].alive = false); G.night = 1; night(G, { p0: ['p6'], p1: ['p6'] }); assert.equal(G.over.winner, 'E'); });
ok('Alcalde: 3 vivos sin ejecución gana el Bien', () => { const G = game(['diablillo','envenenador','alcalde','monje','cocinero','empatico','virgen']); toDayNom(G); ['p1','p3','p4','p5'].forEach(p => G.players[p].alive = false); endDay(G); assert.equal(G.over.winner, 'G'); });
ok('Secuaces y Demonio se conocen; Aldeanos no', () => { const G = newGame(Array.from({ length: 8 }, (_, k) => ({ id: 'p' + k, name: 'J' + k })), { ...cfg, script: 'basic' }, 'T'); const d = Object.values(G.players).find(p => BY[p.role].team === 'D'); assert.match(d.diary[0].text, /Secuaces/); for (const p of Object.values(G.players)) if (BY[p.role].team === 'T') assert.ok(!p.diary.some(x => /Demonio es/.test(x.text))); });
ok('Trampas rechazadas: elegir un id ajeno al formulario', () => { const G = game(['diablillo','envenenador',...T]); G.night = 1; startNight(G, now); assert.match(act(G, 'p0', { type: 'choose', values: ['nadie'] }, now), /inválida/); assert.match(act(G, 'zz', { type: 'ready' }, now), /No estás/); });
console.log(n, 'reglas verificadas');
