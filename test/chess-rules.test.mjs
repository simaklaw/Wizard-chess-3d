import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  generateChess960Layout,
  legalMoves,
  makeMove,
  isKingInCheck,
  moveToSan,
  gameStatus,
  positionKey,
  perft,
  fenToState,
  stateToFen,
} from '../src/chess/rules.js';

// ---------------------------------------------------------------------------
// Perft: the gold-standard test for move generation correctness.
// Reference numbers from the standard perft suite (chessprogramming.org).
// ---------------------------------------------------------------------------

test('perft: initial position (depth 1-4)', () => {
  const state = fenToState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(perft(state, 1), 20);
  assert.equal(perft(state, 2), 400);
  assert.equal(perft(state, 3), 8902);
  assert.equal(perft(state, 4), 197281);
});

test('perft: Kiwipete (castling, pins, checks)', () => {
  const state = fenToState('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.equal(perft(state, 1), 48);
  assert.equal(perft(state, 2), 2039);
  assert.equal(perft(state, 3), 97862);
});

test('perft: position 3 (en passant pins)', () => {
  const state = fenToState('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.equal(perft(state, 1), 14);
  assert.equal(perft(state, 2), 191);
  assert.equal(perft(state, 3), 2812);
  assert.equal(perft(state, 4), 43238);
});

test('perft: position 4 (promotions, castling rights)', () => {
  const state = fenToState('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
  assert.equal(perft(state, 1), 6);
  assert.equal(perft(state, 2), 264);
  assert.equal(perft(state, 3), 9467);
});

test('perft: position 5 (promotion edge cases)', () => {
  const state = fenToState('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
  assert.equal(perft(state, 1), 44);
  assert.equal(perft(state, 2), 1486);
  assert.equal(perft(state, 3), 62379);
});

test('perft: position 6', () => {
  const state = fenToState('r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10');
  assert.equal(perft(state, 1), 46);
  assert.equal(perft(state, 2), 2079);
  assert.equal(perft(state, 3), 89890);
});

// ---------------------------------------------------------------------------
// En passant
// ---------------------------------------------------------------------------

test('en passant: capture available, correct SAN, pawn removed', () => {
  const state = fenToState('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
  const legal = legalMoves(state);
  const epMoves = legal.filter((m) => m.isEnPassant);
  assert.equal(epMoves.length, 1);
  assert.equal(moveToSan(state, epMoves[0], legal), 'exf6');
  const after = makeMove(state, epMoves[0]);
  assert.equal(after.board[3][5], null); // captured pawn on f5 removed
});

test('en passant: target cleared after the next move', () => {
  const state = fenToState('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
  const epMove = legalMoves(state).find((m) => m.isEnPassant);
  const afterEp = makeMove(state, epMove);
  assert.ok(afterEp.ep);
  const reply = { from: { r: 1, c: 7 }, to: { r: 2, c: 7 }, capture: false, isEnPassant: false, castle: null, promotion: null, isDoublePush: false };
  const afterReply = makeMove(afterEp, reply);
  assert.equal(afterReply.ep, null);
});

// ---------------------------------------------------------------------------
// Castling (standard)
// ---------------------------------------------------------------------------

test('castling: through-check blocked, out-of-check blocked, SAN correct', () => {
  const throughCheck = fenToState('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
  const castles = legalMoves(throughCheck).filter((m) => m.castle);
  assert.deepEqual(castles.map((m) => m.castle).sort(), ['q']); // f1 attacked

  const inCheck = fenToState('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
  assert.equal(legalMoves(inCheck).filter((m) => m.castle).length, 0); // e1 attacked

  const free = fenToState('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const legal = legalMoves(free);
  const oo = legal.find((m) => m.castle === 'k');
  const ooo = legal.find((m) => m.castle === 'q');
  assert.equal(moveToSan(free, oo, legal), 'O-O');
  assert.equal(moveToSan(free, ooo, legal), 'O-O-O');

  const after = makeMove(free, oo);
  assert.deepEqual(after.board[7][6], { type: 'k', color: 'w' });
  assert.deepEqual(after.board[7][5], { type: 'r', color: 'w' });
  assert.equal(Object.keys(after.castling.w).length, 0);
  assert.equal(Object.keys(after.castling.b).length, 2);
});

// ---------------------------------------------------------------------------
// Castling (Chess960): rights keyed by rook home files, king off the e-file
// ---------------------------------------------------------------------------

test('chess960: kingside castling with king on b1, rook on c1', () => {
  const state = fenToState('rkrnnbqb/pppppppp/8/8/8/8/PPPPPPPP/RKRNNBQB w AaCc - 0 1');
  state.board[7][3] = null; // clear d1
  state.board[7][4] = null; // clear e1
  state.board[7][5] = null; // clear f1
  state.board[7][6] = null; // clear g1
  const castles = legalMoves(state).filter((m) => m.castle);
  // The c1 rook occupies the queenside king destination -> only O-O is legal.
  assert.deepEqual(castles.map((m) => m.castle), ['k']);
  const oo = castles[0];
  assert.deepEqual(oo.from, { r: 7, c: 1 });
  assert.deepEqual(oo.to, { r: 7, c: 6 });
  assert.equal(oo.castleRookFrom, 2);
  assert.equal(oo.castleRookTo, 5);
  assert.equal(moveToSan(state, oo), 'O-O');
  const after = makeMove(state, oo);
  assert.deepEqual(after.board[7][6], { type: 'k', color: 'w' });
  assert.deepEqual(after.board[7][5], { type: 'r', color: 'w' });
});

test('chess960: queenside castling once the c1 rook is gone', () => {
  const state = fenToState('rkrnnbqb/pppppppp/8/8/8/8/PPPPPPPP/RKRNNBQB w AaCc - 0 1');
  state.board[7][2] = null;
  state.board[7][3] = null;
  state.board[7][4] = null;
  state.board[7][5] = null;
  state.board[7][6] = null;
  const castles = legalMoves(state).filter((m) => m.castle);
  assert.deepEqual(castles.map((m) => m.castle), ['q']);
  const ooo = castles[0];
  assert.deepEqual(ooo.from, { r: 7, c: 1 });
  assert.deepEqual(ooo.to, { r: 7, c: 2 });
  assert.equal(ooo.castleRookFrom, 0);
  assert.equal(ooo.castleRookTo, 3);
  assert.equal(moveToSan(state, ooo), 'O-O-O');
  const after = makeMove(state, ooo);
  assert.deepEqual(after.board[7][2], { type: 'k', color: 'w' });
  assert.deepEqual(after.board[7][3], { type: 'r', color: 'w' });
});

test('chess960: generated layouts are valid', () => {
  for (const id of [0, 1, 518, 959]) {
    const layout = generateChess960Layout(id);
    const bishops = layout.map((t, i) => ({ t, i })).filter((x) => x.t === 'b');
    assert.notEqual((bishops[0].i + bishops[1].i) % 2, 0, 'bishops must be on opposite colors');
    const kIdx = layout.indexOf('k');
    const rooks = layout.map((t, i) => ({ t, i })).filter((x) => x.t === 'r').map((x) => x.i);
    assert.ok(kIdx > Math.min(...rooks) && kIdx < Math.max(...rooks), 'king must sit between rooks');
  }
});

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

test('promotion: four choices, SAN, underpromotion', () => {
  const state = fenToState('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const legal = legalMoves(state);
  const promos = legal.filter((m) => m.from.r === 1 && m.to.r === 0);
  assert.equal(promos.length, 4);
  assert.equal(moveToSan(state, promos.find((m) => m.promotion === 'q'), legal), 'a8=Q');
  const after = makeMove(state, promos.find((m) => m.promotion === 'n'));
  assert.deepEqual(after.board[0][0], { type: 'n', color: 'w' });
});

// ---------------------------------------------------------------------------
// Draw rules
// ---------------------------------------------------------------------------

test('fifty-move rule is detected', () => {
  const state = fenToState('k7/8/8/8/8/8/8/K6R w - - 100 60');
  const status = gameStatus(state);
  assert.equal(status.result, 'draw');
  assert.equal(status.reason, 'fifty-move');
});

test('insufficient material: K vs K, K+B vs K, same-color bishops', () => {
  assert.equal(gameStatus(fenToState('k7/8/8/8/8/8/8/K7 w - - 0 1')).result, 'draw');
  assert.equal(gameStatus(fenToState('k7/8/8/8/8/8/8/K6B w - - 0 1')).result, 'draw');
  assert.equal(gameStatus(fenToState('k1b5/8/8/8/8/8/8/2K2B2 w - - 0 1')).reason, 'insufficient-material');
  // Opposite-colored bishops are NOT an automatic draw.
  assert.equal(gameStatus(fenToState('kb6/8/8/8/8/8/8/2K2B2 w - - 0 1')).result, 'ongoing');
});

test('threefold repetition via positionKey counting', () => {
  const state = createInitialState();
  const key = positionKey(state);
  assert.equal(gameStatus(state, { [key]: 3 }).reason, 'threefold');
  assert.equal(gameStatus(state, { [key]: 2 }).result, 'ongoing');
});

// ---------------------------------------------------------------------------
// Mate / stalemate
// ---------------------------------------------------------------------------

test('checkmate and stalemate detection', () => {
  const foolsMate = fenToState('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  assert.equal(gameStatus(foolsMate).result, 'checkmate');
  assert.equal(gameStatus(foolsMate).winner, 'b');

  const stalemate = fenToState('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1');
  assert.equal(gameStatus(stalemate).result, 'stalemate');
});

test('SAN: mate and check suffixes', () => {
  const state = fenToState('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
  const legal = legalMoves(state);
  const qh4 = legal.find((m) => m.from.r === 0 && m.from.c === 3 && m.to.r === 4 && m.to.c === 7);
  assert.equal(moveToSan(state, qh4, legal), 'Qh4#');
});

// ---------------------------------------------------------------------------
// SAN disambiguation
// ---------------------------------------------------------------------------

test('SAN: file and rank disambiguation', () => {
  const knights = fenToState('k7/8/8/8/8/8/8/KN3N2 w - - 0 1');
  const knightMoves = legalMoves(knights);
  assert.equal(moveToSan(knights, knightMoves.find((m) => m.from.c === 1 && m.to.r === 6 && m.to.c === 3), knightMoves), 'Nbd2');
  assert.equal(moveToSan(knights, knightMoves.find((m) => m.from.c === 5 && m.to.r === 6 && m.to.c === 3), knightMoves), 'Nfd2');

  const rooks = fenToState('7k/8/8/8/R7/8/8/R5K1 w - - 0 1');
  const rookMoves = legalMoves(rooks);
  assert.equal(moveToSan(rooks, rookMoves.find((m) => m.from.r === 4 && m.to.r === 5), rookMoves), 'R4a3');
});

// ---------------------------------------------------------------------------
// FEN round-trips
// ---------------------------------------------------------------------------

test('FEN round-trips', () => {
  const fens = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
  ];
  for (const fen of fens) {
    assert.equal(stateToFen(fenToState(fen)), fen);
  }
});
