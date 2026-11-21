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
  drawInsufficientMaterial: string;
  drawFiftyMoveRule: string;
  drawThreefoldRepetition: string;
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
  promotionLabel: string;
  promoQueen: string;
  promoRook: string;
  promoBishop: string;
  promoKnight: string;
  savedGameRestored: string;
  exportPgn: string;
  themeToggleTitle: string;
  themeSanctum: string;
  themeDarkGold: string;
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
  // i18n completeness: formerly hardcoded strings
  clocksAriaLabel: string;
  camZoomGroupLabel: string;
  zoomLabel: string;
  titleSideToggle: string;
  titleAiMove: string;
  titleReset: string;
  titleCamPlayer: string;
  titleCamTop: string;
  titleCamSide: string;
  titleCamWide: string;
  titleSoundToggle: string;
  titleHideUi: string;
  textureObsidianDesc: string;
  textureAbbeyDesc: string;
  textureMossyDesc: string;
  stoneMaterialHint: string;
  keyRotLmb: string;
  rotDesc: string;
  keyPanRmb: string;
  panDesc: string;
  keyZoomKeys: string;
  zoomDesc: string;
  keyWasd: string;
  flyDesc: string;
  keyRf: string;
  liftDesc: string;
  keyH: string;
  hideUiDesc: string;
  copyFen: string;
  fenCopied: string;
  volumeLabel: string;
  volumeAriaLabel: string;
  btnHint: string;
  keyboardShortcuts: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    brandTitle: 'Wizard Chess',
    loaderTitle: 'Wizard Chess',
    loaderText: 'Summoning Sanctum Architecture & Sculpted Pieces…',
    turnWhite: 'White to Move',
    turnBlack: 'Black to Move',
    checkSuffix: ' (Check!)',
    aiSuffix: ' (AI)…',
    checkmateWhiteWins: 'Checkmate — White Wins',
    checkmateBlackWins: 'Checkmate — Black Wins',
    stalemateDraw: 'Stalemate — Draw',
    drawInsufficientMaterial: 'Draw — Insufficient Material',
    drawFiftyMoveRule: 'Draw — Fifty-Move Rule',
    drawThreefoldRepetition: 'Draw — Threefold Repetition',
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
    promotionLabel: 'Pawn promotion',
    promoQueen: 'Queen',
    promoRook: 'Rook',
    promoBishop: 'Bishop',
    promoKnight: 'Knight',
    savedGameRestored: 'Game restored',
    exportPgn: 'Export PGN',
    themeToggleTitle: 'Switch color theme',
    themeSanctum: 'Theme: Sanctum',
    themeDarkGold: 'Theme: Dark Gold',
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
    // i18n completeness: formerly hardcoded strings
    clocksAriaLabel: 'Chess clocks',
    camZoomGroupLabel: 'Camera zoom',
    zoomLabel: 'Zoom:',
    titleSideToggle: 'Switch between Playing as White and Playing as Black',
    titleAiMove: 'Let the AI make the next move immediately',
    titleReset: 'Start a fresh game on the altar',
    titleCamPlayer: 'Player Camera (Click again to flip White / Black view)',
    titleCamTop: 'Overhead Board View (Click again to flip White / Black orientation)',
    titleCamSide: 'Side Profile View (Click again to switch East / West side)',
    titleCamWide: 'Wide Cathedral View (Click again to switch North Rose / South Narthex)',
    titleSoundToggle: 'Toggle Spatial 3D Audio (Mute / Unmute)',
    titleHideUi: 'Toggle HUD visibility (Shortcut: H)',
    textureObsidianDesc: 'Deep mirror-black stone with gilded squares',
    textureAbbeyDesc: 'Carved monastery limestone aged by centuries',
    textureMossyDesc: 'Ancient ruins with emerald forest moss',
    stoneMaterialHint: 'Physically-based PBR materials: roughness, golden sheen and cathedral reflections are recomputed in real time.',
    keyRotLmb: 'LMB',
    rotDesc: 'Orbit around the board',
    keyPanRmb: 'RMB',
    panDesc: 'Pan the camera',
    keyZoomKeys: '+ / -',
    zoomDesc: 'Smooth zoom',
    keyWasd: 'WASD',
    flyDesc: 'Free flight through the cathedral',
    keyRf: 'R / F',
    liftDesc: 'Ascend / Descend',
    keyH: 'H',
    hideUiDesc: 'Hide the interface',
    volumeLabel: 'Volume',
    copyFen: 'Copy FEN',
    fenCopied: 'FEN copied',
    volumeAriaLabel: 'Set the volume of game sounds',
    btnHint: 'Hint',
    keyboardShortcuts: 'Keyboard Shortcuts'
  },
  ru: {
    brandTitle: 'Wizard Chess',
    loaderTitle: 'Wizard Chess',
    loaderText: 'Призыв архитектуры святилища и каменных фигур…',
    turnWhite: 'Ход белых',
    turnBlack: 'Ход чёрных',
    checkSuffix: ' (Шах!)',
    aiSuffix: ' (ИИ)…',
    checkmateWhiteWins: 'Мат — Победа белых',
    checkmateBlackWins: 'Мат — Победа чёрных',
    stalemateDraw: 'Пат — Ничья',
    drawInsufficientMaterial: 'Ничья — недостаточный материал',
    drawFiftyMoveRule: 'Ничья — правило 50 ходов',
    drawThreefoldRepetition: 'Ничья — троекратное повторение',
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
    promotionLabel: 'Превращение пешки',
    promoQueen: 'Ферзь',
    promoRook: 'Ладья',
    promoBishop: 'Слон',
    promoKnight: 'Конь',
    savedGameRestored: 'Партия восстановлена',
    exportPgn: 'Экспорт PGN',
    themeToggleTitle: 'Переключить цветовую тему',
    themeSanctum: 'Тема: Святилище',
    themeDarkGold: 'Тема: Тёмное золото',
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
    // i18n completeness: formerly hardcoded strings
    clocksAriaLabel: 'Шахматные часы',
    camZoomGroupLabel: 'Масштаб камеры',
    zoomLabel: 'Масштаб:',
    titleSideToggle: 'Сменить сторону: игра белыми или чёрными',
    titleAiMove: 'Пусть ИИ сделает следующий ход',
    titleReset: 'Начать новую партию на алтаре',
    titleCamPlayer: 'Камера игрока (повторный клик перевернёт вид к белым или чёрным)',
    titleCamTop: 'Вид на доску сверху (повторный клик меняет ориентацию к белым или чёрным)',
    titleCamSide: 'Профильный вид сбоку (повторный клик переключает восточный или западный ракурс)',
    titleCamWide: 'Панорама собора (повторный клик переключает северную розу или южный нартекс)',
    titleSoundToggle: 'Переключить объёмный 3D-звук (вкл / выкл)',
    titleHideUi: 'Переключить видимость интерфейса (клавиша H)',
    textureObsidianDesc: 'Глубокий зеркальный камень с золотыми клетками',
    textureAbbeyDesc: 'Резной монастырский известняк с патиной веков',
    textureMossyDesc: 'Древние руины с изумрудным лесным мхом',
    stoneMaterialHint: 'Физические PBR-материалы: шероховатость, металлический блеск золота и отражения собора пересчитываются в реальном времени.',
    keyRotLmb: 'ЛКМ',
    rotDesc: 'Вращение вокруг доски',
    keyPanRmb: 'ПКМ',
    panDesc: 'Панорамирование камеры',
    keyZoomKeys: '+ / −',
    zoomDesc: 'Плавное приближение',
    keyWasd: 'WASD',
    flyDesc: 'Свободный полёт по собору',
    keyRf: 'R / F',
    liftDesc: 'Подъём / Спуск',
    keyH: 'H',
    hideUiDesc: 'Скрыть интерфейс',
    volumeLabel: 'Громкость',
    copyFen: 'Копировать FEN',
    fenCopied: 'FEN скопирован',
    volumeAriaLabel: 'Настроить громкость звуков игры',
    btnHint: 'Подсказка',
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
