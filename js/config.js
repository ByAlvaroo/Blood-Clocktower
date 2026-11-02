// Ajustes editables. Por defecto usa el servidor público gratuito de señalización de PeerJS.
const q = new URLSearchParams(location.search).get('signal');
export const SIGNAL = q ? { url: q } : { url: 'wss://0.peerjs.com:443/', key: 'peerjs' };
export const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];
export const ROOM_PREFIX = 'clocktower-byalvaro-v1-';
export const GEMINI_MODEL = 'gemini-flash-lite-latest';
