/**
 * Regression tests for the notation parser (src/chess/notation.js).
 * Run: node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseNotationToMoves } from '../src/chess/notation.js';

test('parses the default director game: SAN, captures, check suffixes', () => {
  const pgn =
    '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qd8 4. d4 c6 5. Bc4 h6 6. Nf3 Bg4 7. Bxf7+ Kxf7 8. Ne5+ Ke8 9. Qxg4 Nf6 10. Qg6#';
  const moves = parseNotationToMoves(pgn);

  assert.equal(moves.length, 19, `expected 19 plies, got ${moves.length}`);
  assert.deepEqual(
    [moves[0].fromR, moves[0].fromC, moves[0].toR, moves[0].toC],
    [6, 4, 4, 4],
    'first move must be e2-e4'
  );
  assert.equal(moves[0].pieceType, 'pawn');
  assert.equal(moves[1].color, 'b', 'second ply is black');
  assert.equal(moves[2].capture, true, 'exd5 is a capture');
  assert.equal(moves[18].toC, 6, 'final Qg6 lands on the g-file');
  assert.ok(moves.every((m, i) => m.ply === i + 1), 'plies are sequential');
  assert.equal(moves[3].moveNumber, 2, 'ply 4 belongs to move number 2');
});

test('parses UCI moves and castling', () => {
  const moves = parseNotationToMoves('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 e1g1');
  assert.equal(moves.length, 7);
  assert.deepEqual(
    [moves[0].fromR, moves[0].fromC, moves[0].toR, moves[0].toC],
    [6, 4, 4, 4]
  );
  const castle = moves[6];
  assert.deepEqual(
    [castle.fromR, castle.fromC, castle.toR, castle.toC],
    [7, 4, 7, 6],
    'e1g1 must be parsed as white kingside castling'
  );
  assert.equal(castle.pieceType, 'king');
});

test('parses SAN castling (O-O) and disambiguation (Nbd7)', () => {
  const moves = parseNotationToMoves('1. d4 d5 2. Nf3 Nf6 3. Nc3 e6 4. Bf4 Bd6 5. e3 O-O 6. Bd3 Nbd7');
  assert.equal(moves.length, 12);
  const castle = moves[9]; // 10th ply: black's O-O
  assert.deepEqual([castle.fromR, castle.fromC, castle.toR, castle.toC], [0, 4, 0, 6], 'O-O is black kingside castling');
  const nbd7 = moves[11];
  assert.equal(nbd7.fromC, 1, 'Nbd7 must pick the b8 knight (file disambiguation)');
  assert.equal(nbd7.pieceType, 'knight');
});

test('parses promotion notation (bxa8=Q)', () => {
  const moves = parseNotationToMoves('1. e4 d5 2. exd5 c6 3. dxc6 Nf6 4. cxb7 Bd7 5. bxa8=Q');
  assert.equal(moves.length, 9);
  const promo = moves[8];
  assert.equal(promo.pieceType, 'pawn');
  assert.equal(promo.capture, true, 'bxa8=Q captures the rook on a8');
  assert.equal(promo.promotion, 'queen');
  assert.deepEqual([promo.fromR, promo.fromC, promo.toR, promo.toC], [1, 1, 0, 0]);
});

test('strips PGN headers, comments and results', () => {
  const pgn = [
    '[Event "Wizard Cathedral"]',
    '[Result "1-0"]',
    '',
    '1. e4 {best by test} e5 2. Nf3 1-0'
  ].join('\n');
  const moves = parseNotationToMoves(pgn);
  assert.equal(moves.length, 3, 'headers, comments and the result must be ignored');
});

test('stops at the first illegal token and keeps the valid prefix', () => {
  const moves = parseNotationToMoves('1. e4 e5 2. Ke2 Ke7 3. h4 h5 4. Qxh5 Qxh5?? nonsense');
  assert.ok(moves.length >= 6, 'valid prefix must be kept');
  assert.ok(
    moves.every((m) => m.san !== 'nonsense'),
    'illegal trailing tokens must not produce moves'
  );
});

test('parses against a custom starting position (FEN)', () => {
  // Rook endgame: white to move, Ra1-a8 is mate in one... (not asserted as
  // mate here — only that FEN import works and the rook moves along rank 1)
  const moves = parseNotationToMoves('Ra8', { fen: '6k1/8/8/8/8/8/8/R5K1 w - - 0 1' });
  assert.equal(moves.length, 1);
  assert.equal(moves[0].pieceType, 'rook');
  assert.deepEqual([moves[0].fromR, moves[0].fromC, moves[0].toR, moves[0].toC], [7, 0, 0, 0]);
});
