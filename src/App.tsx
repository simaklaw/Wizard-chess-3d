import { useEffect, useRef, useState } from 'react';
import { initWizardChess } from './wizardChessEngine.js';
import {
  getLanguage,
  setLanguage,
  subscribeLanguage,
  getTranslations,
  type Language
} from './i18n.ts';

interface MoveRow {
  moveNumber: number;
  white: string;
  black?: string;
}

export default function App() {
  const initializedRef = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lang, setLang] = useState<Language>(getLanguage());
  const [historyList, setHistoryList] = useState<MoveRow[]>([]);
  const [previewPly, setPreviewPly] = useState<number | null>(null);
  const [isTourActive, setIsTourActive] = useState(false);

  const [boardStone, setBoardStone] = useState<string>(() => {
    try {
      return localStorage.getItem('wizardChess_boardStone') || 'obsidian';
    } catch (e) {
      return 'obsidian';
    }
  });

  const [drawerTab, setDrawerTab] = useState<'game' | 'board' | 'camera' | 'audio'>('game');
  const [timeControl, setTimeControl] = useState<string>('rapid_10_0');
  const [aiDifficulty, setAiDifficulty] = useState<string>('intermediate');
  const [gameVariant, setGameVariant] = useState<string>('standard');

  const t = getTranslations(lang);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    initWizardChess();
    const win = window as unknown as {
      wizardChess?: {
        isSoundEnabled?: () => boolean;
        getBoardStoneTexture?: () => string;
        getMoveHistoryNotation?: () => MoveRow[];
      };
    };
    if (win.wizardChess?.isSoundEnabled) {
      setSoundEnabled(win.wizardChess.isSoundEnabled());
    }
    if (win.wizardChess?.getBoardStoneTexture) {
      setBoardStone(win.wizardChess.getBoardStoneTexture());
    }
    if (win.wizardChess?.getMoveHistoryNotation) {
      setHistoryList(win.wizardChess.getMoveHistoryNotation());
    }
  }, []);

  useEffect(() => {
    const handleStoneEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ texture: string }>;
      if (customEvent.detail?.texture) {
        setBoardStone(customEvent.detail.texture);
      }
    };
    window.addEventListener('wizardChessBoardStoneChanged', handleStoneEvent);
    return () => {
      window.removeEventListener('wizardChessBoardStoneChanged', handleStoneEvent);
    };
  }, []);

  useEffect(() => {
    const handleHistoryEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ history?: MoveRow[] }>;
      if (customEvent.detail?.history) {
        setHistoryList([...customEvent.detail.history]);
      } else {
        const win = window as unknown as {
          wizardChess?: {
            getMoveHistoryNotation?: () => MoveRow[];
          };
        };
        if (win.wizardChess?.getMoveHistoryNotation) {
          setHistoryList(win.wizardChess.getMoveHistoryNotation());
        }
      }
    };
    window.addEventListener('wizardChessHistoryChanged', handleHistoryEvent);
    return () => {
      window.removeEventListener('wizardChessHistoryChanged', handleHistoryEvent);
    };
  }, []);

  useEffect(() => {
    const handlePreviewEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ previewingPly: number | null }>;
      setPreviewPly(customEvent.detail?.previewingPly ?? null);
    };
    window.addEventListener('wizardChessPreviewChanged', handlePreviewEvent);
    return () => {
      window.removeEventListener('wizardChessPreviewChanged', handlePreviewEvent);
    };
  }, []);

  useEffect(() => {
    const handleTourStarted = () => setIsTourActive(true);
    const handleTourFinished = (e: Event) => {
      setIsTourActive(false);
      const customEvent = e as CustomEvent<{ openMenu?: boolean; immediate?: boolean }>;
      if (customEvent?.detail?.openMenu) {
        setDrawerOpen(true);
      }
    };

    window.addEventListener('wizardChessTourStarted', handleTourStarted);
    window.addEventListener('wizardChessTourFinished', handleTourFinished);
    return () => {
      window.removeEventListener('wizardChessTourStarted', handleTourStarted);
      window.removeEventListener('wizardChessTourFinished', handleTourFinished);
    };
  }, []);

  useEffect(() => {
    if (drawerOpen) {
      const win = window as unknown as {
        wizardChess?: {
          getMoveHistoryNotation?: () => MoveRow[];
          updateMoveHistoryDOM?: () => void;
        };
      };
      if (win.wizardChess?.getMoveHistoryNotation) {
        setHistoryList(win.wizardChess.getMoveHistoryNotation());
      }
      win.wizardChess?.updateMoveHistoryDOM?.();
    }
  }, [drawerOpen]);

  useEffect(() => {
    return subscribeLanguage((newLang) => {
      setLang(newLang);
    });
  }, []);

  const handleSetBoardStone = (styleId: string) => {
    setBoardStone(styleId);
    const win = window as unknown as {
      wizardChess?: {
        setBoardStoneTexture?: (s: string) => string;
      };
    };
    win.wizardChess?.setBoardStoneTexture?.(styleId);
  };

  const handleSetTimeControl = (val: string) => {
    setTimeControl(val);
    const sel = document.getElementById('select-time-control') as HTMLSelectElement | null;
    if (sel) {
      sel.value = val;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const win = window as unknown as { wizardChess?: { setTimeControl?: (t: string) => void } };
    win.wizardChess?.setTimeControl?.(val);
  };

  const handleSetDifficulty = (val: string) => {
    setAiDifficulty(val);
    const sel = document.getElementById('select-ai-difficulty') as HTMLSelectElement | null;
    if (sel) {
      sel.value = val;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const win = window as unknown as { wizardChess?: { setDifficulty?: (d: string) => void } };
    win.wizardChess?.setDifficulty?.(val);
  };

  const handleSetVariant = (val: string) => {
    setGameVariant(val);
    const sel = document.getElementById('select-game-variant') as HTMLSelectElement | null;
    if (sel) {
      sel.value = val;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const win = window as unknown as { wizardChess?: { setVariant?: (v: string) => void } };
    win.wizardChess?.setVariant?.(val);
  };

  const handleToggleLanguage = () => {
    const nextLang: Language = lang === 'ru' ? 'en' : 'ru';
    setLang(nextLang);
    setLanguage(nextLang);
    const win = window as unknown as { wizardChess?: { setLanguage?: (l: Language) => void } };
    win.wizardChess?.setLanguage?.(nextLang);
  };

  const handleToggleSound = () => {
    const win = window as unknown as { wizardChess?: { toggleSound?: () => boolean } };
    if (win.wizardChess?.toggleSound) {
      const next = win.wizardChess.toggleSound();
      setSoundEnabled(next);
    } else {
      setSoundEnabled((prev) => !prev);
    }
  };

  const handleZoomIn = () => {
    const win = window as unknown as { wizardChess?: { zoomIn?: () => void } };
    if (win.wizardChess?.zoomIn) {
      win.wizardChess.zoomIn();
    }
  };

  const handlePreviewPly = (plyIdx: number) => {
    const win = window as unknown as {
      wizardChess?: {
        previewHistoryPly?: (idx: number) => boolean;
      };
    };
    win.wizardChess?.previewHistoryPly?.(plyIdx);
  };

  const handleReturnToLive = () => {
    const win = window as unknown as {
      wizardChess?: {
        returnToLiveGame?: () => boolean;
      };
    };
    win.wizardChess?.returnToLiveGame?.();
  };

  const handleZoomOut = () => {
    const win = window as unknown as { wizardChess?: { zoomOut?: () => void } };
    if (win.wizardChess?.zoomOut) {
      win.wizardChess.zoomOut();
    }
  };

  const handleSkipTour = () => {
    const win = window as unknown as {
      wizardChess?: {
        endCathedralTour?: (immediate?: boolean) => void;
      };
    };
    win.wizardChess?.endCathedralTour?.(true);
    setIsTourActive(false);
    setDrawerOpen(true);
  };

  const handleStartTour = () => {
    setDrawerOpen(false);
    const win = window as unknown as {
      wizardChess?: {
        startCathedralTour?: () => boolean;
      };
    };
    win.wizardChess?.startCathedralTour?.();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        if (isTourActive) {
          handleSkipTour();
          return;
        }
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTourActive]);

  const handleRestoreUI = () => {
    const win = window as unknown as { wizardChess?: { toggleUI?: (force?: boolean) => void } };
    if (win.wizardChess?.toggleUI) {
      win.wizardChess.toggleUI(false);
    } else {
      document.body.classList.remove('cinematic-ui-hidden');
      const btnHide = document.getElementById('btn-hide-ui');
      if (btnHide) btnHide.textContent = t.hideUI;
    }
  };

  const totalPlies = historyList.reduce(
    (acc, row) => acc + (row.white ? 1 : 0) + (row.black ? 1 : 0),
    0
  );

  return (
    <>
      <div id="loading-overlay">
        <div className="loader-title">{t.loaderTitle}</div>
        <div className="loader-bar-wrap">
          <div className="loader-bar" id="loader-bar"></div>
        </div>
        <div id="loader-text">{t.loaderText}</div>
      </div>

      <div id="canvas-container"></div>

      {/* Floating Skip Intro Tour Button */}
      {isTourActive && (
        <button
          type="button"
          className="skip-tour-btn"
          id="btn-skip-intro"
          onClick={handleSkipTour}
          title={t.skipTour}
          aria-label={t.skipTour}
        >
          <span className="skip-tour-icon" aria-hidden="true">⏩</span>
          <span className="skip-tour-text">{t.skipTour}</span>
        </button>
      )}

      <button
        type="button"
        className="hud-btn mobile-only-restore-ui"
        id="btn-mobile-show-ui"
        onClick={handleRestoreUI}
        title={t.showUI}
      >
        {t.showUI}
      </button>

      {/* Main Screen Top HUD: Clean & uncluttered */}
      <div id="hud-top">
        <div className="hud-group" id="hud-left">
          <div className="brand-pill">
            <span className="brand-title">{t.brandTitle}</span>
          </div>
          <div className="status-pill" id="status-pill">
            <span className="turn-dot" id="turn-dot"></span>
            <span id="turn-text">{t.turnWhite}</span>
            <span className="mode-badge" id="mode-badge">{t.playingAsWhite}</span>
          </div>
          <div className="chess-clock-pill" id="chess-clocks" role="timer" aria-label="Chess Clocks">
            <div className="clock-box" id="clock-slot-w" title={t.whiteClockLabel}>
              <span className="clock-badge white">W</span>
              <span className="clock-time" id="clock-time-w">10:00</span>
            </div>
            <div className="clock-divider">:</div>
            <div className="clock-box" id="clock-slot-b" title={t.blackClockLabel}>
              <span className="clock-badge black">B</span>
              <span className="clock-time" id="clock-time-b">10:00</span>
            </div>
          </div>
        </div>

        {/* Primary Screen Actions: Undo + Language + Menu Toggle */}
        <div className="hud-main-actions" id="hud-main-actions">
          <button
            type="button"
            className="hud-btn hud-undo-btn"
            id="btn-undo"
            title={t.btnUndo}
            aria-label={t.btnUndo}
          >
            <span className="undo-icon" aria-hidden="true">↩</span>
            <span className="undo-text">{t.btnUndo}</span>
          </button>

          <button
            type="button"
            className="hud-btn hud-lang-toggle"
            id="btn-lang-toggle"
            onClick={handleToggleLanguage}
            title={t.langToggleTitle}
            aria-label={t.langToggleTitle}
          >
            <span className="lang-icon" aria-hidden="true">🌐</span>
            <span className={`lang-text ${lang === 'ru' ? 'active' : ''}`}>RU</span>
            <span className="lang-sep">|</span>
            <span className={`lang-text ${lang === 'en' ? 'active' : ''}`}>EN</span>
          </button>

          <button
            type="button"
            className={`hud-btn hud-menu-btn ${drawerOpen ? 'active' : ''}`}
            id="btn-menu-toggle"
            onClick={() => setDrawerOpen((prev) => !prev)}
            aria-expanded={drawerOpen}
            aria-controls="side-drawer"
            title={drawerOpen ? t.closeMobile : t.menuButton}
          >
            <span className="menu-icon" aria-hidden="true">{drawerOpen ? '✕' : '☰'}</span>
            <span className="menu-label">{drawerOpen ? t.closeMobile : t.menuButton}</span>
          </button>

          {/* Hidden alias button for backward test compatibility */}
          <button
            type="button"
            id="btn-mobile-controls"
            style={{ display: 'none' }}
            onClick={() => setDrawerOpen((prev) => !prev)}
            aria-hidden="true"
          ></button>
        </div>
      </div>

      {/* Floating History Preview Banner when reviewing earlier plies */}
      {previewPly !== null && (
        <div id="history-preview-banner" className="history-preview-banner" role="status">
          <div className="preview-banner-content">
            <span className="preview-banner-badge" aria-hidden="true">📜</span>
            <span className="preview-banner-text">
              {t.previewingMovePrefix} {Math.floor(previewPly / 2) + 1} • {previewPly % 2 === 0 ? t.whitePiece : t.blackPiece}
            </span>
            <button
              type="button"
              id="btn-return-live"
              className="preview-return-btn"
              onClick={handleReturnToLive}
              title={t.returnToLiveGame}
            >
              <span>{t.returnToLiveGame}</span>
              <span className="return-arrow" aria-hidden="true">➔</span>
            </button>
          </div>
        </div>
      )}

      {/* Slide-out Backdrop Overlay */}
      <div
        className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      ></div>

      {/* Unified Side Drawer: Contains Move History, Game Actions, Match Settings, Board Stone, Views & Help */}
      <aside
        id="side-drawer"
        className={`side-drawer ${drawerOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t.menuTitle}
      >
        <div className="drawer-header">
          <div className="drawer-title-wrap">
            <span className="drawer-icon" aria-hidden="true">🏛</span>
            <span className="drawer-title">{t.menuTitle}</span>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            id="btn-drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label={t.closeMobile}
          >
            ✕
          </button>
          {/* Alias for mobile sheet close */}
          <button
            type="button"
            id="btn-mobile-sheet-close"
            style={{ display: 'none' }}
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          ></button>
        </div>

        {/* Category Navigation Tabs */}
        <div className="drawer-tabs-nav" role="tablist" aria-label={t.menuTitle}>
          <button
            type="button"
            role="tab"
            id="tab-btn-game"
            aria-selected={drawerTab === 'game'}
            className={`drawer-tab-btn ${drawerTab === 'game' ? 'active' : ''}`}
            onClick={() => setDrawerTab('game')}
          >
            <span className="drawer-tab-icon" aria-hidden="true">⚔</span>
            <span className="drawer-tab-text">{t.tabGame}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-btn-board"
            aria-selected={drawerTab === 'board'}
            className={`drawer-tab-btn ${drawerTab === 'board' ? 'active' : ''}`}
            onClick={() => setDrawerTab('board')}
          >
            <span className="drawer-tab-icon" aria-hidden="true">🏛</span>
            <span className="drawer-tab-text">{t.tabBoard}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-btn-camera"
            aria-selected={drawerTab === 'camera'}
            className={`drawer-tab-btn ${drawerTab === 'camera' ? 'active' : ''}`}
            onClick={() => setDrawerTab('camera')}
          >
            <span className="drawer-tab-icon" aria-hidden="true">🎥</span>
            <span className="drawer-tab-text">{t.tabCamera}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-btn-audio"
            aria-selected={drawerTab === 'audio'}
            className={`drawer-tab-btn ${drawerTab === 'audio' ? 'active' : ''}`}
            onClick={() => setDrawerTab('audio')}
          >
            <span className="drawer-tab-icon" aria-hidden="true">🔊</span>
            <span className="drawer-tab-text">{t.tabAudio}</span>
          </button>
        </div>

        <div className="drawer-body" id="hud-right">
          {/* =========================================================================
             TAB PANEL 1: GAME (Quick Actions, Match Settings & Move History)
             ========================================================================= */}
          <div
            className={`drawer-tab-panel ${drawerTab === 'game' ? 'active' : ''}`}
            style={{ display: drawerTab === 'game' ? 'flex' : 'none' }}
          >
            {/* Quick Battle Actions */}
            <div className="drawer-section">
              <div className="drawer-section-header">
                <span className="drawer-section-icon" aria-hidden="true">⚔</span>
                <span className="drawer-section-title">{t.gameActions}</span>
              </div>

              <div className="drawer-actions-grid">
                <button
                  className="hud-btn"
                  id="btn-side-toggle"
                  title="Switch between Playing as White and Playing as Black"
                  onClick={() => setDrawerOpen(false)}
                >
                  {t.btnPlayAsBlack}
                </button>
                <button
                  className="hud-btn"
                  id="btn-ai-move"
                  title="Let the AI make the next move immediately"
                  onClick={() => setDrawerOpen(false)}
                >
                  {t.btnAiMove}
                </button>
                <button
                  className="hud-btn"
                  id="btn-reset"
                  title="Start a fresh game on the altar"
                  onClick={() => setDrawerOpen(false)}
                >
                  {t.btnNewGame}
                </button>
                <button
                  className="hud-btn"
                  id="btn-cathedral-tour"
                  title={t.cathedralTour}
                  onClick={handleStartTour}
                >
                  🏛 {t.cathedralTour}
                </button>
              </div>
            </div>

            <div className="drawer-divider" aria-hidden="true"></div>

            {/* Match Settings with Interactive Chip Buttons */}
            <div className="drawer-section">
              <div className="drawer-section-header">
                <span className="drawer-section-icon" aria-hidden="true">⏱</span>
                <span className="drawer-section-title">{t.matchSettings}</span>
              </div>

              {/* Hidden select kept for automated test backward-compatibility */}
              <select
                className="hud-select"
                id="select-time-control"
                value={timeControl}
                onChange={(e) => handleSetTimeControl(e.target.value)}
                aria-label={t.timeControl}
                tabIndex={-1}
                style={{ display: 'none' }}
                aria-hidden="true"
              >
                <optgroup label={t.rapid}>
                  <option value="rapid_10_0">10 min ({t.rapid})</option>
                  <option value="rapid_15_10">15 | 10 ({t.rapid})</option>
                  <option value="rapid_30_0">30 min ({t.rapid})</option>
                </optgroup>
                <optgroup label={t.blitz}>
                  <option value="blitz_3_0">3 min ({t.blitz})</option>
                  <option value="blitz_3_2">3 | 2 ({t.blitz})</option>
                  <option value="blitz_5_0">5 min ({t.blitz})</option>
                  <option value="blitz_5_3">5 | 3 ({t.blitz})</option>
                </optgroup>
                <optgroup label={t.bullet}>
                  <option value="bullet_1_0">1 min ({t.bullet})</option>
                  <option value="bullet_2_1">2 | 1 ({t.bullet})</option>
                </optgroup>
                <optgroup label={t.classical}>
                  <option value="classical_60_0">60 min ({t.classical})</option>
                </optgroup>
                <optgroup label={t.untimed}>
                  <option value="untimed">{t.untimed}</option>
                </optgroup>
              </select>

              {/* Time Control Chips */}
              <div className="menu-setting-group">
                <div className="menu-setting-label">⏱ {t.timeControl}</div>
                <div className="menu-chips-grid" role="radiogroup" aria-label={t.timeControl}>
                  {[
                    { id: 'rapid_10_0', label: '10 min', sub: t.rapid },
                    { id: 'rapid_15_10', label: '15 | 10', sub: t.rapid },
                    { id: 'blitz_5_0', label: '5 min', sub: t.blitz },
                    { id: 'blitz_3_0', label: '3 min', sub: t.blitz },
                    { id: 'bullet_1_0', label: '1 min', sub: t.bullet },
                    { id: 'untimed', label: '∞', sub: t.untimed }
                  ].map((tc) => (
                    <button
                      key={tc.id}
                      type="button"
                      className={`menu-chip-btn ${timeControl === tc.id ? 'active' : ''}`}
                      onClick={() => handleSetTimeControl(tc.id)}
                      title={`${tc.label} (${tc.sub})`}
                    >
                      <span className="chip-primary">{tc.label}</span>
                      <span className="chip-sub">{tc.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Hidden AI select kept for tests */}
              <select
                className="hud-select"
                id="select-ai-difficulty"
                value={aiDifficulty}
                onChange={(e) => handleSetDifficulty(e.target.value)}
                aria-label={t.difficulty}
                tabIndex={-1}
                style={{ display: 'none' }}
                aria-hidden="true"
              >
                <option value="novice">{t.diffNovice}</option>
                <option value="beginner">{t.diffBeginner}</option>
                <option value="intermediate">{t.diffIntermediate}</option>
                <option value="advanced">{t.diffAdvanced}</option>
                <option value="master">{t.diffMaster}</option>
                <option value="legend">{t.diffLegend}</option>
              </select>

              {/* AI Difficulty Scale Chips */}
              <div className="menu-setting-group">
                <div className="menu-setting-label">⚔ {t.difficulty}</div>
                <div className="menu-chips-ladder" role="radiogroup" aria-label={t.difficulty}>
                  {[
                    { id: 'novice', label: t.diffNovice, rating: '~600' },
                    { id: 'beginner', label: t.diffBeginner, rating: '~1000' },
                    { id: 'intermediate', label: t.diffIntermediate, rating: '~1400' },
                    { id: 'advanced', label: t.diffAdvanced, rating: '~1800' },
                    { id: 'master', label: t.diffMaster, rating: '~2200' },
                    { id: 'legend', label: t.diffLegend, rating: '~2600' }
                  ].map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      className={`menu-ladder-btn ${aiDifficulty === lvl.id ? 'active' : ''}`}
                      onClick={() => handleSetDifficulty(lvl.id)}
                      title={`${lvl.label} (${lvl.rating})`}
                    >
                      <span className="ladder-name">{lvl.label}</span>
                      <span className="ladder-rating">{lvl.rating}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Hidden Variant select kept for tests */}
              <select
                className="hud-select"
                id="select-game-variant"
                value={gameVariant}
                onChange={(e) => handleSetVariant(e.target.value)}
                aria-label={t.gameVariant}
                tabIndex={-1}
                style={{ display: 'none' }}
                aria-hidden="true"
              >
                <option value="standard">{t.variantStandard}</option>
                <option value="chess960">{t.variant960}</option>
              </select>

              {/* Game Variant Segment Chips */}
              <div className="menu-setting-group">
                <div className="menu-setting-label">♟ {t.gameVariant}</div>
                <div className="menu-segments-row" role="radiogroup" aria-label={t.gameVariant}>
                  <button
                    type="button"
                    className={`menu-segment-btn ${gameVariant === 'standard' ? 'active' : ''}`}
                    onClick={() => handleSetVariant('standard')}
                  >
                    <span className="segment-icon" aria-hidden="true">♟</span>
                    <span>{t.variantStandard}</span>
                  </button>
                  <button
                    type="button"
                    className={`menu-segment-btn ${gameVariant === 'chess960' ? 'active' : ''}`}
                    onClick={() => handleSetVariant('chess960')}
                  >
                    <span className="segment-icon" aria-hidden="true">🎲</span>
                    <span>{t.variant960}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="drawer-divider" aria-hidden="true"></div>

            {/* Move History Widget */}
            <div className="drawer-section">
              <div className="drawer-section-header">
                <span className="drawer-section-icon" aria-hidden="true">📜</span>
                <span className="drawer-section-title">{t.moveHistoryTitle}</span>
              </div>

              <div
                id="move-history-widget"
                className="drawer-history-widget"
                role="region"
                aria-label={t.moveHistoryTitle}
                onPointerDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="drawer-history-toolbar">
                  <button
                    type="button"
                    id="btn-history-toggle"
                    className="history-toggle-pill"
                    onClick={() => setHistoryExpanded((prev) => !prev)}
                    title={historyExpanded ? t.collapseHistory : t.expandHistory}
                    aria-expanded={historyExpanded}
                    aria-controls="move-history-list"
                  >
                    <span>{t.moveHistoryTitle}</span>
                    <span id="history-count-badge" className="history-count-badge">{totalPlies}</span>
                    <span className="history-chevron" aria-hidden="true">{historyExpanded ? '▼' : '▲'}</span>
                  </button>
                </div>

                {historyExpanded && (
                  <div id="move-history-body" className="drawer-history-body">
                    <div
                      id="move-history-list"
                      className="move-history-list"
                      tabIndex={0}
                      role="log"
                      aria-live="polite"
                    >
                      {historyList.length === 0 ? (
                        <div className="history-empty">{t.moveHistoryEmpty}</div>
                      ) : (
                        <div className="history-table">
                          {historyList.map((row) => {
                            const whitePly = (row.moveNumber - 1) * 2;
                            const blackPly = whitePly + 1;
                            const isWhiteActive = previewPly === whitePly;
                            const isBlackActive = previewPly === blackPly;

                            return (
                              <div key={row.moveNumber} className="history-row">
                                <span className="history-num">{row.moveNumber}.</span>
                                <button
                                  type="button"
                                  className={`history-cell-btn history-white ${isWhiteActive ? 'active-ply' : ''}`}
                                  onClick={() => handlePreviewPly(whitePly)}
                                  title={`${t.previewingMovePrefix} ${row.moveNumber} (${t.whitePiece})`}
                                >
                                  {row.white}
                                </button>
                                {row.black ? (
                                  <button
                                    type="button"
                                    className={`history-cell-btn history-black ${isBlackActive ? 'active-ply' : ''}`}
                                    onClick={() => handlePreviewPly(blackPly)}
                                    title={`${t.previewingMovePrefix} ${row.moveNumber} (${t.blackPiece})`}
                                  >
                                    {row.black}
                                  </button>
                                ) : (
                                  <span className="history-black"></span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* =========================================================================
             TAB PANEL 2: BOARD (Tactile Stone Textures & Materials)
             ========================================================================= */}
          <div
            className={`drawer-tab-panel ${drawerTab === 'board' ? 'active' : ''}`}
            style={{ display: drawerTab === 'board' ? 'flex' : 'none' }}
          >
            <div className="drawer-section">
              <div className="drawer-section-header">
                <span className="drawer-section-icon" aria-hidden="true">🏛</span>
                <span className="drawer-section-title">{t.boardTextureLabel}</span>
              </div>

              {/* Hidden select kept for automated test backward-compatibility */}
              <select
                id="select-board-texture"
                value={boardStone}
                onChange={(e) => handleSetBoardStone(e.target.value)}
                aria-label={t.boardTextureLabel}
                tabIndex={-1}
                style={{ display: 'none' }}
                aria-hidden="true"
              >
                <option value="obsidian">{t.textureObsidian}</option>
                <option value="weathered_abbey">{t.textureAbbey}</option>
                <option value="mossy_ruin">{t.textureMossy}</option>
              </select>

              {/* Enhanced Gothic Stone Texture Cards */}
              <div className="stone-texture-chips-wrap" role="radiogroup" aria-label={t.boardTextureLabel}>
                <button
                  type="button"
                  className={`stone-chip-btn ${boardStone === 'obsidian' ? 'active' : ''}`}
                  onClick={() => handleSetBoardStone('obsidian')}
                  title={t.textureObsidian}
                  aria-checked={boardStone === 'obsidian'}
                  role="radio"
                >
                  <span className="stone-swatch swatch-obsidian" aria-hidden="true"></span>
                  <div className="stone-chip-info">
                    <span className="stone-chip-name">{t.textureObsidian}</span>
                    <span className="stone-chip-desc">Глубокий зеркальный камень с золотыми клетками</span>
                  </div>
                  {boardStone === 'obsidian' && <span className="stone-active-check" aria-hidden="true">✦</span>}
                </button>
                <button
                  type="button"
                  className={`stone-chip-btn ${boardStone === 'weathered_abbey' ? 'active' : ''}`}
                  onClick={() => handleSetBoardStone('weathered_abbey')}
                  title={t.textureAbbey}
                  aria-checked={boardStone === 'weathered_abbey'}
                  role="radio"
                >
                  <span className="stone-swatch swatch-abbey" aria-hidden="true"></span>
                  <div className="stone-chip-info">
                    <span className="stone-chip-name">{t.textureAbbey}</span>
                    <span className="stone-chip-desc">Резной монастырский известняк с патиной веков</span>
                  </div>
                  {boardStone === 'weathered_abbey' && <span className="stone-active-check" aria-hidden="true">✦</span>}
                </button>
                <button
                  type="button"
                  className={`stone-chip-btn ${boardStone === 'mossy_ruin' ? 'active' : ''}`}
                  onClick={() => handleSetBoardStone('mossy_ruin')}
                  title={t.textureMossy}
                  aria-checked={boardStone === 'mossy_ruin'}
                  role="radio"
                >
                  <span className="stone-swatch swatch-mossy" aria-hidden="true"></span>
                  <div className="stone-chip-info">
                    <span className="stone-chip-name">{t.textureMossy}</span>
                    <span className="stone-chip-desc">Древние руины с изумрудным лесным мхом</span>
                  </div>
                  {boardStone === 'mossy_ruin' && <span className="stone-active-check" aria-hidden="true">✦</span>}
                </button>
              </div>

              <div className="stone-material-hint">
                <span className="hint-icon" aria-hidden="true">✨</span>
                <span>Физические PBR-материалы: шероховатость, металлический блеск золота и отражения собора пересчитываются в реальном времени.</span>
              </div>
            </div>
          </div>

          {/* =========================================================================
             TAB PANEL 3: CAMERA (Perspectives & Zoom Control)
             ========================================================================= */}
          <div
            className={`drawer-tab-panel ${drawerTab === 'camera' ? 'active' : ''}`}
            style={{ display: drawerTab === 'camera' ? 'flex' : 'none' }}
          >
            <div className="drawer-section">
              <div className="drawer-section-header">
                <span className="drawer-section-icon" aria-hidden="true">🎥</span>
                <span className="drawer-section-title">{t.cameraViews}</span>
              </div>

              <div className="drawer-cameras-grid">
                <button
                  className="hud-btn active"
                  id="btn-cam-player"
                  title="Player Camera (Click again to flip White / Black view)"
                >
                  {t.camPlayer}
                </button>
                <button
                  className="hud-btn"
                  id="btn-cam-top"
                  title="Overhead Board View (Click again to flip White / Black orientation)"
                >
                  {t.camTop}
                </button>
                <button
                  className="hud-btn"
                  id="btn-cam-side"
                  title="Side Profile View (Click again to switch East / West side)"
                >
                  {t.camSide}
                </button>
                <button
                  className="hud-btn"
                  id="btn-cam-wide"
                  title="Wide Cathedral View (Click again to switch North Rose / South Narthex)"
                >
                  {t.camWide}
                </button>
              </div>

              <div className="drawer-zoom-wrap">
                <span className="drawer-zoom-label">Zoom:</span>
                <div className="cam-zoom-group" role="group" aria-label="Camera Zoom">
                  <button
                    type="button"
                    className="hud-btn zoom-btn"
                    id="btn-zoom-in"
                    title={t.zoomIn}
                    onClick={handleZoomIn}
                    aria-label={t.zoomIn}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="hud-btn zoom-btn"
                    id="btn-zoom-out"
                    title={t.zoomOut}
                    onClick={handleZoomOut}
                    aria-label={t.zoomOut}
                  >
                    −
                  </button>
                </div>
              </div>

              <div className="camera-subhint-card">
                <span className="hint-bullet" aria-hidden="true">💡</span>
                <span>{t.cameraViewsSub}</span>
              </div>
            </div>
          </div>

          {/* =========================================================================
             TAB PANEL 4: AUDIO & INTERFACE (Sound, Language, Keyboard Guide)
             ========================================================================= */}
          <div
            className={`drawer-tab-panel ${drawerTab === 'audio' ? 'active' : ''}`}
            style={{ display: drawerTab === 'audio' ? 'flex' : 'none' }}
          >
            <div className="drawer-section">
              <div className="drawer-section-header">
                <span className="drawer-section-icon" aria-hidden="true">🔊</span>
                <span className="drawer-section-title">{t.soundDisplay}</span>
              </div>

              <div className="drawer-toggles-row">
                <button
                  className={`hud-btn ${soundEnabled ? 'active' : ''}`}
                  id="btn-sound-toggle"
                  title="Toggle Spatial 3D Audio (Mute / Unmute)"
                  onClick={handleToggleSound}
                >
                  {soundEnabled ? t.soundOn : t.soundMuted}
                </button>

                <button
                  className="hud-btn"
                  id="btn-hide-ui"
                  title="Toggle HUD visibility (Shortcut: H)"
                  onClick={() => setDrawerOpen(false)}
                >
                  {t.hideUI}
                </button>

                <button
                  type="button"
                  className="hud-btn"
                  id="btn-drawer-lang-toggle"
                  title={t.langToggleTitle}
                  onClick={handleToggleLanguage}
                >
                  🌐 {lang === 'ru' ? 'English (EN)' : 'Русский (RU)'}
                </button>
              </div>

              <div className="drawer-divider" aria-hidden="true"></div>

              <div className="drawer-hint-card" id="controls-hint">
                <div className="hint-header">ℹ️ {t.controlsGuideTitle}</div>
                <div className="hint-content">{t.controlsHint}</div>
              </div>

              <div className="keyboard-shortcuts-grid">
                <div className="shortcut-item">
                  <kbd>ЛКМ</kbd>
                  <span>Вращение вокруг доски</span>
                </div>
                <div className="shortcut-item">
                  <kbd>ПКМ</kbd>
                  <span>Панорамирование камеры</span>
                </div>
                <div className="shortcut-item">
                  <kbd>+ / −</kbd>
                  <span>Плавное приближение</span>
                </div>
                <div className="shortcut-item">
                  <kbd>WASD</kbd>
                  <span>Свободный полёт по собору</span>
                </div>
                <div className="shortcut-item">
                  <kbd>R / F</kbd>
                  <span>Подъём / Спуск</span>
                </div>
                <div className="shortcut-item">
                  <kbd>H</kbd>
                  <span>Скрыть интерфейс</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Screen Bottom HUD: Only Captured Pieces, completely clean! */}
      <div id="hud-bottom">
        <div className="captured-pill" id="captured-tray"></div>
      </div>

      <div id="checkmate-overlay" role="status" aria-live="polite">
        <div className="checkmate-banner">
          <div className="checkmate-ornament">{t.checkmateBannerOrnament}</div>
          <div className="checkmate-crown" id="checkmate-crown">♔</div>
          <div className="checkmate-title" id="checkmate-title">{t.checkmateTitle}</div>
          <div className="checkmate-rule"></div>
          <div className="checkmate-subtitle" id="checkmate-subtitle">
            {t.checkmateWhiteTriumphs}
          </div>
          <div className="checkmate-actions">
            <button className="checkmate-btn" id="btn-checkmate-replay">
              {t.replayKingFall}
            </button>
            <button className="checkmate-btn" id="btn-checkmate-newgame">
              {t.btnNewGame}
            </button>
            <button className="checkmate-btn secondary" id="btn-checkmate-dismiss">
              {t.dismiss}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
