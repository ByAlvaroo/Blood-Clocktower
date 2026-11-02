import { createRequire } from 'node:module'; import { spawn, execSync } from 'node:child_process'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const root = path.resolve(import.meta.dirname, '..'), out = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(out, { recursive: true });
const sig = spawn('node', [root + '/tests/signal.mjs', '9100'], { stdio: 'ignore' });
const mime = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json' };
const web = http.createServer((q, r) => { const u = new URL(q.url, 'http://x').pathname; const f = path.join(root, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => e ? (r.writeHead(404), r.end()) : (r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/plain' }), r.end(d))); }).listen(8123);
const fail = m => { console.error('FALLO:', m); cleanup(1); }; const cleanup = c => { sig.kill(); web.close(); process.exit(c); };
setTimeout(() => fail('timeout global'), 230000);
await new Promise(r => setTimeout(r, 400));
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const url = 'http://localhost:8123/?signal=' + encodeURIComponent('ws://localhost:9100/');
const errs = []; const open = async name => { const c = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, permissions: ['camera'] }); const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) errs.push(name + ' console: ' + m.text()); }); await p.goto(url); await p.fill('#name', name); return p; };
const host = await open('Álvaro');
await host.click('[data-do=camera]'); await host.waitForSelector('#shot:not([disabled])'); await host.waitForTimeout(500); await host.click('#shot'); await host.waitForSelector('.profile img');
await host.screenshot({ path: out + '/1-home.png' });
const photoLen = await host.evaluate(() => JSON.parse(localStorage.ct_me).photo.length); console.log('foto bytes', photoLen);
await host.click('[data-do=create]'); await host.waitForSelector('.code');
const code = (await host.textContent('.code')).trim(); console.log('sala', code);
const names = ['Bea', 'Carlos', 'Dani', '<img src=x onerror=alert(1)>']; const ps = [];
for (const n of names) { const p = await open(n); await p.fill('#code', code); await p.click('[data-do=join]'); ps.push(p); }
await host.waitForFunction(() => document.querySelectorAll('.list li').length === 5, null, { timeout: 25000 });
await ps[0].waitForFunction(() => document.querySelectorAll('.list img').length >= 1, null, { timeout: 8000 }); console.log('foto llega a los demás');
await host.screenshot({ path: out + '/2-lobby.png', fullPage: true });
await host.evaluate(() => { const h = window.__S.host; h.aiKey = ''; h.cfg.voteSec = 12; });
await host.click('[data-do=start]');
const everyone = [host, ...ps];
const finish = async p => { for (const g of await p.$$('.pgrid')) { const b = await g.$('button'); if (b) await b.click(); } for (const s of await p.$$('[data-pick]')) await s.selectOption({ index: 1 }); const t = await p.$('#cam'); if (t && await t.isEnabled()) await t.fill(await p.textContent('.phrase')); };

for (const p of everyone) { await p.click('[data-do=seeRole]'); await p.click('[data-do=ready]'); }
await host.screenshot({ path: out + '/3-role.png' }).catch(() => {});
await host.waitForSelector('#cam', { timeout: 10000 }); await host.screenshot({ path: out + '/4-night.png', fullPage: true });
// secreto: ningún móvil conoce el rol de otro antes del final
const texts = await Promise.all(everyone.map(p => p.evaluate(() => document.body.innerText)));
await finish(host); await host.waitForFunction(() => /1 de 5 han completado/.test(document.body.innerText), null, { timeout: 8000 }); await host.waitForTimeout(300); await host.screenshot({ path: out + '/4b-typing.png', fullPage: true }); console.log('lista de completados ok');
// reconexión: un jugador recarga en plena noche
await ps[1].reload(); await ps[1].waitForSelector('[data-do=resumeClient]'); await ps[1].click('[data-do=resumeClient]');
await ps[1].waitForSelector('#cam', { timeout: 15000 }); console.log('reconexión ok con el mismo rol');
await new Promise(r => setTimeout(r, 1500)); if (!/antes del alba/i.test(await host.innerText('body')) === false) fail('amaneció antes de tiempo');
for (const p of ps) await finish(p);
await host.waitForFunction(() => /antes del alba/i.test(document.body.innerText), null, { timeout: 40000 });
await host.screenshot({ path: out + '/5-reveal.png' });
await host.waitForSelector('.dawntext', { timeout: 25000 }); await host.waitForTimeout(4200); await host.screenshot({ path: out + '/5b-dawn.png' });
await host.waitForSelector('.clock', { timeout: 25000 }); await host.screenshot({ path: out + '/6-day.png', fullPage: true });
await ps[0].waitForSelector('.clock'); await ps[0].waitForTimeout(600); const seats = await ps[0].$$('.seat:not(.dead)');
await seats[2].click(); await ps[0].click('#go');
await host.waitForSelector('.vote', { timeout: 6000 }); await host.waitForTimeout(300); await host.screenshot({ path: out + '/7-vote.png', fullPage: true });
for (const p of everyone) await p.evaluate(() => document.querySelector('[data-do=hand][data-id="1"]')?.click());
await host.waitForFunction(() => /votos/.test(document.querySelector('.feed')?.innerText || '') || /fin de la partida/i.test(document.body.innerText), null, { timeout: 25000 });
console.log('votación ok');
const dbg = await host.evaluate(() => document.querySelector('.feed')?.innerText.slice(0, 300)); console.log(dbg);
console.log('errores:', errs); await b.close(); cleanup(errs.length ? 1 : 0);
