/**
 * Typed event bus between the 3D engine (wizardChessEngine.js) and React UI.
 *
 * Replaces the legacy `window.dispatchEvent(new CustomEvent(...))` bridge:
 * same payloads, but statically typed, tree-shakeable, and free of global
 * event-name strings. The engine emits; App.tsx subscribes.
 */

export interface MoveRow {
  moveNumber: number;
  white: string;
  black?: string;
}

export interface EngineEventMap {
  /** Board stone texture changed (detail: { texture }) */
  boardStoneChanged: { texture: string };
  /** Move history updated (detail: { history: MoveRow[] }) */
  historyChanged: { history: MoveRow[] };
  /** History preview position changed */
  previewChanged: {
    previewingPly: number | null;
    totalPlies: number;
    move?: unknown;
    san?: string;
  };
  /** Cathedral cinematic tour started */
  tourStarted: Record<string, never>;
  /** Cathedral cinematic tour finished */
  tourFinished: { openMenu?: boolean; immediate?: boolean };
}

export type EngineEventName = keyof EngineEventMap;

type Handler<K extends EngineEventName> = (payload: EngineEventMap[K]) => void;

/**
 * Internal storage. Handlers are stored type-erased and cast back at the
 * boundaries (subscribe/emit), because TypeScript cannot correlate the
 * generic K across a dynamic registry keyed by the event name.
 */
const handlers = new Map<EngineEventName, Set<(payload: never) => void>>();

function getHandlerSet(eventName: EngineEventName): Set<(payload: never) => void> {
  let set = handlers.get(eventName);
  if (!set) {
    set = new Set();
    handlers.set(eventName, set);
  }
  return set;
}

/**
 * Subscribes to an engine event. Returns an unsubscribe function
 * (drop-in replacement for the old removeEventListener cleanup).
 */
export function onEngineEvent<K extends EngineEventName>(
  eventName: K,
  handler: Handler<K>
): () => void {
  const set = getHandlerSet(eventName);
  set.add(handler as (payload: never) => void);
  return () => {
    set.delete(handler as (payload: never) => void);
  };
}

/** Emits an engine event. Handler errors are isolated and logged. */
export function emitEngineEvent<K extends EngineEventName>(
  eventName: K,
  payload: EngineEventMap[K]
): void {
  const set = handlers.get(eventName);
  if (!set) return;
  for (const handler of [...set]) {
    try {
      (handler as Handler<K>)(payload);
    } catch (e) {
      console.error(`engineBus: handler for "${String(eventName)}" failed`, e);
    }
  }
}

/**
 * Subset of the engine's programmatic API that the React UI consumes.
 * The full API (camera keys, script stepping, test hooks) is still exposed
 * on window.wizardChess for automated verification.
 */
export interface WizardChessApi {
  zoomIn(): void;
  zoomOut(): void;
  setLanguage(lang: 'en' | 'ru'): void;
  setTimeControl(timeControl: string): void;
  setDifficulty(difficulty: string): void;
  setVariant(variant: string, layoutIdx?: number): void;
  setBoardStoneTexture(styleId: string): string;
  getBoardStoneTexture(): string;
  toggleSound(): boolean;
  isSoundEnabled(): boolean;
  getMoveHistoryNotation(): MoveRow[];
  updateMoveHistoryDOM(): void;
  previewHistoryPly(idx: number): boolean;
  returnToLiveGame(): boolean;
  startCathedralTour(): boolean;
  endCathedralTour(immediate?: boolean): void;
  toggleUI(force?: boolean): void;
  /** Full teardown of the engine (renderer, resources, worker, listeners). */
  dispose?(): void;
  [key: string]: unknown;
}
