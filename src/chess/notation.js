/**
 * Chess notation parser (PGN / SAN / UCI) for Wizard Chess 3D.
 *
 * Rewritten on top of the pure rules core (src/chess/rules.js): the old
 * engine copy simulated moves on a hand-rolled "virtual board"; now every
 * token is matched against `legalMoves()` from the core, so castling rights,
 * en passant and promotions are exactly as legal as in the real game.
 *
 * Output stays in the engine's move format (full-word piece types, row/col
 * pairs) so `loadNotationScript` needs no adaptation.
 *
 * Pure module: no DOM, no Three.js — testable with `node --test`.
 */

import { createInitialState, fenToState, makeMove, legalMoves } from './rules.js';

const CORE_TO_ENGINE_TYPE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const PROMO_TO_ENGINE = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };

const RESULT_PATTERN = /^(1-0|0-1|1\/2-1\/2|\*)$/;
const CASTLING_PATTERN = /^(O-O-O|0-0-0|O-O|0-0)$/i;
const UCI_PATTERN = /^([a-h])([1-8])[-x]?([a-h])([1-8])(?:=?([qrbnQRBN]))?$/;

/** Strips PGN headers, comments, NAGs, variations and move numbers. */
function tokenizeNotation(notationText) {
  const cleaned = String(notationText || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ')
    .replace(/\([^)]*\)/g, ' ');

  return cleaned
    .split(/\s+/)
    .map((t) => t.replace(/^\d+\.+/g, '').trim())
    .filter((t) => t && !RESULT_PATTERN.test(t) && !/^\d+\.?$/.test(t));
}

function findCastlingMove(moves, rawTok) {
  if (!CASTLING_PATTERN.test(rawTok)) return null;
  const side = /O-O-O|0-0-0/i.test(rawTok) ? 'q' : 'k';
  return moves.find((m) => m.castle === side) || null;
}

/** Coordinate / UCI notation (e.g. e2e4, e2-e4, e4xd5, g1f3, e7e8q). */
function findUciMove(moves, rawTok) {
  const uci = rawTok.match(UCI_PATTERN);
  if (!uci) return null;
  const fromC = uci[1].charCodeAt(0) - 97;
  const fromR = 8 - parseInt(uci[2], 10);
  const toC = uci[3].charCodeAt(0) - 97;
  const toR = 8 - parseInt(uci[4], 10);
  const promo = uci[5] ? uci[5].toLowerCase() : null;
  return (
    moves.find((m) =>
      m.from.r === fromR && m.from.c === fromC &&
      m.to.r === toR && m.to.c === toC &&
      (m.promotion || null) === promo
    ) || null
  );
}

/**
 * Standard Algebraic Notation (e4, exd5, Nf3, Nbd7, R1e2, Qh4e1, e8=Q).
 * Verifies piece type, destination, capture flag and file/rank disambiguation
 * against the actual legal moves of the simulated position.
 */
function findSanMove(state, moves, rawTok) {
  let rest = rawTok.replace(/[+#!?]+$/g, '');
  if (!rest) return null;

  let promotion = null;
  const promoEq = rest.match(/=([QRBNqrbn])$/);
  if (promoEq) {
    promotion = promoEq[1].toLowerCase();
    rest = rest.slice(0, -2);
  }

  let pieceType = 'p';
  if (/^[NBRQK]/.test(rest)) {
    pieceType = { N: 'n', B: 'b', R: 'r', Q: 'q', K: 'k' }[rest[0]];
    rest = rest.slice(1);
  } else if (/^P/.test(rest)) {
    rest = rest.slice(1);
  }

  const destMatch = rest.match(/([a-h])([1-8])$/);
  if (!destMatch) return null;
  const toC = destMatch[1].charCodeAt(0) - 97;
  const toR = 8 - parseInt(destMatch[2], 10);
  const requiresCapture = rest.includes('x');
  const prefix = rest.slice(0, rest.length - 2).replace(/x/g, '');

  let disambigC = null;
  let disambigR = null;
  for (const ch of prefix) {
    if (ch >= 'a' && ch <= 'h') disambigC = ch.charCodeAt(0) - 97;
    else if (ch >= '1' && ch <= '8') disambigR = 8 - parseInt(ch, 10);
  }

  for (const m of moves) {
    if (m.to.r !== toR || m.to.c !== toC) continue;
    if (requiresCapture && !(m.capture || m.isEnPassant)) continue;
    if (disambigC !== null && m.from.c !== disambigC) continue;
    if (disambigR !== null && m.from.r !== disambigR) continue;
    const mover = state.board[m.from.r][m.from.c];
    if (!mover || mover.type !== pieceType) continue;
    return m;
  }
  return null;
}

/**
 * Parses PGN/SAN/UCI notation into engine-format moves.
 * Parsing stops at the first token that is not a legal move in the
 * simulated position (same behaviour as the old engine parser).
 *
 * @param {string} notationText
 * @param {{fen?: string}} [options] - optional custom starting position
 * @returns {Array<object>} moves: { index, ply, moveNumber, color, san,
 *   fromR, fromC, toR, toC, pieceType, capture, promotion }
 */
export function parseNotationToMoves(notationText, options = {}) {
  const tokens = tokenizeNotation(notationText);
  let state = options.fen ? fenToState(options.fen) : createInitialState();

  const parsedMoves = [];
  for (const rawTok of tokens) {
    const moves = legalMoves(state);
    const matched =
      findCastlingMove(moves, rawTok) ||
      findUciMove(moves, rawTok) ||
      findSanMove(state, moves, rawTok);

    if (!matched) {
      console.warn('Could not parse notation token:', rawTok);
      break;
    }

    const movingPiece = state.board[matched.from.r][matched.from.c];
    parsedMoves.push({
      index: parsedMoves.length,
      ply: parsedMoves.length + 1,
      moveNumber: Math.floor(parsedMoves.length / 2) + 1,
      color: state.turn,
      san: rawTok,
      fromR: matched.from.r,
      fromC: matched.from.c,
      toR: matched.to.r,
      toC: matched.to.c,
      pieceType: CORE_TO_ENGINE_TYPE[movingPiece.type] || movingPiece.type,
      capture: Boolean(matched.capture || matched.isEnPassant),
      promotion: matched.promotion ? PROMO_TO_ENGINE[matched.promotion] : 'queen'
    });

    state = makeMove(state, matched);
  }

  return parsedMoves;
}
