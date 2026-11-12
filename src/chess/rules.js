/**
 * Pure chess rules engine for Wizard Chess 3D.
 *
 * No DOM, no Three.js, no I/O — every function is deterministic and testable
 * in isolation (node --test). Board is 8x8: board[0] = rank 8 (black home),
 * board[7] = rank 1 (white home). Column 0 = file 'a'.
 *
 * Supports: standard chess and Chess960 (castling rights keyed by rook home
 * files, FIDE destination/path rules), en passant, promotions (q/r/b/n),
 * fifty-move rule, threefold repetition (positionKey + gameStatus),
 * insufficient material, SAN with disambiguation, FEN import/export, perft.
 */

/** @typedef {'w'|'b'} Color */
/** @typedef {'p'|'n'|'b'|'r'|'q'|'k'} PieceType */

const FILES = 'abcdefgh';

const KNIGHT_JUMPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function fileChar(c) {
  return FILES[c];
}

export function squareName(r, c) {
  return FILES[c] + String(8 - r);
}

// ---------------------------------------------------------------------------
// Position construction
// ---------------------------------------------------------------------------

/**
 * Deterministic Chess960 back row for a given position id (0-959).
 * Bishops on opposite colors, queen anywhere, two knights, king between rooks.
 */
export function generateChess960Layout(id = 518) {
  let seed = (id * 2654435761) >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const row = Array(8).fill(null);
  const empty = () => [0, 1, 2, 3, 4, 5, 6, 7].filter((c) => row[c] === null);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  row[pick([0, 2, 4, 6])] = 'b'; // dark squares (a1 is dark)
  row[pick([1, 3, 5, 7])] = 'b'; // light squares
  row[pick(empty())] = 'q';
  row[pick(empty())] = 'n';
  row[pick(empty())] = 'n';
  const rest = empty();
  row[rest[0]] = 'r';
  row[rest[1]] = 'k';
  row[rest[2]] = 'r';
  return row;
}

/**
 * Creates an initial state. Castling rights are keyed by rook home file,
 * which makes Chess960 work without special cases.
 */
export function createInitialState({ variant = 'standard', layout = null } = {}) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const backRow = variant === 'chess960'
    ? (layout || generateChess960Layout(518))
    : ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRow[c], color: 'b' };
    board[1][c] = { type: 'p', color: 'b' };
    board[6][c] = { type: 'p', color: 'w' };
    board[7][c] = { type: backRow[c], color: 'w' };
  }
  const rookFiles = { w: {}, b: {} };
  for (let c = 0; c < 8; c++) {
    if (backRow[c] === 'r') {
      rookFiles.w[c] = true;
      rookFiles.b[c] = true;
    }
  }
  return { board, turn: 'w', castling: rookFiles, ep: null, halfmove: 0, fullmove: 1 };
}

export function cloneState(state) {
  return {
    board: state.board.map((row) => row.slice()),
    turn: state.turn,
    castling: { w: { ...state.castling.w }, b: { ...state.castling.b } },
    ep: state.ep ? { ...state.ep } : null,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
  };
}

// ---------------------------------------------------------------------------
// Attack detection
// ---------------------------------------------------------------------------

function pathClear(board, fr, fc, tr, tc) {
  const dr = Math.sign(tr - fr);
  const dc = Math.sign(tc - fc);
  let r = fr + dr;
  let c = fc + dc;
  while (r !== tr || c !== tc) {
    if (board[r][c]) return false;
    r += dr;
    c += dc;
  }
  return true;
}

export function pieceAttacks(piece, fr, fc, tr, tc, board) {
  const dr = tr - fr;
  const dc = tc - fc;
  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? -1 : 1;
      return tr === fr + dir && Math.abs(dc) === 1;
    }
    case 'n':
      return (Math.abs(dr) === 1 && Math.abs(dc) === 2) || (Math.abs(dr) === 2 && Math.abs(dc) === 1);
    case 'k':
      return Math.max(Math.abs(dr), Math.abs(dc)) === 1;
    case 'b':
      if (Math.abs(dr) !== Math.abs(dc) || dr === 0) return false;
      return pathClear(board, fr, fc, tr, tc);
    case 'r':
      if (dr !== 0 && dc !== 0) return false;
      return pathClear(board, fr, fc, tr, tc);
    case 'q':
      if (Math.abs(dr) === Math.abs(dc) && dr !== 0) return pathClear(board, fr, fc, tr, tc);
      if (dr === 0 || dc === 0) return pathClear(board, fr, fc, tr, tc);
      return false;
  }
  return false;
}

export function isSquareAttacked(state, r, c, byColor, board = state.board) {
  for (let rr = 0; rr < 8; rr++) {
    for (let cc = 0; cc < 8; cc++) {
      const p = board[rr][cc];
      if (p && p.color === byColor && pieceAttacks(p, rr, cc, r, c, board)) return true;
    }
  }
  return false;
}

export function findKing(state, color, board = state.board) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === 'k') return { r, c };
    }
  }
  return null;
}

export function isKingInCheck(state, color, board = state.board) {
  const king = findKing(state, color, board);
  if (!king) return true;
  return isSquareAttacked(state, king.r, king.c, color === 'w' ? 'b' : 'w', board);
}

// ---------------------------------------------------------------------------
// Move generation
// ---------------------------------------------------------------------------

function mk(fr, fc, tr, tc, capture, isEnPassant, castle, promotion, isDoublePush = false) {
  return {
    from: { r: fr, c: fc },
    to: { r: tr, c: tc },
    capture,
    isEnPassant,
    castle,
    promotion,
    isDoublePush,
    castleRookFrom: -1,
    castleRookTo: -1,
  };
}

function addStep(moves, board, color, fr, fc, tr, tc) {
  if (!inBounds(tr, tc)) return;
  const target = board[tr][tc];
  if (!target) moves.push(mk(fr, fc, tr, tc, false, false, null, null));
  else if (target.color !== color) moves.push(mk(fr, fc, tr, tc, true, false, null, null));
}

function pseudoMoves(state, color) {
  const moves = [];
  const board = state.board;
  const dir = color === 'w' ? -1 : 1;
  const lastRank = color === 'w' ? 0 : 7;
  const startRow = color === 'w' ? 6 : 1;
  const kingDirs = [...ROOK_DIRS, ...BISHOP_DIRS];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      if (p.type === 'p') {
        const r1 = r + dir;
        if (inBounds(r1, c) && !board[r1][c]) {
          if (r1 === lastRank) {
            for (const promo of ['q', 'r', 'b', 'n']) moves.push(mk(r, c, r1, c, false, false, null, promo));
          } else {
            moves.push(mk(r, c, r1, c, false, false, null, null));
            const r2 = r + dir * 2;
            if (r === startRow && !board[r2][c]) {
              moves.push(mk(r, c, r2, c, false, false, null, null, true));
            }
          }
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc;
          if (!inBounds(r1, cc)) continue;
          const target = board[r1][cc];
          if (target && target.color !== color) {
            if (r1 === lastRank) {
              for (const promo of ['q', 'r', 'b', 'n']) moves.push(mk(r, c, r1, cc, true, false, null, promo));
            } else {
              moves.push(mk(r, c, r1, cc, true, false, null, null));
            }
          } else if (!target && state.ep && state.ep.r === r1 && state.ep.c === cc) {
            moves.push(mk(r, c, r1, cc, true, true, null, null));
          }
        }
      } else if (p.type === 'n') {
        for (const [dr, dc] of KNIGHT_JUMPS) addStep(moves, board, color, r, c, r + dr, c + dc);
      } else if (p.type === 'k') {
        for (const [dr, dc] of kingDirs) addStep(moves, board, color, r, c, r + dr, c + dc);
      } else {
        const dirs = p.type === 'r' ? ROOK_DIRS : p.type === 'b' ? BISHOP_DIRS : kingDirs;
        for (const [dr, dc] of dirs) {
          for (let step = 1; step < 8; step++) {
            const nr = r + dr * step;
            const nc = c + dc * step;
            if (!inBounds(nr, nc)) break;
            const target = board[nr][nc];
            if (!target) {
              moves.push(mk(r, c, nr, nc, false, false, null, null));
              continue;
            }
            if (target.color !== color) moves.push(mk(r, c, nr, nc, true, false, null, null));
            break;
          }
        }
      }
    }
  }
  moves.push(...castleMoves(state, color));
  return moves;
}

function squareFreeOr(board, home, c, kc, rookFrom) {
  const occ = board[home][c];
  return !occ || c === kc || c === rookFrom;
}

/**
 * Castling for standard and Chess960 alike:
 * - rights are keyed by the rook's home file;
 * - king travels to g/c-file, rook to f/d-file (standard destination squares);
 * - all squares between the pieces and their destinations must be free
 *   (king and rook may pass each other in Chess960);
 * - every square of the king's path (inclusive) must be safe with both
 *   the king and the castling rook lifted off the board.
 */
function castleMoves(state, color) {
  const moves = [];
  const home = color === 'w' ? 7 : 0;
  const board = state.board;
  let kc = -1;
  for (let c = 0; c < 8; c++) {
    const p = board[home][c];
    if (p && p.type === 'k' && p.color === color) {
      kc = c;
      break;
    }
  }
  if (kc === -1) return moves;
  const rights = state.castling[color] || {};
  const opp = color === 'w' ? 'b' : 'w';
  for (const rfKey of Object.keys(rights)) {
    if (!rights[rfKey]) continue;
    const rookFrom = Number(rfKey);
    const rook = board[home][rookFrom];
    if (!rook || rook.type !== 'r' || rook.color !== color) continue;
    const isKingside = rookFrom > kc;
    const kingTo = isKingside ? 6 : 2;
    const rookTo = isKingside ? 5 : 3;
    if (!squareFreeOr(board, home, kingTo, kc, rookFrom)) continue;
    if (!squareFreeOr(board, home, rookTo, kc, rookFrom)) continue;
    let clear = true;
    for (let c = Math.min(kc, kingTo) + 1; c < Math.max(kc, kingTo); c++) {
      const occ = board[home][c];
      if (occ && c !== kc && c !== rookFrom) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    for (let c = Math.min(rookFrom, rookTo) + 1; c < Math.max(rookFrom, rookTo); c++) {
      const occ = board[home][c];
      if (occ && c !== kc && c !== rookFrom) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    const savedKing = board[home][kc];
    const savedRook = board[home][rookFrom];
    board[home][kc] = null;
    board[home][rookFrom] = null;
    let attacked = false;
    for (let c = Math.min(kc, kingTo); c <= Math.max(kc, kingTo); c++) {
      if (isSquareAttacked(state, home, c, opp)) {
        attacked = true;
        break;
      }
    }
    board[home][kc] = savedKing;
    board[home][rookFrom] = savedRook;
    if (attacked) continue;
    const m = mk(home, kc, home, kingTo, false, false, isKingside ? 'k' : 'q', null);
    m.castleRookFrom = rookFrom;
    m.castleRookTo = rookTo;
    moves.push(m);
  }
  return moves;
}

function clearRight(castling, color, file) {
  if (!castling[color][file]) return castling;
  const next = { w: { ...castling.w }, b: { ...castling.b } };
  delete next[color][file];
  return next;
}

/**
 * Applies a move and returns a NEW state (the input is never mutated).
 */
export function makeMove(state, move) {
  const board = state.board.map((row) => row.slice());
  const piece = board[move.from.r][move.from.c];
  if (!piece) throw new Error('makeMove: no piece on ' + move.from.r + ',' + move.from.c);
  const isPawn = piece.type === 'p';
  const captured = move.isEnPassant ? board[move.from.r][move.to.c] : board[move.to.r][move.to.c];
  const home = piece.color === 'w' ? 7 : 0;
  const rookPiece = move.castle ? board[home][move.castleRookFrom] : null;

  board[move.from.r][move.from.c] = null;
  if (move.isEnPassant) board[move.from.r][move.to.c] = null;
  board[move.to.r][move.to.c] = move.promotion
    ? { type: move.promotion, color: piece.color }
    : piece;

  if (move.castle) {
    if (move.castleRookFrom !== move.to.c) board[home][move.castleRookFrom] = null;
    board[home][move.castleRookTo] = rookPiece;
  }

  let castling = state.castling;
  if (piece.type === 'k') {
    castling = { w: { ...castling.w }, b: { ...castling.b } };
    castling[piece.color] = {};
  } else if (piece.type === 'r' && move.from.r === home) {
    castling = clearRight(castling, piece.color, move.from.c);
  }
  if (captured && captured.type === 'r') {
    castling = clearRight(castling, captured.color, move.to.c);
  }

  return {
    board,
    turn: piece.color === 'w' ? 'b' : 'w',
    castling,
    ep: move.isDoublePush ? { r: (move.from.r + move.to.r) / 2, c: move.from.c } : null,
    halfmove: isPawn || captured ? 0 : state.halfmove + 1,
    fullmove: piece.color === 'b' ? state.fullmove + 1 : state.fullmove,
  };
}

export function legalMoves(state) {
  const color = state.turn;
  const legal = [];
  for (const m of pseudoMoves(state, color)) {
    const next = makeMove(state, m);
    if (!isKingInCheck(next, color)) legal.push(m);
  }
  return legal;
}

export function perft(state, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(makeMove(state, m), depth - 1);
  return n;
}

// ---------------------------------------------------------------------------
// FEN
// ---------------------------------------------------------------------------

export function fenToState(fen) {
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split('/');
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let i = 0; i < 8; i++) {
    let c = 0;
    for (const ch of rows[i]) {
      if (/\d/.test(ch)) {
        c += Number(ch);
        continue;
      }
      board[i][c] = { type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' };
      c++;
    }
  }
  const castling = { w: {}, b: {} };
  if (parts[2] && parts[2] !== '-') {
    for (const ch of parts[2]) {
      if (ch === 'K') castling.w[7] = true;
      else if (ch === 'Q') castling.w[0] = true;
      else if (ch === 'k') castling.b[7] = true;
      else if (ch === 'q') castling.b[0] = true;
      else if (/[A-H]/.test(ch)) castling.w[FILES.indexOf(ch.toLowerCase())] = true;
      else if (/[a-h]/.test(ch)) castling.b[FILES.indexOf(ch)] = true;
    }
  }
  return {
    board,
    turn: parts[1] || 'w',
    castling,
    ep: parts[3] && parts[3] !== '-' ? { r: 8 - Number(parts[3][1]), c: FILES.indexOf(parts[3][0]) } : null,
    halfmove: parts[4] ? Number(parts[4]) : 0,
    fullmove: parts[5] ? Number(parts[5]) : 1,
  };
}

export function stateToFen(state) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let emptyRun = 0;
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) {
        emptyRun++;
        continue;
      }
      if (emptyRun) {
        row += String(emptyRun);
        emptyRun = 0;
      }
      row += p.color === 'w' ? p.type.toUpperCase() : p.type;
    }
    if (emptyRun) row += String(emptyRun);
    rows.push(row);
  }
  let castle = '';
  for (const color of ['w', 'b']) {
    const files = Object.keys(state.castling[color]).map(Number).sort((a, b) => b - a);
    for (const f of files) {
      if (!state.castling[color][f]) continue;
      const letter = f === 7 ? 'K' : f === 0 ? 'Q' : FILES[f].toUpperCase();
      castle += color === 'w' ? letter : letter.toLowerCase();
    }
  }
  const ep = state.ep ? squareName(state.ep.r, state.ep.c) : '-';
  return rows.join('/') + ' ' + state.turn + ' ' + (castle || '-') + ' ' + ep + ' ' + state.halfmove + ' ' + state.fullmove;
}

// ---------------------------------------------------------------------------
// SAN
// ---------------------------------------------------------------------------

export function moveToSan(state, move, legal = null) {
  const moves = legal || legalMoves(state);
  const piece = state.board[move.from.r][move.from.c];
  if (!piece) throw new Error('moveToSan: no piece on ' + move.from.r + ',' + move.from.c);
  let san;
  if (move.castle) {
    san = move.castle === 'k' ? 'O-O' : 'O-O-O';
  } else {
    const isCapture = move.capture || move.isEnPassant;
    if (piece.type === 'p') {
      san = isCapture
        ? fileChar(move.from.c) + 'x' + squareName(move.to.r, move.to.c)
        : squareName(move.to.r, move.to.c);
      if (move.promotion) san += '=' + move.promotion.toUpperCase();
    } else {
      san = piece.type.toUpperCase();
      const others = moves.filter((m) =>
        !(m.from.r === move.from.r && m.from.c === move.from.c) &&
        m.to.r === move.to.r && m.to.c === move.to.c &&
        state.board[m.from.r][m.from.c] &&
        state.board[m.from.r][m.from.c].type === piece.type);
      if (others.length) {
        const sameFile = others.some((m) => m.from.c === move.from.c);
        const sameRank = others.some((m) => m.from.r === move.from.r);
        if (!sameFile) san += fileChar(move.from.c);
        else if (!sameRank) san += String(8 - move.from.r);
        else san += squareName(move.from.r, move.from.c);
      }
      if (isCapture) san += 'x';
      san += squareName(move.to.r, move.to.c);
    }
  }
  const next = makeMove(state, move);
  if (isKingInCheck(next, next.turn)) {
    san += legalMoves(next).length === 0 ? '#' : '+';
  }
  return san;
}

// ---------------------------------------------------------------------------
// Draw rules & game status
// ---------------------------------------------------------------------------

export function insufficientMaterial(state) {
  const minors = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.type !== 'k') minors.push({ type: p.type, squareColor: (r + c) % 2 });
    }
  }
  if (minors.length === 0) return true;
  if (minors.length === 1 && (minors[0].type === 'b' || minors[0].type === 'n')) return true;
  if (minors.every((p) => p.type === 'b') && minors.every((p) => p.squareColor === minors[0].squareColor)) return true;
  return false;
}

/**
 * Position identity for repetition detection: placement + side to move +
 * castling rights + en passant target (only when an ep capture is possible).
 */
export function positionKey(state) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      row += p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : '-';
    }
    rows.push(row);
  }
  let castle = '';
  for (const color of ['w', 'b']) {
    const files = Object.keys(state.castling[color]).map(Number).sort((a, b) => b - a);
    for (const f of files) {
      if (state.castling[color][f]) castle += color + f;
    }
  }
  let epKey = '-';
  if (state.ep) {
    const dir = state.turn === 'w' ? -1 : 1;
    for (const dc of [-1, 1]) {
      const pr = state.ep.r - dir;
      const pc = state.ep.c + dc;
      if (inBounds(pr, pc)) {
        const p = state.board[pr][pc];
        if (p && p.type === 'p' && p.color === state.turn) {
          epKey = squareName(state.ep.r, state.ep.c);
          break;
        }
      }
    }
  }
  return rows.join('') + ' ' + state.turn + ' ' + castle + ' ' + epKey;
}

/**
 * Full game status. repetitionCounts maps positionKey -> occurrence count
 * (the caller maintains it across the game history).
 */
export function gameStatus(state, repetitionCounts = null) {
  const moves = legalMoves(state);
  if (moves.length === 0) {
    return isKingInCheck(state, state.turn)
      ? { result: 'checkmate', winner: state.turn === 'w' ? 'b' : 'w' }
      : { result: 'stalemate' };
  }
  if (insufficientMaterial(state)) return { result: 'draw', reason: 'insufficient-material' };
  if (state.halfmove >= 100) return { result: 'draw', reason: 'fifty-move' };
  if (repetitionCounts) {
    const key = positionKey(state);
    if ((repetitionCounts[key] || 0) >= 3) return { result: 'draw', reason: 'threefold' };
  }
  return { result: 'ongoing', legalMoves: moves };
}
