import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();

test('Simplified Single-Player HUD in src/App.tsx excludes speed sliders, notation script bar, and multiplayer lobby', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');

  // Must include simplified game & camera controls
  for (const requiredId of [
    'btn-side-toggle',
    'btn-ai-move',
    'btn-reset',
    'btn-cam-player',
    'btn-cam-top',
    'btn-cam-side',
    'btn-cam-wide',
    'btn-hide-ui',
    'controls-hint',
    'captured-tray'
  ]) {
    assert.ok(appTsx.includes(`id="${requiredId}"`), `Missing required HUD control #${requiredId}`);
  }

  // Must NOT include camera speed sliders, script mode bar, or multiplayer lobby
  for (const forbiddenId of [
    'cam-speed-wrap',
    'input-cam-speed',
    'rot-speed-wrap',
    'input-rot-speed',
    'script-bar',
    'btn-script-modal',
    'btn-script-prev',
    'btn-script-next',
    'btn-lobby',
    'lobby-modal',
    'room-pill',
    'btn-checkmate-stepback'
  ]) {
    assert.ok(!appTsx.includes(forbiddenId), `Forbidden UI element #${forbiddenId} found in App.tsx`);
  }
});

test('All 7 compressed 3D assets (.glb.gz.b64) decode and gunzip to valid glTF 2.0 binary models', () => {
  const expectedModels = [
    'option8_cathedral',
    'pawn_white',
    'rook_white',
    'knight_white',
    'bishop_white',
    'queen_white',
    'king_white'
  ];

  for (const name of expectedModels) {
    const b64Path = path.join(ROOT, 'public/assets/glb', `${name}.glb.gz.b64`);
    assert.ok(fs.existsSync(b64Path), `Missing 3D asset ${b64Path}`);
    const b64Text = fs.readFileSync(b64Path, 'utf-8').trim();
    assert.ok(b64Text.length > 1000, `Asset ${name}.glb.gz.b64 is unexpectedly small`);

    const gzBuf = Buffer.from(b64Text, 'base64');
    const glbBuf = zlib.gunzipSync(gzBuf);

    const magic = glbBuf.toString('ascii', 0, 4);
    const version = glbBuf.readUInt32LE(4);
    const totalLen = glbBuf.readUInt32LE(8);
    assert.equal(magic, 'glTF', `Invalid glTF magic header for ${name}`);
    assert.equal(version, 2, `Invalid glTF version for ${name}`);
    assert.equal(totalLen, glbBuf.length, `Mismatched glTF byte length for ${name}`);
  }
});

test('Wizard Chess piece-specific capture styles, audio synthesizers, and checkmate choreography are verified', () => {
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  const audioTs = fs.readFileSync(path.join(ROOT, 'src/wizardChessAudio.ts'), 'utf-8');

  // 1. Audio synthesizers: visceral heavy stone impact, checkmate king topple thud, and rook siege rumble
  assert.ok(audioTs.includes('playHeavyStoneImpact'), 'Missing playHeavyStoneImpact in audio engine');
  assert.ok(audioTs.includes('playKingToppleThud'), 'Missing playKingToppleThud in audio engine');
  assert.ok(audioTs.includes('playRookSiegeRumble'), 'Missing playRookSiegeRumble in audio engine');

  // 2. Piece-specific attack profiles and kinematics in wizardChessEngine.js
  assert.ok(engineJs.includes("piece.type === 'knight'"), 'Missing Knight specific capture logic');
  assert.ok(engineJs.includes("piece.type === 'bishop'"), 'Missing Bishop specific capture logic');
  assert.ok(engineJs.includes("piece.type === 'rook'"), 'Missing Rook specific capture logic');
  assert.ok(engineJs.includes("piece.type === 'queen'"), 'Missing Queen specific capture logic');

  // Knight leaps high and cleaves downward from above onto defender's head
  assert.ok(engineJs.includes('leapElev') || engineJs.includes('jumpProg'), 'Missing Knight jump elevation');
  assert.ok(engineJs.includes('sparkHeight'), 'Missing Knight head-level spark cleave');

  // Queen 360° pirouette spin with golden spark flourish
  assert.ok(engineJs.includes('spinEased * Math.PI * 2'), 'Missing Queen 360 pirouette spin');

  // Rook siege charge with bulldozing displacement shove
  assert.ok(engineJs.includes('playRookSiegeRumble'), 'Missing Rook siege rumble audio trigger');
  assert.ok(engineJs.includes('maxShove'), 'Missing Rook siege shove displacement');

  // 3. Dramatic Checkmate sequence: King falls and lies motionless, victor occupies his square, dynamic zoom
  assert.ok(engineJs.includes('playKingToppleThud'), 'Missing checkmate King topple audio trigger');
  assert.ok(engineJs.includes('stopAllAction'), 'Missing King motionless freeze in checkmate');
  assert.ok(engineJs.includes('attackerPiece.mesh.position.lerpVectors'), 'Missing victor marching to occupy King square');
  assert.ok(engineJs.includes('boardState[kingR][kingC] = attackerPiece'), 'Missing victor claiming King board coordinates');
});

test('Capture attack phase in stepMove declares atkClipTime and handles all piece types', () => {
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');

  // Verify atkClipTime is declared in the strike phase before usage
  const strikePhaseIdx = engineJs.indexOf("phaseName = 'strike';");
  assert.ok(strikePhaseIdx !== -1, "phaseName = 'strike' must exist in engine");
  const atkClipTimeDeclIdx = engineJs.indexOf("const atkClipTime = (elapsed - tApproach) * atkProfile.timeScale;", strikePhaseIdx);
  assert.ok(atkClipTimeDeclIdx !== -1, "atkClipTime must be declared at the start of strike phase");

  // Verify all piece-specific capture branches reference valid timing constants
  for (const pieceType of ['knight', 'bishop', 'rook', 'queen', 'pawn', 'king']) {
    const profileMatch = engineJs.includes(`${pieceType}:`);
    assert.ok(profileMatch, `ATTACK_SYNC_PROFILES must contain profile for ${pieceType}`);
  }
});

test('Camera preset locking, dedicated zoom controls (+/-), and Russian/English bilingual localization are fully wired', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  const i18nTs = fs.readFileSync(path.join(ROOT, 'src/i18n.ts'), 'utf-8');

  // 1. UI elements present in App.tsx
  assert.ok(appTsx.includes('id="btn-lang-toggle"'), 'App.tsx must include #btn-lang-toggle');
  assert.ok(appTsx.includes('id="btn-zoom-in"'), 'App.tsx must include #btn-zoom-in');
  assert.ok(appTsx.includes('id="btn-zoom-out"'), 'App.tsx must include #btn-zoom-out');

  // 2. Camera lock logic in engine: locks orbit/zoom/pan on presets, enables on 'player'
  assert.ok(engineJs.includes('updateOrbitControlsLock'), 'wizardChessEngine.js must have updateOrbitControlsLock');
  assert.ok(engineJs.includes('zoomCamera'), 'wizardChessEngine.js must have zoomCamera');
  assert.ok(engineJs.includes('zoomIn'), 'wizardChessEngine.js must have zoomIn');
  assert.ok(engineJs.includes('zoomOut'), 'wizardChessEngine.js must have zoomOut');
  assert.ok(engineJs.includes('orbitControls.touches = {'), 'wizardChessEngine.js must configure orbitControls.touches');
  assert.ok(engineJs.includes('THREE.TOUCH.NONE'), 'wizardChessEngine.js must lock touch gestures with TOUCH.NONE');

  // 3. Exposed API on window.wizardChess
  assert.ok(engineJs.includes('isCameraLocked'), 'window.wizardChess must expose isCameraLocked');
  assert.ok(engineJs.includes('getCurrentCameraPreset'), 'window.wizardChess must expose getCurrentCameraPreset');
  assert.ok(engineJs.includes('setLanguage'), 'window.wizardChess must expose setLanguage');

  // 4. Bilingual translations dictionary in src/i18n.ts
  assert.ok(i18nTs.includes("ru: {"), 'i18n.ts must define Russian translations');
  assert.ok(i18nTs.includes("en: {"), 'i18n.ts must define English translations');
  assert.ok(i18nTs.includes("brandTitle: 'Wizard Chess'"), 'i18n.ts must have Wizard Chess brand title preserved in Russian');
  assert.ok(i18nTs.includes("Ход белых"), 'i18n.ts must have Russian turn string');
  assert.ok(i18nTs.includes("Мат — Победа белых"), 'i18n.ts must have Russian checkmate string');
});

test('Procedural movement audio: two-phase piece transit slide whisper and tactile landing placement click are synthesized and integrated', () => {
  const audioTs = fs.readFileSync(path.join(ROOT, 'src/wizardChessAudio.ts'), 'utf-8');
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');

  // 1. Audio engine procedural synthesizers exist
  assert.ok(audioTs.includes('playPieceSlide('), 'wizardChessAudio.ts must define playPieceSlide');
  assert.ok(audioTs.includes('playPiecePlacement('), 'wizardChessAudio.ts must define playPiecePlacement');

  // 2. Synthesizer acoustic layers
  assert.ok(audioTs.includes('seamRipple'), 'playPieceSlide must feature granular sliding seam ripple texture');
  assert.ok(audioTs.includes('clickFilter'), 'playPiecePlacement must feature transient click filter');
  assert.ok(audioTs.includes('bodyOsc'), 'playPiecePlacement must feature resonant piece body oscillator');
  assert.ok(audioTs.includes('thudOsc'), 'playPiecePlacement must feature altar board contact thud');

  // 3. Engine integration during moves and touchdown
  assert.ok(engineJs.includes('wizardChessAudio.playPieceSlide(startPos'), 'engine must trigger playPieceSlide at start of movement');
  assert.ok(engineJs.includes('wizardChessAudio.playPiecePlacement(endPos'), 'engine must trigger playPiecePlacement upon reaching destination');
  assert.ok(engineJs.includes("wizardChessAudio.playPiecePlacement(castleRookEndPos, 'rook')"), 'engine must trigger placement sound for castling rook');
});

test('Glowing crimson laser threat indicator, chess clocks for all disciplines, Chess960, and AI levels (Novice to Legend) are verified', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  const stylesCss = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf-8');
  const i18nTs = fs.readFileSync(path.join(ROOT, 'src/i18n.ts'), 'utf-8');

  // 1. Check Threat Glowing Crimson Laser Beam Indicator
  assert.ok(engineJs.includes('getCheckAttackers('), 'engine must implement getCheckAttackers');
  assert.ok(engineJs.includes('showCheckLaserBeams('), 'engine must implement showCheckLaserBeams');
  assert.ok(engineJs.includes('clearCheckLaserBeams('), 'engine must implement clearCheckLaserBeams');
  assert.ok(engineJs.includes('activeCheckBeams'), 'engine must track activeCheckBeams');
  assert.ok(engineJs.includes('checkLaserGroup'), 'engine must have checkLaserGroup in scene');
  assert.ok(engineJs.includes('0xff1e38') || engineJs.includes('0xff1028'), 'engine must use crimson laser materials');

  // 2. Dual Digital Chess Clocks for all disciplines
  assert.ok(appTsx.includes('id="chess-clocks"'), 'App.tsx must include #chess-clocks beside turn status pill');
  assert.ok(appTsx.includes('id="clock-time-w"'), 'App.tsx must include #clock-time-w');
  assert.ok(appTsx.includes('id="clock-time-b"'), 'App.tsx must include #clock-time-b');
  assert.ok(stylesCss.includes('.chess-clock-pill'), 'styles.css must style .chess-clock-pill');
  assert.ok(stylesCss.includes('.clock-box.critical'), 'styles.css must have critical pulsing low-time state');
  const timeControlsJs = fs.readFileSync(path.join(ROOT, 'src/chess/timeControls.js'), 'utf-8');
  assert.ok(timeControlsJs.includes('TIME_CONTROLS'), 'timeControls module must define TIME_CONTROLS dictionary');
  assert.ok(timeControlsJs.includes('formatClockTime'), 'timeControls module must implement formatClockTime');
  assert.ok(timeControlsJs.includes('bullet_1_0') && timeControlsJs.includes('blitz_5_3') && timeControlsJs.includes('rapid_10_0') && timeControlsJs.includes('classical_60_0'), 'timeControls module must cover bullet, blitz, rapid, and classical disciplines');
  assert.ok(engineJs.includes("from './chess/timeControls.js'"), 'engine must import TIME_CONTROLS from the pure module');
  assert.ok(engineJs.includes('stepChessClocks('), 'engine must implement stepChessClocks in loop');
  assert.ok(engineJs.includes('triggerTimeoutVictory('), 'engine must implement flag fall timeout victory');

  // 3. Fischer Random Chess (Chess960) Generator
  assert.ok(engineJs.includes('generateChess960BackRow('), 'engine must implement generateChess960BackRow');
  assert.ok(appTsx.includes('id="select-game-variant"'), 'App.tsx must include #select-game-variant dropdown');
  assert.ok(appTsx.includes('value="chess960"'), 'App.tsx must offer chess960 variant');

  // 4. AI Difficulty Levels: Novice to Legend
  assert.ok(appTsx.includes('id="select-ai-difficulty"'), 'App.tsx must include #select-ai-difficulty');
  for (const diff of ['novice', 'beginner', 'intermediate', 'advanced', 'master', 'legend']) {
    assert.ok(appTsx.includes(`value="${diff}"`), `App.tsx must support difficulty option ${diff}`);
    assert.ok(i18nTs.includes(diff) || i18nTs.includes(`diff${diff[0].toUpperCase()}${diff.slice(1)}`), `i18n.ts must define localization for ${diff}`);
  }
  const aiSearchJs = fs.readFileSync(path.join(ROOT, 'src/chess/aiSearch.js'), 'utf-8');
  assert.ok(aiSearchJs.includes('PAWN_TABLE') && aiSearchJs.includes('KNIGHT_TABLE'), 'AI search module must include piece-square positional tables for AI');
  assert.ok(aiSearchJs.includes('negamax'), 'AI search module must implement negamax with alpha-beta pruning for high AI tiers');
  assert.ok(aiSearchJs.includes('quiescence'), 'AI search module must implement quiescence search (no horizon blunders)');
  assert.ok(aiSearchJs.includes('moveOrderScore'), 'AI search module must implement MVV-LVA move ordering');
  assert.ok(engineJs.includes('coreSearchBestMove'), 'engine must delegate AI search to the pure core module');
});

test('Collapsible Move History panel in bottom-right and Undo Move functionality (2-ply vs AI rollback) are fully implemented', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  const stylesCss = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf-8');
  const i18nTs = fs.readFileSync(path.join(ROOT, 'src/i18n.ts'), 'utf-8');

  // 1. Move History Widget Markup in App.tsx
  assert.ok(appTsx.includes('id="move-history-widget"'), 'App.tsx must include #move-history-widget');
  assert.ok(appTsx.includes('id="btn-history-toggle"'), 'App.tsx must include #btn-history-toggle button');
  assert.ok(appTsx.includes('id="history-count-badge"'), 'App.tsx must include #history-count-badge');
  assert.ok(appTsx.includes('id="move-history-list"'), 'App.tsx must include #move-history-list container');
  assert.ok(appTsx.includes('id="btn-undo"'), 'App.tsx must include #btn-undo in game actions');

  // 2. Styling in styles.css
  assert.ok(stylesCss.includes('.move-history-widget'), 'styles.css must style .move-history-widget');
  assert.ok(stylesCss.includes('.move-history-widget.collapsed'), 'styles.css must have collapsed state');
  assert.ok(stylesCss.includes('.move-history-widget.expanded'), 'styles.css must have expanded state');
  assert.ok(stylesCss.includes('.history-row'), 'styles.css must style algebraic history rows');
  assert.ok(stylesCss.includes('#btn-undo'), 'styles.css must style #btn-undo');

  // 3. Engine Implementation
  assert.ok(engineJs.includes('coreMoveToSan('), 'engine must generate SAN via the pure rules core (coreMoveToSan)');
  assert.ok(engineJs.includes('recordMoveNotation('), 'engine must implement recordMoveNotation');
  assert.ok(engineJs.includes('updateMoveHistoryDOM('), 'engine must implement updateMoveHistoryDOM');
  assert.ok(engineJs.includes('undoChessMove('), 'engine must implement undoChessMove');
  assert.ok(engineJs.includes('pliesToUndo = 2'), 'undoChessMove in vs AI mode must revert 2 plies (AI reply + player move)');
  assert.ok(engineJs.includes('clockWhiteSeconds = snap.clockWhiteSeconds'), 'restoreBoardSnapshot must restore White clock');
  assert.ok(engineJs.includes('clockBlackSeconds = snap.clockBlackSeconds'), 'restoreBoardSnapshot must restore Black clock');

  // 4. API Exposure on window.wizardChess
  assert.ok(engineJs.includes('undoMove: undoChessMove'), 'window.wizardChess must expose undoMove');
  assert.ok(engineJs.includes('getMoveHistoryNotation'), 'window.wizardChess must expose getMoveHistoryNotation');

  // 5. Bilingual i18n
  assert.ok(i18nTs.includes('btnUndo'), 'i18n.ts must define btnUndo');
  assert.ok(i18nTs.includes('moveHistoryTitle'), 'i18n.ts must define moveHistoryTitle');
  assert.ok(i18nTs.includes('moveHistoryEmpty'), 'i18n.ts must define moveHistoryEmpty');
});

test('Bug Fixes: doesPieceAttackSquare enforces diagonal pawn attacks (eliminating false checks/checkmates) and positional score rewards pawn advance', () => {
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  const aiSearchJs = fs.readFileSync(path.join(ROOT, 'src/chess/aiSearch.js'), 'utf-8');

  // 1. Raycasting doesPieceAttackSquare strictly enforces diagonal capture for pawns
  assert.ok(engineJs.includes('function doesPieceAttackSquare('), 'engine must define doesPieceAttackSquare');
  assert.ok(
    engineJs.includes('targetR === fromR + dir && (targetC === fromC - 1 || targetC === fromC + 1)'),
    'pawns must only attack diagonally forward (r + dir, c ± 1); straight moves must never check the king'
  );
  assert.ok(engineJs.includes('doesPieceAttackSquare(p, r, c, kingR, kingC, board)'), 'isKingInCheck must use doesPieceAttackSquare');

  // 2. Positional table score row indexing fixed for pawns
  assert.ok(
    aiSearchJs.includes("const tableRow = p.color === 'w' ? r : (7 - r);"),
    'Pawn positional table row mapping must correctly reward advancing pawns toward center and rank 4/5'
  );

  // 3. Hanging-piece tactics are resolved by quiescence search in the pure AI
  // module rather than the old one-ply doesPieceAttackSquare heuristic
  assert.ok(
    aiSearchJs.includes('function quiescence('),
    'AI search must resolve hanging squares via quiescence search without falsely penalizing pawn files'
  );
});

test('En Passant, Pawn Promotion, and Disambiguated Algebraic Notation are verified', () => {
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');

  // 1. En Passant
  assert.ok(engineJs.includes('let enPassantTarget = null;'), 'engine must declare enPassantTarget');
  assert.ok(engineJs.includes('isEnPassant: true'), 'getPseudoMovesForPiece must generate isEnPassant moves');
  assert.ok(engineJs.includes('savedEpPawn = boardState[m.capturedPawnR][m.capturedPawnC];'), 'getLegalMovesForPiece must simulate en passant during check verification');
  assert.ok(engineJs.includes('boardState[enPassantTarget.pawnR][enPassantTarget.pawnC] = null;'), 'finishMove must remove captured en passant pawn');
  assert.ok(engineJs.includes('enPassantTarget: enPassantTarget ? { ...enPassantTarget } : null'), 'captureBoardSnapshot must save enPassantTarget');

  // 2. Pawn Promotion
  assert.ok(engineJs.includes("piece.type === 'pawn' && (toR === 0 || toR === 7)"), 'finishMove must detect pawn promotion');
  assert.ok(engineJs.includes('instantiatePiece(promoType, piece.color, toR, toC)'), 'finishMove must promote the pawn to the chosen piece (queen/rook/bishop/knight)');
  const rulesJs = fs.readFileSync(path.join(ROOT, 'src/chess/rules.js'), 'utf-8');
  assert.ok(
    rulesJs.includes("for (const promo of ['q', 'r', 'b', 'n'])"),
    'rules core must generate all four promotion choices (q/r/b/n) for the AI search'
  );

  // 3. Disambiguated SAN (single source of truth: rules core)
  assert.ok(rulesJs.includes('export function moveToSan('), 'rules core must implement SAN generation (moveToSan)');
  assert.ok(rulesJs.includes('disambig'), 'moveToSan must disambiguate ambiguous moves');
  assert.ok(rulesJs.includes("'#'"), 'moveToSan must suffix checkmate');
  assert.ok(engineJs.includes('coreMoveToSan(coreStateBefore, coreMove)'), 'engine must delegate SAN to the rules core');
});

test('Gothic Stone Board Textures (Polished Obsidian, Weathered Abbey, Mossy Ruin) and King Threat Aura with Ascending Embers are verified', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  const stylesCss = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf-8');
  const i18nTs = fs.readFileSync(path.join(ROOT, 'src/i18n.ts'), 'utf-8');

  // 1. Board Stone Textures in Engine
  assert.ok(engineJs.includes('BOARD_STONE_LOOKS'), 'engine must define BOARD_STONE_LOOKS');
  assert.ok(engineJs.includes("id: 'obsidian'"), 'engine must define obsidian preset');
  assert.ok(engineJs.includes("id: 'weathered_abbey'"), 'engine must define weathered_abbey preset');
  assert.ok(engineJs.includes("id: 'mossy_ruin'"), 'engine must define mossy_ruin preset');
  assert.ok(engineJs.includes('function applyBoardStoneTexture('), 'engine must define applyBoardStoneTexture');
  assert.ok(engineJs.includes('function createProceduralTileMaps('), 'engine must create procedural stone texture maps');
  assert.ok(engineJs.includes('setBoardStoneTexture: applyBoardStoneTexture'), 'window.wizardChess must expose setBoardStoneTexture');
  assert.ok(engineJs.includes('getBoardStoneTexture:'), 'window.wizardChess must expose getBoardStoneTexture');

  // 2. King Check Threat Aura & Ascending Ember Sparks
  assert.ok(engineJs.includes('function createKingThreatAura('), 'engine must implement createKingThreatAura');
  assert.ok(engineJs.includes('function stepKingThreatAura('), 'engine must implement stepKingThreatAura');
  assert.ok(engineJs.includes('function createFlameAuraTexture('), 'engine must create flame aura texture');
  assert.ok(engineJs.includes('function createEmberSparkTexture('), 'engine must create ember spark particle texture');
  assert.ok(engineJs.includes('activeKingThreatAura'), 'engine must track activeKingThreatAura');
  assert.ok(engineJs.includes('emberPositions'), 'engine must animate emberPositions in particle system');
  assert.ok(engineJs.includes('getActiveKingThreatAura'), 'window.wizardChess must expose getActiveKingThreatAura');

  // 3. UI Controls in App.tsx (Select Dropdown & Interactive Swatch Chips)
  assert.ok(appTsx.includes('id="select-board-texture"'), 'App.tsx must include #select-board-texture dropdown');
  assert.ok(appTsx.includes('value="obsidian"'), 'App.tsx must include obsidian option');
  assert.ok(appTsx.includes('value="weathered_abbey"'), 'App.tsx must include weathered_abbey option');
  assert.ok(appTsx.includes('value="mossy_ruin"'), 'App.tsx must include mossy_ruin option');
  assert.ok(appTsx.includes('className="stone-texture-chips-wrap"'), 'App.tsx must include .stone-texture-chips-wrap for mobile sheet');
  assert.ok(appTsx.includes('swatch-obsidian') && appTsx.includes('swatch-abbey') && appTsx.includes('swatch-mossy'), 'App.tsx must include swatches for all 3 stone styles');

  // 4. Styling in styles.css
  assert.ok(stylesCss.includes('.stone-chip-btn'), 'styles.css must style .stone-chip-btn');
  assert.ok(stylesCss.includes('.swatch-obsidian'), 'styles.css must style .swatch-obsidian');
  assert.ok(stylesCss.includes('.swatch-abbey'), 'styles.css must style .swatch-abbey');
  assert.ok(stylesCss.includes('.swatch-mossy'), 'styles.css must style .swatch-mossy');

  // 5. Bilingual i18n in i18n.ts
  assert.ok(i18nTs.includes('boardTextureLabel'), 'i18n.ts must define boardTextureLabel');
  assert.ok(i18nTs.includes('textureObsidian'), 'i18n.ts must define textureObsidian');
  assert.ok(i18nTs.includes('textureAbbey'), 'i18n.ts must define textureAbbey');
  assert.ok(i18nTs.includes('textureMossy'), 'i18n.ts must define textureMossy');
  assert.ok(i18nTs.includes('Полированный обсидиан'), 'i18n.ts must provide Russian translation for obsidian');
  assert.ok(i18nTs.includes('Старинное аббатство'), 'i18n.ts must provide Russian translation for abbey');
  assert.ok(i18nTs.includes('Мшистые руины'), 'i18n.ts must provide Russian translation for mossy ruin');
});

test('Decluttered UI: Main screen contains only vital elements (Turn, Clocks, Undo, Captured tray), and secondary items are in the unified side drawer', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');
  const stylesCss = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf-8');
  const i18nTs = fs.readFileSync(path.join(ROOT, 'src/i18n.ts'), 'utf-8');

  // 1. Vital Elements on Main Screen
  assert.ok(appTsx.includes('id="btn-undo"'), 'Main screen must contain #btn-undo for 1-tap quick undo');
  assert.ok(appTsx.includes('id="status-pill"'), 'Main screen must contain #status-pill for turn and check status');
  assert.ok(appTsx.includes('id="chess-clocks"'), 'Main screen must contain #chess-clocks');
  assert.ok(appTsx.includes('id="captured-tray"'), 'Main screen bottom HUD must contain #captured-tray');
  assert.ok(appTsx.includes('id="btn-menu-toggle"'), 'Main screen must contain #btn-menu-toggle button');

  // 2. Unified Side Drawer
  assert.ok(appTsx.includes('id="side-drawer"'), 'App.tsx must include #side-drawer');
  assert.ok(appTsx.includes('drawer-backdrop'), 'App.tsx must include .drawer-backdrop');
  assert.ok(stylesCss.includes('.side-drawer'), 'styles.css must style .side-drawer');
  assert.ok(stylesCss.includes('.drawer-backdrop'), 'styles.css must style .drawer-backdrop');

  // 3. Move History Relocated into Drawer
  const sideDrawerStart = appTsx.indexOf('id="side-drawer"');
  const moveHistoryPos = appTsx.indexOf('id="move-history-widget"');
  const capturedTrayPos = appTsx.indexOf('id="captured-tray"');
  assert.ok(sideDrawerStart !== -1, '#side-drawer must exist');
  assert.ok(moveHistoryPos > sideDrawerStart, '#move-history-widget must be placed inside #side-drawer');
  assert.ok(capturedTrayPos > sideDrawerStart, '#captured-tray must be mounted in bottom HUD');

  // 4. Secondary Settings Mounted Inside Drawer
  assert.ok(appTsx.indexOf('id="select-time-control"') > sideDrawerStart, '#select-time-control must be inside drawer');
  assert.ok(appTsx.indexOf('id="select-game-variant"') > sideDrawerStart, '#select-game-variant must be inside drawer');
  assert.ok(appTsx.indexOf('id="select-ai-difficulty"') > sideDrawerStart, '#select-ai-difficulty must be inside drawer');
  assert.ok(appTsx.indexOf('id="select-board-texture"') > sideDrawerStart, '#select-board-texture must be inside drawer');

  // 5. Localization
  assert.ok(i18nTs.includes('menuButton'), 'i18n.ts must define menuButton');
  assert.ok(i18nTs.includes('menuTitle'), 'i18n.ts must define menuTitle');
  assert.ok(i18nTs.includes('Меню святилища'), 'i18n.ts must provide Russian translation for menuTitle');
});

test('Engine lifecycle: dispose() tears down renderer, worker, and listeners; App.tsx calls it on unmount', () => {
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');
  const engineBusTs = fs.readFileSync(path.join(ROOT, 'src/engineBus.ts'), 'utf-8');

  assert.ok(engineJs.includes('function disposeWizardChess('), 'engine must implement disposeWizardChess');
  assert.ok(engineJs.includes('dispose: disposeWizardChess'), 'dispose must be exposed in the engine API');
  assert.ok(engineJs.includes('aiWorkerInstance.terminate()'), 'dispose must terminate the AI worker');
  assert.ok(engineJs.includes("window.removeEventListener('resize', onWindowResize)"), 'dispose must remove the resize listener');
  assert.ok(engineJs.includes('renderer.dispose()'), 'dispose must dispose the WebGL renderer');
  assert.ok(engineJs.includes('forceContextLoss'), 'dispose must force WebGL context loss');
  assert.ok(engineJs.includes('if (engineDisposed) return;'), 'animate loop and startup must stop after dispose');
  assert.ok(engineJs.includes('obj.geometry.dispose()'), 'dispose must release scene geometries');
  assert.ok(engineJs.includes('isTexture) val.dispose()'), 'dispose must release material textures');
  assert.ok(appTsx.includes('dispose?.()'), 'App.tsx must call engine dispose on unmount');
  assert.ok(appTsx.includes('initializedRef.current = false;'), 'App.tsx must allow re-init after dispose');
  assert.ok(engineBusTs.includes('dispose?(): void;'), 'WizardChessApi type must include dispose');
});

test('Dead multiplayer code removed: no room sync, cloud API, or lobby-multi listeners remain in the engine', () => {
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  for (const forbidden of ['CLOUD_MP_API_BASE', 'sendMultiplayerMove', 'applyRemoteRoomState', 'startMultiplayerSync', 'stopMultiplayerSync', 'mpApiRequest', 'createMultiplayerRoom', 'joinMultiplayerRoom', 'getStaticRoom', 'saveAndBroadcastStaticRoom', 'ensurePlayerToken', 'BroadcastChannel', 'wizard_chess_room', 'wizard_chess_token', 'roomEventSource', 'roomPollTimer', 'appliedMoveSeq', 'appliedResetCount', 'roomCode', 'playerToken', 'fromRemote', "gameMode = 'multi'", 'btn-create-room', 'btn-join-room', 'room-pill', 'pick-mp-', 'MULTIPLAYER LOBBY']) {
    assert.ok(!engineJs.includes(forbidden), `Dead multiplayer code must be removed: ${forbidden}`);
  }
  // Single-player & director-script features stay intact
  assert.ok(engineJs.includes("let gameMode = 'single'"), 'single-player mode must remain');
  assert.ok(engineJs.includes('scriptedGameActive'), 'director script feature must remain');
  assert.ok(engineJs.includes('openLobbyModal'), 'lobby modal (script tab) must remain');
  assert.ok(engineJs.includes('function disposeWizardChess('), 'dispose teardown must remain');
});

test('Promotion piece choice: engine preference, SAN correctness, UI selector', () => {
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');
  const i18nTs = fs.readFileSync(path.join(ROOT, 'src/i18n.ts'), 'utf-8');
  const engineBusTs = fs.readFileSync(path.join(ROOT, 'src/engineBus.ts'), 'utf-8');
  assert.ok(engineJs.includes("let promotionPreference = 'queen'"), 'engine must track the promotion preference');
  assert.ok(engineJs.includes('PROMO_CORE_CHAR'), 'SAN must map the chosen piece to a core promo char');
  assert.ok(engineJs.includes('promotion: options.promotion || promotionPreference'), 'move record must use the chosen piece');
  assert.ok(engineJs.includes('const promoType = options.promotion || promotionPreference;'), 'finishMove must instantiate the chosen piece');
  assert.ok(engineJs.includes('setPromotionPiece:'), 'engine API must expose setPromotionPiece');
  assert.ok(engineJs.includes('getPromotionPiece:'), 'engine API must expose getPromotionPiece');
  assert.ok(engineBusTs.includes('setPromotionPiece('), 'WizardChessApi must type setPromotionPiece');
  assert.ok(appTsx.includes('handleSetPromotionPiece'), 'App must wire the promotion selector');
  assert.ok(appTsx.includes('promotionPiece === pp.id'), 'selector must highlight the active piece');
  assert.ok(i18nTs.includes('promotionLabel'), 'i18n must include promotionLabel');
  assert.ok(i18nTs.includes("promotionLabel: 'Превращение пешки'"), 'ru translation required');
  assert.ok(i18nTs.includes("promoKnight: 'Конь'"), 'ru piece names required');
});

test('Promotion: AI search and notation script moves honor their own promotion piece', () => {
  const engineJs = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  assert.ok(engineJs.includes('PROMO_CORE_TO_TYPE'), 'engine must map core promo chars back to piece types');
  assert.ok(engineJs.includes('promotion: coreMove.promotion || null'), 'coreMoveToEngineMove must keep the searched promotion piece');
  assert.ok(engineJs.includes('PROMO_CORE_TO_TYPE[chosen.promotion]'), 'AI moves must apply the searched promotion piece');
  assert.ok(engineJs.includes('promotion: mv.promotion'), 'deferred script moves must pass the parsed promotion piece');
  assert.ok(engineJs.includes('promotion: nextMove.promotion'), 'direct script steps must pass the parsed promotion piece');
});
