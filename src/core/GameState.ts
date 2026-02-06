export type GameStateData = {
  schemaVersion: number;
  gold: number;
  gems: number;
  tickets: number;
  stage: number;
  ownedHeroes: string[];
  partyHeroIds: string[];
  flags: Record<string, boolean>;
};

type Listener = (state: GameStateData) => void;

export class GameState {
  private static instance: GameState;
  private listeners: Set<Listener> = new Set();
  private data: GameStateData;

  private constructor(initialData: GameStateData) {
    this.data = initialData;
  }

  static init(initialData: GameStateData) {
    if (!GameState.instance) {
      GameState.instance = new GameState(initialData);
    }
    return GameState.instance;
  }

  static getInstance() {
    if (!GameState.instance) {
      throw new Error("GameState not initialized");
    }
    return GameState.instance;
  }

  get snapshot() {
    return { ...this.data };
  }

  update(partial: Partial<GameStateData>) {
    this.data = { ...this.data, ...partial };
    this.emitChange();
  }

  onChange(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange() {
    const snapshot = this.snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
