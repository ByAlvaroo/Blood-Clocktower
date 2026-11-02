// Gemini es opcional: si no hay clave o falla, el narrador por reglas sigue funcionando.
import { GEMINI_MODEL } from './config.js';
async function ask(key, prompt, ms = 4000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: .9 } }) });
    if (!r.ok) return null;
    const d = await r.json();
    return JSON.parse(d.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null');
  } catch { return null; } finally { clearTimeout(t); }
}
const roster = G => Object.values(G.players).map(p => `${p.alive ? 'vivo' : 'muerto'}, ${p.team === 'E' ? 'malvado' : 'bueno'}`).join('; ');
export async function narratorHints(key, G) {
  const a = await ask(key, `Eres el Narrador de Blood on the Clocktower. Quieres una partida igualada hasta el final. Noche ${G.night}. Jugadores: ${roster(G)}. ¿A qué equipo debe favorecer esta noche la información dudosa? Responde solo JSON {"favor":"GOOD"} o {"favor":"EVIL"}.`);
  return a?.favor === 'GOOD' || a?.favor === 'EVIL' ? a : null;
}
export async function dawnText(key, G) {
  const names = G.lastDead || [];
  const a = await ask(key, `Eres el Narrador gótico de un pueblo maldito. Escribe en español 2 frases para el amanecer del día ${G.day + 1}. ${names.length ? `Debes nombrar exactamente a estos muertos: ${names.join(', ')}.` : 'Esta noche no ha muerto nadie: dilo claramente.'} No inventes más muertes ni reveles roles ni equipos. Responde solo JSON {"texto":"..."}.`);
  const t = a?.texto?.trim();
  return t && t.length < 400 && names.every(n => t.includes(n)) ? t : null;
}
