/* Chess rules for the FCC chess game: legal moves, check, mate, draws and notation. No DOM, so Node can test it
 * (tests/chess-rules.test.js). Board = array of 64 chars, index 0 = a8 … 63 = h1. Uppercase = seat 0 (moves first). */
(function (root) {
  'use strict';
  const FILES = 'abcdefgh';
  const START = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
  const colorOf = c => (c === '.' ? -1 : (c < 'a' ? 0 : 1));
  const sqName = i => FILES[i & 7] + (8 - (i >> 3));
  const sqIdx = s => (8 - Number(s[1])) * 8 + FILES.indexOf(s[0]);
  const start = () => ({ b: START.split(''), turn: 0, c: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0, full: 1 });
  function fromFEN(fen) {
    const [rows, turn, cas = '-', ep = '-', half, full] = fen.trim().split(/\s+/);
    const b = [];
    for (const ch of rows) { if (ch === '/') continue; if (ch >= '1' && ch <= '8') for (let i = 0; i < +ch; i++) b.push('.'); else b.push(ch); }
    return { b, turn: turn === 'b' ? 1 : 0, c: { K: cas.includes('K'), Q: cas.includes('Q'), k: cas.includes('k'), q: cas.includes('q') }, ep: ep !== '-' ? sqIdx(ep) : -1, half: +half || 0, full: +full || 1 };
  }

  const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KG = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const ORTH = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const DIAG = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const on = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

  /* Is square s attacked by a piece of colour `by`? */
  function attacked(b, s, by) {
    const f = s & 7, r = s >> 3, up = by === 0;
    const pr = up ? r + 1 : r - 1, P = up ? 'P' : 'p';
    if (pr >= 0 && pr < 8) { if (f > 0 && b[pr * 8 + f - 1] === P) return true; if (f < 7 && b[pr * 8 + f + 1] === P) return true; }
    const N = up ? 'N' : 'n', K = up ? 'K' : 'k', Rk = up ? 'R' : 'r', B = up ? 'B' : 'b', Qn = up ? 'Q' : 'q';
    for (const [df, dr] of KN) if (on(f + df, r + dr) && b[(r + dr) * 8 + f + df] === N) return true;
    for (const [df, dr] of KG) if (on(f + df, r + dr) && b[(r + dr) * 8 + f + df] === K) return true;
    for (const [df, dr] of ORTH) { let ff = f + df, rr = r + dr; while (on(ff, rr)) { const c = b[rr * 8 + ff]; if (c !== '.') { if (c === Rk || c === Qn) return true; break; } ff += df; rr += dr; } }
    for (const [df, dr] of DIAG) { let ff = f + df, rr = r + dr; while (on(ff, rr)) { const c = b[rr * 8 + ff]; if (c !== '.') { if (c === B || c === Qn) return true; break; } ff += df; rr += dr; } }
    return false;
  }
  const kingSq = (b, color) => b.indexOf(color === 0 ? 'K' : 'k');
  const inCheck = (pos, color = pos.turn) => attacked(pos.b, kingSq(pos.b, color), 1 - color);

  function pseudo(pos) {
    const { b, turn } = pos, out = [], them = 1 - turn;
    const add = (from, to, extra) => out.push(Object.assign({ from, to }, extra));
    for (let s = 0; s < 64; s++) {
      const c = b[s]; if (colorOf(c) !== turn) continue;
      const t = c.toLowerCase(), f = s & 7, r = s >> 3;
      if (t === 'p') {
        const dir = turn === 0 ? -1 : 1, startR = turn === 0 ? 6 : 1, promoR = turn === 0 ? 0 : 7, r1 = r + dir;
        if (r1 < 0 || r1 > 7) continue;
        const push = (to, extra) => { if (r1 === promoR) for (const p of 'qrbn') add(s, to, Object.assign({ promo: p }, extra)); else add(s, to, extra); };
        if (b[r1 * 8 + f] === '.') { push(r1 * 8 + f); if (r === startR && b[(r + 2 * dir) * 8 + f] === '.') add(s, (r + 2 * dir) * 8 + f); }
        for (const df of [-1, 1]) {
          if (f + df < 0 || f + df > 7) continue;
          const to = r1 * 8 + f + df;
          if (colorOf(b[to]) === them) push(to); else if (to === pos.ep && b[to] === '.') add(s, to, { ep: true });
        }
      } else if (t === 'n' || t === 'k') {
        for (const [df, dr] of (t === 'n' ? KN : KG)) { if (!on(f + df, r + dr)) continue; const to = (r + dr) * 8 + f + df; if (colorOf(b[to]) !== turn) add(s, to); }
      } else {
        const dirs = t === 'r' ? ORTH : t === 'b' ? DIAG : KG;
        for (const [df, dr] of dirs) { let ff = f + df, rr = r + dr; while (on(ff, rr)) { const to = rr * 8 + ff, cc = colorOf(b[to]); if (cc === turn) break; add(s, to); if (cc === them) break; ff += df; rr += dr; } }
      }
    }
    // Castling: rights intact, squares between empty, king not in check and not passing through an attacked square.
    const e = (...sqs) => sqs.every(q => b[q] === '.'), safe = (...sqs) => sqs.every(q => !attacked(b, q, them));
    if (turn === 0 && b[60] === 'K') {
      if (pos.c.K && b[63] === 'R' && e(61, 62) && safe(60, 61, 62)) add(60, 62, { castle: 'K' });
      if (pos.c.Q && b[56] === 'R' && e(59, 58, 57) && safe(60, 59, 58)) add(60, 58, { castle: 'Q' });
    } else if (turn === 1 && b[4] === 'k') {
      if (pos.c.k && b[7] === 'r' && e(5, 6) && safe(4, 5, 6)) add(4, 6, { castle: 'K' });
      if (pos.c.q && b[0] === 'r' && e(3, 2, 1) && safe(4, 3, 2)) add(4, 2, { castle: 'Q' });
    }
    return out;
  }

  const ROOK_HOP = { 62: [63, 61], 58: [56, 59], 6: [7, 5], 2: [0, 3] };
  function make(pos, m) {
    const b = pos.b.slice(), piece = b[m.from], t = piece.toLowerCase(), turn = pos.turn;
    const capture = b[m.to] !== '.' || !!m.ep;
    b[m.to] = m.promo ? (turn === 0 ? m.promo.toUpperCase() : m.promo) : piece;
    b[m.from] = '.';
    if (m.ep) b[m.to + (turn === 0 ? 8 : -8)] = '.';
    if (m.castle) { const [rf, rt] = ROOK_HOP[m.to]; b[rt] = b[rf]; b[rf] = '.'; }
    const c = Object.assign({}, pos.c);
    if (piece === 'K') c.K = c.Q = false;
    if (piece === 'k') c.k = c.q = false;
    for (const q of [m.from, m.to]) { if (q === 63) c.K = false; if (q === 56) c.Q = false; if (q === 7) c.k = false; if (q === 0) c.q = false; }
    return { b, turn: 1 - turn, c, ep: t === 'p' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1,
      half: t === 'p' || capture ? 0 : pos.half + 1, full: pos.full + (turn === 1 ? 1 : 0) };
  }
  const legal = pos => pseudo(pos).filter(m => !inCheck(make(pos, m), pos.turn));
  function perft(pos, d) { if (d === 0) return 1; let n = 0; for (const m of legal(pos)) n += perft(make(pos, m), d - 1); return n; }

  /* Not enough pieces left for either side to mate: bare kings, one minor piece, or only bishops on one square colour. */
  function insufficient(b) {
    const rest = []; for (let s = 0; s < 64; s++) { const t = b[s].toLowerCase(); if (t !== '.' && t !== 'k') rest.push([t, ((s & 7) + (s >> 3)) & 1]); }
    if (!rest.length) return true;
    if (rest.length === 1) return rest[0][0] === 'n' || rest[0][0] === 'b';
    return rest.every(([t, shade]) => t === 'b' && shade === rest[0][1]);
  }
  /* Position identity for the threefold rule: pieces, side to move, castling rights, and the en passant square if a capture is on. */
  function key(pos) {
    let ep = -1;
    if (pos.ep >= 0) { const P = pos.turn === 0 ? 'P' : 'p', r = (pos.ep >> 3) + (pos.turn === 0 ? 1 : -1), f = pos.ep & 7; if ((f > 0 && pos.b[r * 8 + f - 1] === P) || (f < 7 && pos.b[r * 8 + f + 1] === P)) ep = pos.ep; }
    return pos.b.join('') + pos.turn + (pos.c.K ? 'K' : '') + (pos.c.Q ? 'Q' : '') + (pos.c.k ? 'k' : '') + (pos.c.q ? 'q' : '') + ep;
  }
  /* null while the game is on; otherwise { kind, winner } with winner null for a draw. `seen` = times this position has occurred. */
  function outcome(pos, seen) {
    if (!legal(pos).length) return inCheck(pos) ? { kind: 'mate', winner: 1 - pos.turn } : { kind: 'stale', winner: null };
    if (insufficient(pos.b)) return { kind: 'material', winner: null };
    if (seen >= 3) return { kind: 'rep', winner: null };
    if (pos.half >= 100) return { kind: 'fifty', winner: null };
    return null;
  }

  const moveStr = m => sqName(m.from) + sqName(m.to) + (m.promo || '');
  const findMove = (list, str) => list.find(m => moveStr(m) === str) || null;
  /* Standard algebraic notation for a legal move in `pos` (list = legal(pos)). */
  function san(pos, m, list) {
    const piece = pos.b[m.from], t = piece.toLowerCase(); let s;
    if (m.castle) s = m.castle === 'K' ? 'O-O' : 'O-O-O';
    else {
      const cap = pos.b[m.to] !== '.' || m.ep;
      if (t === 'p') s = (cap ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
      else {
        const others = (list || legal(pos)).filter(o => o.from !== m.from && o.to === m.to && pos.b[o.from] === piece);
        let dis = '';
        if (others.length) {
          const sameFile = others.some(o => (o.from & 7) === (m.from & 7)), sameRank = others.some(o => (o.from >> 3) === (m.from >> 3));
          dis = !sameFile ? FILES[m.from & 7] : !sameRank ? String(8 - (m.from >> 3)) : sqName(m.from);
        }
        s = t.toUpperCase() + dis + (cap ? 'x' : '') + sqName(m.to);
      }
    }
    const next = make(pos, m);
    if (inCheck(next)) s += legal(next).length ? '+' : '#';
    return s;
  }
  /* Rebuild a game from its move list ("e2e4 e7e5 g1f3 …"). ok=false if any move is illegal. */
  function replay(str) {
    let pos = start(); const counts = {}; counts[key(pos)] = 1;
    const sans = []; let last = null, plies = 0;
    for (const tok of String(str || '').split(/\s+/).filter(Boolean)) {
      const list = legal(pos), m = findMove(list, tok);
      if (!m) return { ok: false, pos, counts, sans, last, plies, bad: tok };
      sans.push(san(pos, m, list));
      last = { from: m.from, to: m.to, piece: pos.b[m.from], captured: m.ep ? (pos.turn === 0 ? 'p' : 'P') : pos.b[m.to] };
      pos = make(pos, m); plies++;
      const k = key(pos); counts[k] = (counts[k] || 0) + 1;
    }
    return { ok: true, pos, counts, sans, last, plies, seen: counts[key(pos)] };
  }

  const api = { START, start, fromFEN, colorOf, sqName, sqIdx, attacked, kingSq, inCheck, legal, make, perft, insufficient, key, outcome, moveStr, findMove, san, replay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ChessRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
