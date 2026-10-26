// Local stand-in for the FCC website: serves the games and a mock of the members' chat, and keeps one
// conversation (two seats) with its messages and the current game in mock/state.json.
// Run: node mock/server.js   (port 8766)   Open: http://localhost:8766/mock/chat.html?as=0  (seat 1 is ?as=1)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(__dirname, 'state.json');
const PORT = Number(process.env.PORT || 8766);
const PLAYERS = (process.env.PLAYERS || 'Steve,Claude').split(',');

const GAMES = {
  trumps: { file: 'telly-trumps', title: 'Telly Trumps', emoji: '🃏', blurb: 'Top Trumps with British film & TV' },
  hopper: { file: 'channel-hopper', title: 'Channel Hopper', emoji: '📺', blurb: 'Battleships on the TV listings' },
  connect: { file: 'clapperboard-connect', title: 'Clapperboard Connect', emoji: '🎞️', blurb: 'Connect Four with a Director\'s Cut' },
  spoiler: { file: 'spoiler-alert', title: 'Spoiler Alert', emoji: '🤫', blurb: 'Wordle duel of British titles' },
  bankit: { file: 'bank-it', title: 'Bank It!', emoji: '💷', blurb: 'Push-your-luck film & TV quiz' },
};

const fresh = () => ({ players: PLAYERS, messages: [], game: null, history: [], readAt: [0, 0] });
let db = fresh();
try { db = Object.assign(fresh(), JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch (e) { /* first run */ }
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(db, null, 2));
const id = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

function pin(from, body, gameId) { db.messages.push({ id: id(), from, body, sentAt: now(), gameId: gameId || null }); }

const api = {
  'GET /api/thread': (q) => {
    const me = Number(q.as ?? 0);
    const other = 1 - me;
    const unread = db.messages.filter(m => m.from === other && new Date(m.sentAt).getTime() > (db.readAt[me] || 0)).length;
    return { players: db.players, me, messages: db.messages.slice(-60), game: db.game, unread, games: GAMES };
  },
  'POST /api/read': (q, b) => { db.readAt[Number(b.as)] = Date.now(); save(); return { ok: true }; },
  'POST /api/message': (q, b) => {
    const body = String(b.body || '').trim().slice(0, 2000);
    if (!body) return { ok: false, error: 'Empty message' };
    pin(Number(b.as), body); save();
    return { ok: true };
  },
  'POST /api/game/start': (q, b) => {
    const g = GAMES[b.game]; if (!g) return { ok: false, error: 'Unknown game' };
    if (db.game && !db.game.over) return { ok: true, game: db.game, resumed: true };
    const starter = Number(b.as);
    // The starter is seat 0 inside the game; map game seats to chat seats so the loser can start a rematch.
    db.game = { id: id(), game: b.game, file: g.file, title: g.title, emoji: g.emoji, turn: 0, state: null, seats: [starter, 1 - starter], next: starter, over: null, startedAt: now() };
    pin(starter, `${g.emoji} ${db.players[starter]} started ${g.title}`, db.game.id); save();
    return { ok: true, game: db.game };
  },
  'POST /api/game/move': (q, b) => {
    const g = db.game; const me = Number(b.as);
    if (!g || g.id !== b.id) return { ok: false, error: 'No such game' };
    if (g.over) return { ok: false, error: 'Game over' };
    if (g.next !== me) return { ok: false, error: `It's ${db.players[g.next]}'s move` };
    if (!b.state || typeof b.state !== 'object' || JSON.stringify(b.state).length > 8192) return { ok: false, error: 'Bad state' };
    g.state = b.state; g.turn += 1; g.over = b.over || null;
    g.next = g.over ? null : g.seats[b.next];
    const other = 1 - me;
    if (g.over) {
      const w = g.over.winner == null ? null : g.seats[g.over.winner];
      pin(me, w == null ? `🤝 ${g.title} was a draw` : `🏆 ${db.players[w]} won ${g.title}`, g.id);
      db.history.push({ ...g, finishedAt: now() });
    } else {
      pin(me, `${g.emoji} ${db.players[me]} played · your move, ${db.players[other]}`, g.id);
    }
    save();
    return { ok: true, game: g };
  },
  'POST /api/game/rematch': (q, b) => {
    const prev = db.game; if (!prev || !prev.over) return { ok: false, error: 'No finished game' };
    // Loser starts; the person who pressed Rematch starts a draw.
    const w = prev.over.winner == null ? null : prev.seats[prev.over.winner];
    const starter = w == null ? Number(b.as) : 1 - w;
    const g = GAMES[prev.game];
    db.game = { id: id(), game: prev.game, file: prev.file, title: prev.title, emoji: prev.emoji, turn: 0, state: null, seats: [starter, 1 - starter], next: starter, over: null, startedAt: now() };
    pin(Number(b.as), `${g.emoji} Rematch! ${db.players[starter]} to start ${g.title}`, db.game.id); save();
    return { ok: true, game: db.game };
  },
  'POST /api/game/abandon': () => { if (db.game) db.history.push({ ...db.game, abandonedAt: now() }); db.game = null; save(); return { ok: true }; },
  'POST /api/reset': () => { db = fresh(); save(); return { ok: true }; },
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const key = `${req.method} ${url.pathname}`;
  if (api[key]) {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 65536) req.destroy(); });
    req.on('end', () => {
      let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) { /* ignore */ }
      const out = api[key](Object.fromEntries(url.searchParams), body);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/mock/chat.html' : url.pathname)));
  if (!file.startsWith(ROOT) || file.includes('node_modules')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`FCC mock chat on http://localhost:${PORT}/mock/chat.html?as=0  (other seat: ?as=1)`));
