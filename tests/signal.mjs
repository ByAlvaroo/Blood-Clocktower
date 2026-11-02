// Servidor de señalización mínimo para pruebas: replica el enrutado de peerjs-server.
import http from 'node:http'; import crypto from 'node:crypto';
const clients = new Map();
const frame = s => { const b = Buffer.from(s), n = b.length; const h = n < 126 ? Buffer.from([0x81, n]) : Buffer.from([0x81, 126, n >> 8, n & 255]); return Buffer.concat([h, b]); };
const srv = http.createServer((q, r) => r.end('ok'));
srv.on('upgrade', (req, sock) => {
  const u = new URL(req.url, 'http://x'), id = u.searchParams.get('id'), token = u.searchParams.get('token');
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const prev = clients.get(id);
  if (prev && prev.token !== token) { sock.write(frame(JSON.stringify({ type: 'ID-TAKEN' }))); sock.end(); return; }
  clients.set(id, { sock, token }); sock.write(frame(JSON.stringify({ type: 'OPEN' })));
  let buf = Buffer.alloc(0);
  sock.on('data', d => { buf = Buffer.concat([buf, d]);
    for (;;) { if (buf.length < 2) return; let len = buf[1] & 127, off = 2; if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } if (buf.length < off + 4 + len) return;
      const op = buf[0] & 15, mask = buf.subarray(off, off + 4), pl = Buffer.from(buf.subarray(off + 4, off + 4 + len)); for (let i = 0; i < len; i++) pl[i] ^= mask[i % 4]; buf = buf.subarray(off + 4 + len);
      if (op === 8) { sock.end(); return; } if (op !== 1) continue;
      const m = JSON.parse(pl.toString()); if (m.type === 'HEARTBEAT') continue; m.src = id;
      const dst = clients.get(m.dst);
      if (dst) dst.sock.write(frame(JSON.stringify(m))); else sock.write(frame(JSON.stringify({ type: 'EXPIRE', src: m.dst, dst: id }))); } });
  const bye = () => { if (clients.get(id)?.sock === sock) clients.delete(id); }; sock.on('close', bye); sock.on('error', bye);
});
srv.listen(+process.argv[2] || 9100, () => console.log('signal up'));
