// node tests/chess-rules.test.js — move generation (perft) and game-ending rules for shared/chess-rules.js
const R = require('../shared/chess-rules.js');
let fails = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)); };

// Perft: counts of legal move sequences from well-known positions (chessprogramming.org "Perft Results").
const PERFT = [
  ['start', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['kiwipete (castling, pins)', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['pos3 (en passant pins)', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['pos4 (promotions, checks)', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [name, fen, counts] of PERFT) counts.forEach((n, i) => eq(`perft ${name} d${i + 1}`, R.perft(R.fromFEN(fen), i + 1), n));

const play = s => { const g = R.replay(s); return Object.assign(g, { out: g.ok ? R.outcome(g.pos, g.seen) : 'illegal' }); };
let g = play('e2e4 e7e5 d1h5 b8c6 f1c4 g8f6 h5f7');
eq("scholar's mate", g.out, { kind: 'mate', winner: 0 }); eq('mate notation', g.sans[g.sans.length - 1], 'Qxf7#');
g = play('f2f3 e7e5 g2g4 d8h4'); eq("fool's mate", g.out, { kind: 'mate', winner: 1 });
g = play('g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8'); eq('threefold repetition', g.out, { kind: 'rep', winner: null });
g = play('g1f3 g8f6 f3g1 f6g8'); eq('twice is not a draw', g.out, null);
g = play('e2e4 a7a6 e4e5 d7d5 e5d6'); eq('en passant is legal', g.ok, true); eq('en passant notation', g.sans[4], 'exd6'); eq('en passant removes the pawn', g.pos.b[R.sqIdx('d5')], '.');
g = play('e2e4 a7a6 e4e5 d7d5 a2a3 a6a5 e5d6'); eq('en passant only straight away', g.ok, false);
g = play('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 e1g1'); eq('castles short', [g.sans[6], g.pos.b[R.sqIdx('g1')], g.pos.b[R.sqIdx('f1')]], ['O-O', 'K', 'R']);
g = play('e2e4 e7e5 e1e2 e8e7 e2e1 e7e8 g1f3 g8f6 f1c4 f8c5 e1g1'); eq('no castling after the king has moved', g.ok, false);
g = play('a2a4 b7b5 a4b5 a7a6 b5a6 c8b7 a6b7 b8c6 b7a8q'); eq('promotion', [g.ok, g.sans[8], g.pos.b[0]], [true, 'bxa8=Q', 'Q']);
g = play('a2a4 b7b5 a4b5 a7a6 b5a6 c8b7 a6b7 b8c6 b7a8'); eq('promotion needs a piece', g.ok, false);
g = play('e2e4 e7e5 e1e2'); eq('legal king walk', g.ok, true); g = play('e2e4 d7d5 e4d5 d8d5 e1e2 d5e5 e2d3'); eq('move out of check', g.ok, true);
g = play('e2e4 d7d5 e4d5 d8d5 d2d3 d5e5 a2a3'); eq('cannot ignore check', g.ok, false);
eq('stalemate', R.outcome(R.fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), 1), { kind: 'stale', winner: null });
eq('bare kings', R.outcome(R.fromFEN('7k/8/6K1/8/8/8/8/8 w - - 0 1'), 1), { kind: 'material', winner: null });
eq('king and knight', R.outcome(R.fromFEN('7k/8/6K1/8/8/8/8/N7 w - - 0 1'), 1), { kind: 'material', winner: null });
eq('same-shade bishops', R.outcome(R.fromFEN('7k/8/6K1/8/8/8/b7/1B6 w - - 0 1'), 1), { kind: 'material', winner: null });
eq('opposite bishops play on', R.outcome(R.fromFEN('7k/8/6K1/8/8/8/1b6/1B6 w - - 0 1'), 1), null);
eq('king and pawn play on', R.outcome(R.fromFEN('7k/8/6K1/8/8/8/P7/8 w - - 0 1'), 1), null);
eq('fifty-move rule', R.outcome(R.fromFEN('7k/8/6K1/8/8/8/8/R7 w - - 100 80'), 1), { kind: 'fifty', winner: null });
let p = R.fromFEN('1k6/8/8/8/8/8/8/R4RK1 w - - 0 1'), l = R.legal(p);
eq('rook disambiguation by file', R.san(p, R.findMove(l, 'a1d1'), l), 'Rad1');
p = R.fromFEN('R6k/8/8/8/8/8/8/R3K3 w - - 0 1'); l = R.legal(p); eq('rook disambiguation by rank', R.san(p, R.findMove(l, 'a1a4'), l), 'R1a4+');
p = R.fromFEN('4k3/8/8/8/8/2N5/8/4K1N1 w - - 0 1'); l = R.legal(p); eq('knight disambiguation', R.san(p, R.findMove(l, 'c3e2'), l), 'Nce2');
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
