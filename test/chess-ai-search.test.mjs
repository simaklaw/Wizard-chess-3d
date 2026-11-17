/**
 * Regression tests for the pure AI search (src/chess/aiSearch.js).
 * Run: npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fenToState } from '../src/chess/rules.js';
import {
  searchBestMove,
  orderMoves,
  moveOrderScore,
  MATE_SCORE,
} from '../src/chess/aiSearch.js';

test('finds mate in one (back-rank mate)', () => {
  // White Re1 -> Re8 is checkmate against the boxed-in black king.
  const state = fenToState('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1');
  const { move, score } = searchBestMove(state, { depth: 2 });
  assert.ok(move, 'search must return a move');
  assert.equal(move.from.r, 7);
  assert.equal(move.from.c, 4);
  assert.equal(move.to.r, 0);
  assert.equal(move.to.c, 4);
  assert.ok(score > MATE_SCORE - 100, `mate score expected, got ${score}`);
});

test('quiescence avoids the poisoned pawn (no horizon blunder)', () => {
  // Qxd5?? loses the queen to exd5. A depth-1 search without quiescence
  // would happily grab the pawn; with quiescence it must not.
  const state = fenToState('k7/8/4p3/3p4/8/8/8/3QK3 w - - 0 1');
  const { move, score } = searchBestMove(state, { depth: 1 });
  assert.ok(move, 'search must return a move');
  const isQueenTakesPawn = move.from.r === 7 && move.from.c === 3 && move.to.r === 3 && move.to.c === 3;
  assert.ok(!isQueenTakesPawn, 'AI must not grab the poisoned pawn');
  assert.ok(score > -50, `evaluation must not collapse, got ${score}`);
});

test('MVV-LVA orders captures before quiet moves, big victims first', () => {
  // White queen d1 can take the knight on d7; white rook a1 can take the
  // pawn on a7. Queen-takes-knight must sort before rook-takes-pawn.
  const state = fenToState('3n3k/p7/8/8/8/8/8/R2QK3 w - - 0 1');
  const moves = orderMoves(state, [
    { from: { r: 7, c: 0 }, to: { r: 6, c: 0 }, capture: true, isEnPassant: false, castle: null, promotion: null },
    { from: { r: 7, c: 3 }, to: { r: 0, c: 3 }, capture: true, isEnPassant: false, castle: null, promotion: null },
    { from: { r: 7, c: 3 }, to: { r: 4, c: 3 }, capture: false, isEnPassant: false, castle: null, promotion: null },
  ]);
  assert.equal(moves[0].from.c, 3, 'queen capture sorts first');
  assert.equal(moves[0].to.r, 0, 'queen takes knight (not a quiet move)');
  assert.ok(
    moveOrderScore(state, { from: { r: 7, c: 3 }, to: { r: 0, c: 3 } }) >
    moveOrderScore(state, { from: { r: 7, c: 0 }, to: { r: 6, c: 0 } }),
    'knight victim outranks pawn victim'
  );
});

test('search from the initial position returns a legal move and respects the node budget', () => {
  const state = fenToState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const started = Date.now();
  const { move, nodes } = searchBestMove(state, { depth: 3 });
  const elapsed = Date.now() - started;
  assert.ok(move, 'search must return a move');
  assert.ok(
    move.from.r === 6 || move.from.r === 7,
    'white moves a piece from ranks 1-2'
  );
  assert.ok(nodes > 0, 'node counter must be reported');
  assert.ok(elapsed < 10000, `depth-3 search must stay fast, took ${elapsed}ms`);
});

test('node limit keeps the search bounded and still returns a move', () => {
  const state = fenToState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const { move, nodes } = searchBestMove(state, { depth: 4, nodeLimit: 2000 });
  assert.ok(move, 'search must degrade gracefully under a node cap');
  assert.ok(nodes <= 2500, `node budget must be respected, got ${nodes}`);
});
