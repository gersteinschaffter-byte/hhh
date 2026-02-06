import type { GameStateData } from "../core/GameState";

const STORAGE_KEY = "idle-card-rpg-save";
const CURRENT_SCHEMA_VERSION = 1;

const defaultState: GameStateData = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  gold: 1000,
  gems: 500,
  tickets: 10,
  stage: 1,
  ownedHeroes: [],
  partyHeroIds: [],
  flags: {}
};

export function loadGameState(): GameStateData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { ...defaultState };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GameStateData>;
    return {
      ...defaultState,
      ...parsed,
      schemaVersion: parsed.schemaVersion ?? CURRENT_SCHEMA_VERSION
    };
  } catch {
    return { ...defaultState };
  }
}

export function saveGameState(state: GameStateData) {
  const payload: GameStateData = {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
