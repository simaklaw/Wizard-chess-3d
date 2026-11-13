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

const handlers: {
  [K in EngineEventName]?: Set<Handler<K>>;
} = {};

/**
 * Subscribes to an engine event. Returns an unsubscribe function
 * (drop-in replacement for the old removeEventListener cleanup).
 */
export function onEngineEvent<K extends EngineEventName>(
  eventName: K,
  handler: Handler<K>
): () => void {
  const set = handlers[eventName] ?? (handlers[eventName] = new Set<Handler<K>>());
  set.add(handler);
  return () => {
    set.delete(handler);
  };
}

/** Emits an engine event. Handler errors are isolated and logged. */
export function emitEngineEvent<K extends EngineEventName>(
  eventName: K,
  payload: EngineEventMap[K]
): void {
  const set = handlers[eventName];
  if (!set) return;
  for (const handler of [...set]) {
    try {
      handler(payload);
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
  [key: string]: unknown;
}
