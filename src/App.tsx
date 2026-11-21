import { useEffect, useRef, useState, type ChangeEvent as ReactChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { onEngineEvent, type WizardChessApi } from './engineBus.ts';
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
  // Focus management for the aria-modal menu drawer.
  const drawerRef = useRef<HTMLElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const wizardChessRef = useRef<WizardChessApi | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [volume, setVolume] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem('wizard_chess_volume') || '1');
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
    } catch (e) {
      return 1;
    }
  });
  const [lang, setLang] = useState<Language>(getLanguage());
  const [historyList, setHistoryList] = useState<MoveRow[]>([]);
  const [previewPly, setPreviewPly] = useState<number | null>(null);
  const [isTourActive, setIsTourActive] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState(false);
  const [fenCopied, setFenCopied] = useState(false);
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('wizardChess_theme') || 'sanctum';
    } catch (e) {
      return 'sanctum';
    }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('wizardChess_theme', theme);
    } catch (e) {
      /* storage unavailable */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark-gold' ? '#0a0703' : '#080a0f');
  }, [theme]);

  // Keep the document language attribute in sync with the UI language.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

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
  const [promotionPiece, setPromotionPiece] = useState<string>(() => {
    try {
      return localStorage.getItem('wizardChess_promotion') || 'queen';
    } catch (e) {
      return 'queen';
    }
  });

  const t = getTranslations(lang);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    // The 3D engine (with Three.js) is code-split: its chunk is fetched after
    // the first paint while the loading overlay is visible. StrictMode safe:
    // the 'active' flag discards a stale init after the double-mount cleanup.
    let active = true;
    (async () => {
      try {
        const { initWizardChess } = await import('./wizardChessEngine.js');
        if (!active) return;
        // The engine returns its typed API handle; window.wizardChess stays as a
        // legacy alias for automated tests.
        wizardChessRef.current = (initWizardChess() as WizardChessApi) || null;
        const api = wizardChessRef.current;
        if (active && api?.isSoundEnabled) {
          setSoundEnabled(api.isSoundEnabled());
        }
        if (active && api?.getBoardStoneTexture) {
          setBoardStone(api.getBoardStoneTexture());
        }
        if (active && api?.setPromotionPiece) {
          api.setPromotionPiece(promotionPiece as 'queen' | 'rook' | 'knight' | 'bishop');
        }
        if (active && api?.getMoveHistoryNotation) {
          setHistoryList(api.getMoveHistoryNotation());
        }
      } catch (e) {
        // Chunk failed to load (offline first visit, etc.): allow a re-init
        // attempt on the next mount instead of leaving the app wedged.
        initializedRef.current = false;
        console.error('Failed to load the Wizard Chess engine chunk', e);
      }
    })();
    // Unmount cleanup: tear down the WebGL engine (renderer, geometries,
    // materials, textures, AI worker, listeners) and allow a clean re-init.
    return () => {
      active = false;
      try {
        wizardChessRef.current?.dispose?.();
      } catch (e) {
        // engine already torn down or not fully initialized
      }
      wizardChessRef.current = null;
      initializedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return onEngineEvent('boardStoneChanged', (payload) => {
      if (payload.texture) {
        setBoardStone(payload.texture);
      }
    });
  }, []);

  useEffect(() => {
    return onEngineEvent('historyChanged', (payload) => {
      if (payload.history) {
        setHistoryList([...payload.history]);
      } else {
        const api = wizardChessRef.current;
        if (api?.getMoveHistoryNotation) {
          setHistoryList(api.getMoveHistoryNotation());
        }
      }
    });
  }, []);

  useEffect(() => {
    return onEngineEvent('previewChanged', (payload) => {
      setPreviewPly(payload.previewingPly ?? null);
    });
  }, []);

  useEffect(() => {
    return onEngineEvent('savedGameRestored', (payload) => {
      if (payload.variant) setGameVariant(payload.variant);
      if (payload.timeControl) setTimeControl(payload.timeControl);
      if (payload.difficulty) setAiDifficulty(payload.difficulty);
      setRestoredNotice(true);
      window.setTimeout(() => setRestoredNotice(false), 4200);
    });
  }, []);

  useEffect(() => {
    const unsubStarted = onEngineEvent('tourStarted', () => setIsTourActive(true));
    const unsubFinished = onEngineEvent('tourFinished', (payload) => {
      setIsTourActive(false);
      if (payload.openMenu) {
        setDrawerOpen(true);
      }
    });
    return () => {
      unsubStarted();
      unsubFinished();
    };
  }, []);

  useEffect(() => {
    if (drawerOpen) {
      const api = wizardChessRef.current;
      if (api?.getMoveHistoryNotation) {
        setHistoryList(api.getMoveHistoryNotation());
      }
      api?.updateMoveHistoryDOM?.();
    }
  }, [drawerOpen]);

  // Move focus into the drawer when it opens, trap Tab while open,
  // and return focus to the menu toggle when it closes.
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawerOpen || !drawer) return;
    const focusables = () => Array.from(
      drawer.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    const first = focusables()[0];
    if (first) first.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === list[0] || !drawer.contains(active))) {
        e.preventDefault();
        list[list.length - 1].focus();
      } else if (!e.shiftKey && active === list[list.length - 1]) {
        e.preventDefault();
        list[0].focus();
      }
    };
    drawer.addEventListener('keydown', onKey);
    return () => {
      drawer.removeEventListener('keydown', onKey);
      menuBtnRef.current?.focus();
    };
  }, [drawerOpen]);

  useEffect(() => {
    return subscribeLanguage((newLang) => {
      setLang(newLang);
    });
  }, []);

  // Keyboard support for radiogroups and the drawer tablist: arrow keys
  // move focus and activate the next/previous item (WAI-ARIA roving pattern).
  const handleRovingKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') return;
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"], [role="tab"]')
    ).filter((el) => !el.hasAttribute('disabled'));
    if (items.length === 0) return;
    e.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = items[current === -1 ? 0 : (current + step + items.length) % items.length];
    next.focus();
    next.click();
  };

  // Checkmate overlay is an alert dialog: focus the first action when it
  // appears and restore focus to the previously focused element when closed.
  useEffect(() => {
    const overlay = document.getElementById('checkmate-overlay');
    if (!overlay) return;
    let prevFocus: HTMLElement | null = null;
    const apply = () => {
      if (overlay.classList.contains('visible')) {
        prevFocus = document.activeElement as HTMLElement | null;
        overlay.querySelector<HTMLElement>('.checkmate-btn')?.focus();
      } else if (prevFocus) {
        prevFocus.focus();
        prevFocus = null;
      }
    };
    const observer = new MutationObserver(apply);
    observer.observe(overlay, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const handleSetBoardStone = (styleId: string) => {
    setBoardStone(styleId);
    wizardChessRef.current?.setBoardStoneTexture?.(styleId);
  };

  const handleSetTimeControl = (val: string) => {
    setTimeControl(val);
    wizardChessRef.current?.setTimeControl?.(val);
  };

  const handleSetDifficulty = (val: string) => {
    setAiDifficulty(val);
    wizardChessRef.current?.setDifficulty?.(val);
  };

  const handleSetVariant = (val: string) => {
    setGameVariant(val);
    wizardChessRef.current?.setVariant?.(val);
  };

  const handleSetPromotionPiece = (val: string) => {
    setPromotionPiece(val);
    try { localStorage.setItem('wizardChess_promotion', val); } catch (e) {}
    wizardChessRef.current?.setPromotionPiece?.(val as 'queen' | 'rook' | 'knight' | 'bishop');
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark-gold' ? 'sanctum' : 'dark-gold'));
  };

  const handleToggleLanguage = () => {
    const nextLang: Language = lang === 'ru' ? 'en' : 'ru';
    setLang(nextLang);
    setLanguage(nextLang);
    wizardChessRef.current?.setLanguage?.(nextLang);
  };

  const handleToggleSound = () => {
    const api = wizardChessRef.current;
    if (api?.toggleSound) {
      setSoundEnabled(api.toggleSound());
    } else {
      setSoundEnabled((prev) => !prev);
    }
  };

  const handleVolumeChange = (e: ReactChangeEvent<HTMLInputElement>) => {
    const v = Math.min(1, Math.max(0, Number(e.target.value) / 100));
    setVolume(v);
    wizardChessRef.current?.setVolume?.(v);
  };

  const handleZoomIn = () => {
    wizardChessRef.current?.zoomIn?.();
  };

  const handlePreviewPly = (plyIdx: number) => {
    wizardChessRef.current?.previewHistoryPly?.(plyIdx);
  };

  const handleReturnToLive = () => {
    wizardChessRef.current?.returnToLiveGame?.();
  };

  const handleExportPgn = () => {
    const pgn = wizardChessRef.current?.getGamePgn?.();
    if (!pgn) return;
    try {
      const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      a.href = url;
      a.download = 'wizard-chess-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.pgn';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {}
  };

  const handleCopyFen = async () => {
    const fen = wizardChessRef.current?.getGameFen?.();
    if (!fen) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(fen);
      ok = true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = fen;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e2) {}
    }
    if (ok) {
      setFenCopied(true);
      window.setTimeout(() => setFenCopied(false), 2200);
    }
  };

  const handleZoomOut = () => {
    wizardChessRef.current?.zoomOut?.();
  };

  const handleSkipTour = () => {
    wizardChessRef.current?.endCathedralTour?.(true);
    setIsTourActive(false);
    setDrawerOpen(true);
  };

  const handleStartTour = () => {
    setDrawerOpen(false);
    wizardChessRef.current?.startCathedralTour?.();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        // Space is reserved for skipping the intro tour only; it must never
        // close the drawer while the user is activating a focused control.
        if (isTourActive) handleSkipTour();
        return;
      }
      if (e.key === 'Escape') {
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
    const api = wizardChessRef.current;
    if (api?.toggleUI) {
      api.toggleUI(false);
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
          <div className="status-pill" id="status-pill" aria-live="polite" aria-atomic="true">
            <span className="turn-dot" id="turn-dot"></span>
            <span id="turn-text">{t.turnWhite}</span>
            <span className="mode-badge" id="mode-badge">{t.playingAsWhite}</span>
          </div>
          <div className="chess-clock-pill" id="chess-clocks" role="timer" aria-label={t.clocksAriaLabel}>
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
            ref={menuBtnRef}
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

      {/* Saved-game restored notice */}
      {restoredNotice && (
        <div id="restored-game-banner" className="history-preview-banner" role="status">
          <div className="preview-banner-content">
            <span className="preview-banner-badge" aria-hidden="true">💾</span>
            <span className="preview-banner-text">{t.savedGameRestored}</span>
          </div>
        </div>
      )}

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
        ref={drawerRef}
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
        <div className="drawer-tabs-nav" role="tablist" aria-label={t.menuTitle} onKeyDown={handleRovingKeys}>
          <button
            type="button"
            role="tab"
            id="tab-btn-game"
            aria-selected={drawerTab === 'game'}
            aria-controls="panel-game"
            tabIndex={drawerTab === 'game' ? 0 : -1}
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
            aria-controls="panel-board"
            tabIndex={drawerTab === 'board' ? 0 : -1}
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
            aria-controls="panel-camera"
            tabIndex={drawerTab === 'camera' ? 0 : -1}
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
            aria-controls="panel-audio"
            tabIndex={drawerTab === 'audio' ? 0 : -1}
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
            id="panel-game"
            role="tabpanel"
            aria-labelledby="tab-btn-game"
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
                  title={t.titleSideToggle}
                  onClick={() => setDrawerOpen(false)}
                >
                  {t.btnPlayAsBlack}
                </button>
                <button
                  className="hud-btn"
                  id="btn-ai-move"
                  title={t.titleAiMove}
                  onClick={() => setDrawerOpen(false)}
                >
                  {t.btnAiMove}
                </button>

                <button
                  className="hud-btn"
                  id="btn-hint"
                  title={t.btnHint}
                  onClick={() => setDrawerOpen(false)}
                >
                  {t.btnHint}
                </button>
                <button
                  className="hud-btn"
                  id="btn-reset"
                  title={t.titleReset}
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
                  <span aria-hidden="true">🏛</span> {t.cathedralTour}
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
                <div className="menu-chips-grid" role="radiogroup" aria-label={t.timeControl} onKeyDown={handleRovingKeys}>
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
                      role="radio"
                      aria-checked={timeControl === tc.id}
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
                <div className="menu-chips-ladder" role="radiogroup" aria-label={t.difficulty} onKeyDown={handleRovingKeys}>
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
                      role="radio"
                      aria-checked={aiDifficulty === lvl.id}
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
                <div className="menu-segments-row" role="radiogroup" aria-label={t.gameVariant} onKeyDown={handleRovingKeys}>
                  <button
                    type="button"
                    className={`menu-segment-btn ${gameVariant === 'standard' ? 'active' : ''}`}
                    role="radio"
                    aria-checked={gameVariant === 'standard'}
                    onClick={() => handleSetVariant('standard')}
                  >
                    <span className="segment-icon" aria-hidden="true">♟</span>
                    <span>{t.variantStandard}</span>
                  </button>
                  <button
                    type="button"
                    className={`menu-segment-btn ${gameVariant === 'chess960' ? 'active' : ''}`}
                    role="radio"
                    aria-checked={gameVariant === 'chess960'}
                    onClick={() => handleSetVariant('chess960')}
                  >
                    <span className="segment-icon" aria-hidden="true">🎲</span>
                    <span>{t.variant960}</span>
                  </button>
                </div>
              </div>

              {/* Promotion Piece Choice */}
              <div className="menu-setting-group">
                <div className="menu-setting-label">♛ {t.promotionLabel}</div>
                <div className="menu-segments-row" role="radiogroup" aria-label={t.promotionLabel} onKeyDown={handleRovingKeys}>
                  {([
                    { id: 'queen', icon: '♕', label: t.promoQueen },
                    { id: 'rook', icon: '♖', label: t.promoRook },
                    { id: 'bishop', icon: '♗', label: t.promoBishop },
                    { id: 'knight', icon: '♘', label: t.promoKnight }
                  ] as const).map((pp) => (
                    <button
                      key={pp.id}
                      type="button"
                      role="radio"
                      aria-checked={promotionPiece === pp.id}
                      className={`menu-segment-btn ${promotionPiece === pp.id ? 'active' : ''}`}
                      onClick={() => handleSetPromotionPiece(pp.id)}
                      title={pp.label}
                    >
                      <span className="segment-icon" aria-hidden="true">{pp.icon}</span>
                      <span>{pp.label}</span>
                    </button>
                  ))}
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

                  <button
                    type="button"
                    id="btn-export-pgn"
                    className="history-export-btn"
                    onClick={handleExportPgn}
                    disabled={totalPlies === 0}
                    title={t.exportPgn}
                    aria-label={t.exportPgn}
                  >
                    <span aria-hidden="true">📤</span>
                    <span>{t.exportPgn}</span>
                  </button>

                  <button
                    type="button"
                    id="btn-copy-fen"
                    className="history-export-btn"
                    onClick={handleCopyFen}
                    disabled={totalPlies === 0}
                    title={fenCopied ? t.fenCopied : t.copyFen}
                    aria-label={t.copyFen}
                  >
                    <span aria-hidden="true">🧾</span>
                    <span>{fenCopied ? t.fenCopied : t.copyFen}</span>
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
            id="panel-board"
            role="tabpanel"
            aria-labelledby="tab-btn-board"
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
              <div className="stone-texture-chips-wrap" role="radiogroup" aria-label={t.boardTextureLabel} onKeyDown={handleRovingKeys}>
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
                    <span className="stone-chip-desc">{t.textureObsidianDesc}</span>
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
                    <span className="stone-chip-desc">{t.textureAbbeyDesc}</span>
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
                    <span className="stone-chip-desc">{t.textureMossyDesc}</span>
                  </div>
                  {boardStone === 'mossy_ruin' && <span className="stone-active-check" aria-hidden="true">✦</span>}
                </button>
              </div>

              <div className="stone-material-hint">
                <span className="hint-icon" aria-hidden="true">✨</span>
                <span>{t.stoneMaterialHint}</span>
              </div>
            </div>
          </div>

          {/* =========================================================================
             TAB PANEL 3: CAMERA (Perspectives & Zoom Control)
             ========================================================================= */}
          <div
            id="panel-camera"
            role="tabpanel"
            aria-labelledby="tab-btn-camera"
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
                  title={t.titleCamPlayer}
                >
                  {t.camPlayer}
                </button>
                <button
                  className="hud-btn"
                  id="btn-cam-top"
                  title={t.titleCamTop}
                >
                  {t.camTop}
                </button>
                <button
                  className="hud-btn"
                  id="btn-cam-side"
                  title={t.titleCamSide}
                >
                  {t.camSide}
                </button>
                <button
                  className="hud-btn"
                  id="btn-cam-wide"
                  title={t.titleCamWide}
                >
                  {t.camWide}
                </button>
              </div>

              <div className="drawer-zoom-wrap">
                <span className="drawer-zoom-label">{t.zoomLabel}</span>
                <div className="cam-zoom-group" role="group" aria-label={t.camZoomGroupLabel}>
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
            id="panel-audio"
            role="tabpanel"
            aria-labelledby="tab-btn-audio"
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
                  title={t.titleSoundToggle}
                  onClick={handleToggleSound}
                >
                  {soundEnabled ? t.soundOn : t.soundMuted}
                </button>

                <button
                  className="hud-btn"
                  id="btn-hide-ui"
                  title={t.titleHideUi}
                  onClick={() => setDrawerOpen(false)}
                >
                  {t.hideUI}
                </button>

                <button
                  className={`hud-btn ${theme === 'dark-gold' ? 'active' : ''}`}
                  id="btn-theme-toggle"
                  title={t.themeToggleTitle}
                  aria-label={t.themeToggleTitle}
                  onClick={handleToggleTheme}
                >
                  🎨 {theme === 'dark-gold' ? t.themeDarkGold : t.themeSanctum}
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

              <div className="drawer-volume-row">
                <span className="drawer-zoom-label">{t.volumeLabel}</span>
                <input
                  type="range"
                  id="volume-slider"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(volume * 100)}
                  onChange={handleVolumeChange}
                  aria-label={t.volumeAriaLabel}
                  title={t.volumeLabel}
                />
                <span className="drawer-volume-value">{Math.round(volume * 100)}%</span>
              </div>

              <div className="drawer-divider" aria-hidden="true"></div>

              <div className="drawer-hint-card" id="controls-hint">
                <div className="hint-header">ℹ️ {t.controlsGuideTitle}</div>
                <div className="hint-content">{t.controlsHint}</div>
              </div>

              <div className="drawer-hint-card mobile-touch-hint" id="mobile-touch-hint">
                <div className="hint-header">📱 {t.controlsMobile}</div>
                <div className="hint-content">{t.mobileTouchHint}</div>
              </div>

              <div className="keyboard-shortcuts-grid">
                <div className="shortcut-item">
                  <kbd>{t.keyRotLmb}</kbd>
                  <span>{t.rotDesc}</span>
                </div>
                <div className="shortcut-item">
                  <kbd>{t.keyPanRmb}</kbd>
                  <span>{t.panDesc}</span>
                </div>
                <div className="shortcut-item">
                  <kbd>{t.keyZoomKeys}</kbd>
                  <span>{t.zoomDesc}</span>
                </div>
                <div className="shortcut-item">
                  <kbd>{t.keyWasd}</kbd>
                  <span>{t.flyDesc}</span>
                </div>
                <div className="shortcut-item">
                  <kbd>{t.keyRf}</kbd>
                  <span>{t.liftDesc}</span>
                </div>
                <div className="shortcut-item">
                  <kbd>{t.keyH}</kbd>
                  <span>{t.hideUiDesc}</span>
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

      <div id="checkmate-overlay" role="alertdialog" aria-modal="true" aria-labelledby="checkmate-title" aria-describedby="checkmate-subtitle">
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
