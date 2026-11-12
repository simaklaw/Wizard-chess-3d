export type Language = 'en' | 'ru';

export interface Translations {
  brandTitle: string;
  loaderTitle: string;
  loaderText: string;
  turnWhite: string;
  turnBlack: string;
  checkSuffix: string;
  aiSuffix: string;
  checkmateWhiteWins: string;
  checkmateBlackWins: string;
  stalemateDraw: string;
  playingAsWhite: string;
  playingAsBlack: string;
  btnPlayAsWhite: string;
  btnPlayAsBlack: string;
  btnAiMove: string;
  btnNewGame: string;
  btnUndo: string;
  moveHistoryTitle: string;
  moveHistoryEmpty: string;
  expandHistory: string;
  collapseHistory: string;
  moveNumber: string;
  cameraViews: string;
  cameraViewsSub: string;
  camPlayer: string;
  camTop: string;
  camSide: string;
  camWide: string;
  zoomIn: string;
  zoomOut: string;
  soundDisplay: string;
  soundOn: string;
  soundMuted: string;
  hideUI: string;
  showUI: string;
  controlsMobile: string;
  closeMobile: string;
  gameActions: string;
  mobileTouchHint: string;
  controlsHint: string;
  capturedPrefix: string;
  capturedWhite: string;
  capturedBlack: string;
  checkmateBannerOrnament: string;
  checkmateTitle: string;
  checkmateWhiteTriumphs: string;
  checkmateBlackTriumphs: string;
  replayKingFall: string;
  dismiss: string;
  langToggleTitle: string;

  // New features: Time Controls & Clocks
  timeControl: string;
  bullet: string;
  blitz: string;
  rapid: string;
  classical: string;
  untimed: string;
  timeOutWhiteWins: string;
  timeOutBlackWins: string;
  whiteClockLabel: string;
  blackClockLabel: string;

  // Game Variants: Standard & Chess960
  gameVariant: string;
  variantStandard: string;
  variant960: string;
  chess960Layout: string;

  // AI Difficulty Levels
  difficulty: string;
  diffNovice: string;
  diffBeginner: string;
  diffIntermediate: string;
  diffAdvanced: string;
  diffMaster: string;
  diffLegend: string;

  // Check Laser Threat
  checkThreat: string;

  // Board Stone Textures
  boardTextureLabel: string;
  textureObsidian: string;
  textureAbbey: string;
  textureMossy: string;

  // Unified Sanctum Drawer Menu
  menuButton: string;
  menuTitle: string;
  matchSettings: string;
  controlsGuideTitle: string;

  // Interactive History Navigation & Last Move
  returnToLiveGame: string;
  previewingMovePrefix: string;
  whitePiece: string;
  blackPiece: string;

  // Cathedral Cinematic Tour
  skipTour: string;
  cathedralTour: string;

  // Sanctum Menu Category Tabs
  tabGame: string;
  tabBoard: string;
  tabCamera: string;
  tabAudio: string;
  quickActions: string;
  keyboardShortcuts: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    brandTitle: 'Wizard Chess',
    loaderTitle: 'Wizard Chess',
    loaderText: 'Summoning Sanctum Architecture & Sculpted Pieces...',
    turnWhite: 'White to Move',
    turnBlack: 'Black to Move',
    checkSuffix: ' (Check!)',
    aiSuffix: ' (AI)...',
    checkmateWhiteWins: 'Checkmate — White Wins',
    checkmateBlackWins: 'Checkmate — Black Wins',
    stalemateDraw: 'Stalemate — Draw',
    playingAsWhite: 'Playing as White',
    playingAsBlack: 'Playing as Black',
    btnPlayAsWhite: 'Play as White',
    btnPlayAsBlack: 'Play as Black',
    btnAiMove: 'AI Move',
    btnNewGame: 'New Game',
    btnUndo: 'Undo Move',
    moveHistoryTitle: 'Move History',
    moveHistoryEmpty: 'No moves played yet',
    expandHistory: 'Expand',
    collapseHistory: 'Collapse',
    moveNumber: '#',
    cameraViews: 'Camera Views',
    cameraViewsSub: 'Tap active view to flip',
    camPlayer: 'Player Cam',
    camTop: 'Overhead',
    camSide: 'Side',
    camWide: 'Cathedral',
    zoomIn: 'Zoom In (+)',
    zoomOut: 'Zoom Out (−)',
    soundDisplay: 'Sound & Display',
    soundOn: 'Sound: On',
    soundMuted: 'Sound: Muted',
    hideUI: 'Hide UI [H]',
    showUI: 'Show UI',
    controlsMobile: 'Controls',
    closeMobile: 'Close ✕',
    gameActions: 'Game Actions',
    mobileTouchHint: 'Touch: Tap Piece to Move • 1-Finger Drag: Orbit • 2-Finger Drag: Pan • Pinch: Zoom',
    controlsHint: 'Controls: Click Piece to Move • Left-Drag: Orbit • Right-Drag: Pan • Scroll: Zoom • WASD + R/F: Fly Cam • H: Hide UI',
    capturedPrefix: 'Captured',
    capturedWhite: 'White',
    capturedBlack: 'Black',
    checkmateBannerOrnament: '✦   Sanctum Judgment   ✦',
    checkmateTitle: 'Checkmate',
    checkmateWhiteTriumphs: 'White Triumphs • The Black King Has Fallen',
    checkmateBlackTriumphs: 'Black Triumphs • The White King Has Fallen',
    replayKingFall: 'Replay King Fall',
    dismiss: 'Dismiss',
    langToggleTitle: 'Switch to Russian',

    timeControl: 'Time Control',
    bullet: 'Bullet',
    blitz: 'Blitz',
    rapid: 'Rapid',
    classical: 'Classical',
    untimed: 'Untimed',
    timeOutWhiteWins: 'Time Out — White Wins',
    timeOutBlackWins: 'Time Out — Black Wins',
    whiteClockLabel: 'White',
    blackClockLabel: 'Black',

    gameVariant: 'Variant',
    variantStandard: 'Standard',
    variant960: 'Fischer Random (Chess960)',
    chess960Layout: 'Chess960 #',

    difficulty: 'Difficulty',
    diffNovice: 'Novice',
    diffBeginner: 'Beginner',
    diffIntermediate: 'Intermediate',
    diffAdvanced: 'Advanced',
    diffMaster: 'Grandmaster',
    diffLegend: 'Legend',

    checkThreat: 'Check Threat!',
    boardTextureLabel: 'Board Stone',
    textureObsidian: 'Polished Obsidian',
    textureAbbey: 'Weathered Abbey',
    textureMossy: 'Mossy Ruin',

    menuButton: 'Menu',
    menuTitle: 'Sanctum Menu',
    matchSettings: 'Match Settings',
    controlsGuideTitle: 'Controls Guide',

    returnToLiveGame: 'Return to Live Game',
    previewingMovePrefix: 'Viewing Move',
    whitePiece: 'White',
    blackPiece: 'Black',

    skipTour: 'Skip Tour ✕',
    cathedralTour: 'Cathedral Tour',

    tabGame: 'Game',
    tabBoard: 'Board',
    tabCamera: 'Camera',
    tabAudio: 'Sound',
    quickActions: 'Quick Actions',
    keyboardShortcuts: 'Keyboard Shortcuts'
  },
  ru: {
    brandTitle: 'Wizard Chess',
    loaderTitle: 'Wizard Chess',
    loaderText: 'Призыв архитектуры святилища и каменных фигур...',
    turnWhite: 'Ход белых',
    turnBlack: 'Ход чёрных',
    checkSuffix: ' (Шах!)',
    aiSuffix: ' (ИИ)...',
    checkmateWhiteWins: 'Мат — Победа белых',
    checkmateBlackWins: 'Мат — Победа чёрных',
    stalemateDraw: 'Пат — Ничья',
    playingAsWhite: 'Игра за белых',
    playingAsBlack: 'Игра за чёрных',
    btnPlayAsWhite: 'Играть за белых',
    btnPlayAsBlack: 'Играть за чёрных',
    btnAiMove: 'Ход ИИ',
    btnNewGame: 'Новая игра',
    btnUndo: 'Отменить ход',
    moveHistoryTitle: 'История ходов',
    moveHistoryEmpty: 'Ходы еще не сделаны',
    expandHistory: 'Развернуть',
    collapseHistory: 'Свернуть',
    moveNumber: '№',
    cameraViews: 'Вид камеры',
    cameraViewsSub: 'Повторное нажатие — разворот',
    camPlayer: 'Игрок',
    camTop: 'Сверху',
    camSide: 'Сбоку',
    camWide: 'Собор',
    zoomIn: 'Приблизить (+)',
    zoomOut: 'Отдалить (−)',
    soundDisplay: 'Звук и интерфейс',
    soundOn: 'Звук: Вкл',
    soundMuted: 'Звук: Выкл',
    hideUI: 'Скрыть интерфейс [H]',
    showUI: 'Показать интерфейс',
    controlsMobile: 'Управление',
    closeMobile: 'Закрыть ✕',
    gameActions: 'Действия',
    mobileTouchHint: 'Сенсор: Нажмите на фигуру для хода • 1 палец: вращение • 2 пальца: панорама • Кнопки +/-: зум',
    controlsHint: 'Управление: Клик по фигуре для хода • ЛКМ: вращение • ПКМ: панорама • +/-: зум • WASD + R/F: свободная камера • H: скрыть интерфейс',
    capturedPrefix: 'Взятые фигуры',
    capturedWhite: 'Белые',
    capturedBlack: 'Чёрные',
    checkmateBannerOrnament: '✦   Суд святилища   ✦',
    checkmateTitle: 'Мат',
    checkmateWhiteTriumphs: 'Триумф белых • Чёрный король пал',
    checkmateBlackTriumphs: 'Триумф чёрных • Белый король пал',
    replayKingFall: 'Повторить падение короля',
    dismiss: 'Закрыть',
    langToggleTitle: 'Переключить на английский',

    timeControl: 'Контроль времени',
    bullet: 'Пуля (Bullet)',
    blitz: 'Блиц (Blitz)',
    rapid: 'Рапид (Rapid)',
    classical: 'Классические шахматы',
    untimed: 'Без времени',
    timeOutWhiteWins: 'Время вышло — Победа белых',
    timeOutBlackWins: 'Время вышло — Победа чёрных',
    whiteClockLabel: 'Белые',
    blackClockLabel: 'Чёрные',

    gameVariant: 'Вариант игры',
    variantStandard: 'Классическая расстановка',
    variant960: 'Шахматы Фишера (960)',
    chess960Layout: 'Шахматы-960 №',

    difficulty: 'Сложность ИИ',
    diffNovice: 'Новичок',
    diffBeginner: 'Любитель',
    diffIntermediate: 'Клубный игрок',
    diffAdvanced: 'Мастер',
    diffMaster: 'Гроссмейстер',
    diffLegend: 'Легенда',

    checkThreat: 'Шах королю!',
    boardTextureLabel: 'Камень доски',
    textureObsidian: 'Полированный обсидиан',
    textureAbbey: 'Старинное аббатство',
    textureMossy: 'Мшистые руины',

    menuButton: 'Меню',
    menuTitle: 'Меню святилища',
    matchSettings: 'Настройки партии',
    controlsGuideTitle: 'Справка по управлению',

    returnToLiveGame: 'Вернуться к игре',
    previewingMovePrefix: 'Просмотр хода',
    whitePiece: 'Белые',
    blackPiece: 'Чёрные',

    skipTour: 'Пропустить [Esc] ✕',
    cathedralTour: 'Осмотр зала',

    tabGame: 'Партия',
    tabBoard: 'Доска',
    tabCamera: 'Камера',
    tabAudio: 'Звук',
    quickActions: 'Быстрые действия',
    keyboardShortcuts: 'Горячие клавиши'
  }
};

const STORAGE_KEY = 'wizard_chess_lang';

export function getInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith('ru')) return 'ru';
  } catch (e) {}
  return 'ru'; // Default to Russian as requested by user in Russian
}

let currentLanguage: Language = getInitialLanguage();
const listeners: Array<(lang: Language) => void> = [];

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(lang: Language): void {
  currentLanguage = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (e) {}
  for (const fn of listeners) {
    try {
      fn(lang);
    } catch (e) {}
  }
}

export function subscribeLanguage(fn: (lang: Language) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function getTranslations(lang: Language = currentLanguage): Translations {
  return translations[lang] || translations.en;
}
