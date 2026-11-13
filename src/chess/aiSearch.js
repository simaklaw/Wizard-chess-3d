/**
 * Pure AI search for Wizard Chess 3D.
 *
 * No DOM, no Three.js — runs identically on the main thread and inside a
 * Web Worker, and is fully testable with `node --test` (Debug It! rule:
 * every fix ships with a regression test).
 *
 * Features:
 * - negamax alpha-beta over the pure rules core (src/chess/rules.js);
 * - quiescence search on captures/promotions (no horizon-effect blunders);
 * - MVV-LVA move ordering (most valuable victim, least valuable attacker);
 * - material + piece-square-table evaluation with check bonus;
 * - optional root jitter for weaker difficulty tiers;
 * - node budget so a search can never run away.
 */

import { legalMoves, makeMove, isKingInCheck } from './rules.js';

export const MATE_SCORE = 100000;
export const MAX_QUIESCENCE_DEPTH = 6;
export const DEFAULT_NODE_LIMIT = 400000;

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables, white's perspective, row 0 = rank 8 (black home row).
const PAWN_TABLE = [
  [ 0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [ 5,  5, 10, 25, 25, 10,  5,  5],
  [ 0,  0,  0, 20, 20,  0,  0,  0],
  [ 5, -5,-10,  0,  0,-10, -5,  5],
  [ 5, 10, 10,-20,-20, 10, 10,  5],
  [ 0,  0,  0,  0,  0,  0,  0,  0]
];

const KNIGHT_TABLE = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
];

const BISHOP_TABLE = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
];

const ROOK_TABLE = [
  [ 0,  0,  0,  0,  0,  0,  0,  0],
  [ 5, 10, 10, 10, 10, 10, 10,  5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [ 0,  0,  0,  5,  5,  0,  0,  0]
];

const QUEEN_TABLE = [
  [-20,-10,-10, -5, -5,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5,  5,  5,  5,  0,-10],
  [ -5,  0,  5,  5,  5,  5,  0, -5],
  [  0,  0,  5,  5,  5,  5,  0, -5],
  [-10,  5,  5,  5,  5,  5,  0,-10],
  [-10,  0,  5,  0,  0,  0,  0,-10],
  [-20,-10,-10, -5, -5,-10,-10,-20]
];

const KING_TABLE = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [ 20, 20,  0,  0,  0,  0, 20, 20],
  [ 20, 30, 10,  0,  0, 10, 30, 20]
];

const PIECE_TABLES = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_TABLE,
};

/**
 * Static evaluation in centipawns, always from the perspective of the side
 * to move (negamax convention).
 */
export function evaluate(state) {
  let whiteScore = 0;
  let blackScore = 0;
  const board = state.board;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const table = PIECE_TABLES[p.type];
      const tableRow = p.color === 'w' ? r : (7 - r);
      const val = PIECE_VALUES[p.type] + (table ? table[tableRow][c] : 0);
      if (p.color === 'w') whiteScore += val;
      else blackScore += val;
    }
  }
  // Check threat bonuses
  if (isKingInCheck(state, 'b')) whiteScore += 45;
  if (isKingInCheck(state, 'w')) blackScore += 45;
  return state.turn === 'w' ? (whiteScore - blackScore) : (blackScore - whiteScore);
}

/**
 * MVV-LVA ordering score: captures first (most valuable victim, least
 * valuable attacker), then promotions. Higher sorts earlier.
 */
export function moveOrderScore(state, move) {
  let score = 0;
  const victim = move.isEnPassant ? { type: 'p' } : state.board[move.to.r][move.to.c];
  const attacker = state.board[move.from.r][move.from.c];
  if (victim && attacker) {
    score = 100000 + PIECE_VALUES[victim.type] * 10 - PIECE_VALUES[attacker.type];
  }
  if (move.promotion) {
    score += 90000 + PIECE_VALUES[move.promotion];
  }
  return score;
}

/** Sorts moves best-first (captures/promotions ahead of quiet moves). */
export function orderMoves(state, moves) {
  return moves
    .map((m) => ({ m, s: moveOrderScore(state, m) }))
    .sort((a, b) => b.s - a.s)
    .map((entry) => entry.m);
}

let nodeCount = 0;
let nodeLimit = DEFAULT_NODE_LIMIT;

function quiescence(state, alpha, beta, qdepth) {
  nodeCount++;
  const standPat = evaluate(state);
  if (qdepth >= MAX_QUIESCENCE_DEPTH || nodeCount > nodeLimit) return standPat;
  if (standPat >= beta) return standPat;
  if (standPat > alpha) alpha = standPat;

  const tactical = legalMoves(state).filter((m) => m.capture || m.isEnPassant || m.promotion);
  for (const m of orderMoves(state, tactical)) {
    const score = -quiescence(makeMove(state, m), -beta, -alpha, qdepth + 1);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(state, depth, alpha, beta, ply) {
  nodeCount++;
  if (nodeCount > nodeLimit || depth <= 0) {
    return quiescence(state, alpha, beta, 0);
  }
  const moves = orderMoves(state, legalMoves(state));
  if (moves.length === 0) {
    return isKingInCheck(state, state.turn) ? -MATE_SCORE + ply : 0;
  }
  let best = -Infinity;
  for (const m of moves) {
    const score = -negamax(makeMove(state, m), depth - 1, -beta, -alpha, ply + 1);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Searches the best move for the side to move.
 *
 * @param {object} state - core rules state (see src/chess/rules.js).
 * @param {{depth?: number, jitter?: number, nodeLimit?: number}} options
 * @returns {{move: object|null, score: number, nodes: number}}
 *   `move` is a core rules move (from/to/capture/castle/promotion...) or
 *   null when the game is over (checkmate/stalemate).
 */
export function searchBestMove(state, options = {}) {
  const depth = Math.max(1, Math.min(6, Number(options.depth) || 3));
  const jitter = Number(options.jitter) || 0;
  nodeLimit = Number(options.nodeLimit) || DEFAULT_NODE_LIMIT;
  nodeCount = 0;

  const moves = orderMoves(state, legalMoves(state));
  if (moves.length === 0) {
    return {
      move: null,
      score: isKingInCheck(state, state.turn) ? -MATE_SCORE : 0,
      nodes: nodeCount,
    };
  }

  let bestMove = moves[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const useRootPruning = jitter === 0;

  for (const m of moves) {
    const raw = -negamax(makeMove(state, m), depth - 1, -Infinity, useRootPruning ? -alpha : Infinity, 1);
    const score = jitter > 0 ? raw + (Math.random() - 0.5) * jitter : raw;
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
    if (useRootPruning && bestScore > alpha) alpha = bestScore;
  }

  return { move: bestMove, score: bestScore, nodes: nodeCount };
}
