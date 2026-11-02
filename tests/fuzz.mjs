// Simula miles de partidas con todos los roles: nada puede colgarse ni filtrar secretos.
import { newGame, act, tick, viewFor, botAct, resolveNight, BY, AUTO } from '../js/engine.js';
const N = +process.argv[2] || 20000; let wins = { G: 0, E: 0 }, turns = 0, seen = new Set(), maxDays = 0;
const reasons = {};
for (let g = 0; g < N; g++) {
  const n = 5 + g % 11, list = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'J' + i, bot: true }));
  const G = newGame(list, { script: g % 5 === 0 ? 'basic' : 'full', nightSec: 30, daySec: 60, voteSec: 8 }, 'TEST');
  Object.values(G.players).forEach(p => seen.add(p.role));
  // nadie repetido y cuadra el reparto
  const roles = Object.values(G.players).map(p => p.role);
  if (new Set(roles).size !== n) throw Error('rol repetido ' + roles);
  if (roles.filter(r => BY[r].team === 'D').length !== 1) throw Error('demonios');
  let now = Date.now(), steps = 0;
  while (G.phase !== 'OVER') {
    if (++steps > 4000) throw Error('colgada ' + G.phase + ' día ' + G.day);
    for (const id of G.seats) botAct(G, id, now);
    now += 4000;
    if (G.phase === 'OVER') break;
    if (G.phase === 'NIGHT' || G.phase === 'REVEAL' || G.phase === 'DUSK' || G.phase === 'ROLES') now = Math.max(now, G.phaseEnd);
    const r = tick(G, now); if (r === 'NIGHT_END') resolveNight(G, now);
    for (const id of G.seats) {
      const v = viewFor(G, id, now), s = JSON.stringify(v);
      if (v.phase !== 'OVER') { if (/"(ab|shown|fake|eff)":/.test(s)) throw Error('fuga de campos internos'); }
      if (G.phase !== 'OVER' && v.seats.some(x => 'role' in x)) throw Error('fuga de rol');
    }
  }
  if (!G.over || !G.over.reason) throw Error('sin desenlace');
  wins[G.over.winner]++; maxDays = Math.max(maxDays, G.day); turns += G.day;
  const k = G.over.reason.replace(/^[^ ]+ /, '').slice(0, 40); reasons[k] = (reasons[k] || 0) + 1;
}
console.log({ N, wins, avgDays: +(turns / N).toFixed(2), maxDays, rolesUsed: seen.size, of: AUTO.length, missing: AUTO.filter(r => !seen.has(r)) });
console.log(Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 12));
