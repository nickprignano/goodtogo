// Device-local persistence for progress, saved games, and preferences.
// No analytics, no accounts, no data leaves the device.

export interface SavedGame {
  mode: 'computer' | 'shared';
  size: number;
  komiX2: number;
  captureTarget: number;
  level: number;
  playerColor: number; // 1 = Black, 2 = White (for vs computer)
  moves: number[]; // point indices or -1 for pass
  updatedAt: number;
}

export interface UserState {
  version: number;
  eli5Mode: boolean;
  soundOn: boolean;
  speechOn: boolean;
  highContrast: boolean;
  completedLessons: string[];
  captureWinsStage1: number;
  savedGame: SavedGame | null;
}

const STORAGE_KEY = 'goodtogo.state.v1';

export function defaultState(): UserState {
  return {
    version: 1,
    eli5Mode: true,
    soundOn: true,
    speechOn: false,
    highContrast: false,
    completedLessons: [],
    captureWinsStage1: 0,
    savedGame: null,
  };
}

export function loadState(): UserState {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<UserState>;
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export function saveState(state: UserState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors
  }
}

export function exportStateJson(state: UserState): string {
  return JSON.stringify(state, null, 2);
}

export function importStateJson(json: string): UserState {
  const parsed = JSON.parse(json) as Partial<UserState>;
  if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
    throw new Error('Invalid Good to Go backup file.');
  }
  return {
    ...defaultState(),
    ...parsed,
    completedLessons: Array.isArray(parsed.completedLessons)
      ? parsed.completedLessons.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

export function clearAllState(): UserState {
  const fresh = defaultState();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
  return fresh;
}
