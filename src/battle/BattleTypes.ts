/**
 * Shared battle types.
 *
 * Phase 4 goal: keep logic and rendering separated.
 * - BattleLogic only deals with these data types.
 * - BattleView only consumes event payloads.
 */

export type Side = 'A' | 'B';

export interface FighterSnapshot {
  id: string;
  name: string;
  side: Side;
  hp: number;
  maxHp: number;
  atk: number;
  spd: number;
  heroId?: string;
  heroClass?: string;
  /** Skill ids owned by the fighter (Phase 5+). Optional for MVP compatibility. */
  skills?: string[];
  /** Buff ids currently applied (Phase 5+). Optional for MVP compatibility. */
  buffs?: string[];
}

export interface BattleSetup {
  teamA: FighterSnapshot[];
  teamB: FighterSnapshot[];
  seed?: number;
}

export type BattleEvent =
  | { type: 'battleStart'; payload: { teamA: FighterSnapshot[]; teamB: FighterSnapshot[] } }
  | { type: 'roundStart'; payload: { round: number } }
  | { type: 'actorTurn'; payload: { round: number; actorId: string } }
  | { type: 'heal'; payload: { sourceId: string; targetId: string; amount: number; targetHp: number; targetMaxHp: number } }
  | {
      type: 'damage';
      payload: { sourceId: string; targetId: string; amount: number; targetHp: number; targetMaxHp: number };
    }
  | { type: 'buffAdd'; payload: { sourceId: string; targetId: string; buffId: string; stacks: number } }
  | { type: 'buffRemove'; payload: { targetId: string; buffId: string } }
  | { type: 'dead'; payload: { targetId: string } }
  | { type: 'battleEnd'; payload: { winner: Side | 'Draw' } };

export interface UnitStats {
  unitId: string;
  heroId?: string;
  heroClass?: string;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  shieldsApplied: number;
  kills: number;
  skillCasts: number;
  skillCastsById?: Record<string, number>;
}

export interface BattleReport {
  units: UnitStats[];
}


/**
 * Minimal observer used by BattleLogic.
 * We keep it super small to avoid any Pixi dependency.
 */
export interface BattleEventEmitter {
  emit(e: BattleEvent): void;
}
