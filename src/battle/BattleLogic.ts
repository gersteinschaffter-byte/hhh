import type { BattleEventEmitter, BattleSetup, FighterSnapshot, Side } from './BattleTypes';
import type { SkillRuntimeAPI } from './SkillTypes';
import { BATTLE } from '../game/config';
import SkillSystem from './SkillSystem';
import BuffSystem from './BuffSystem';
import { SkillRegistry, BuffRegistry } from './SkillRegistry';

/**
 * BattleLogic
 *
 * Pure simulation layer:
 * - No Pixi types
 * - No rendering, no tweens
 * - Emits battle events that can be consumed by any view (Pixi, Canvas, etc.)
 *
 * This is a simplified auto-turn battle suitable for MVP:
 * - Round based
 * - Each round: all alive units act in speed order
 * - Each action: choose a random alive target from the opposite team and deal damage
 *
 * Extension points (phase 4+):
 * - Skill system (replace `performBasicAttack`)
 * - Buff system (before/after hooks)
 * - Timeline / replay (record emitted events)
 */
export default class BattleLogic {
  private readonly emitter: BattleEventEmitter;
  private readonly rng: () => number;

  // Phase 5+ extensibility (skills/buffs) - registry based (no if-else trees)
  private readonly skillRegistry = new SkillRegistry();
  private readonly buffRegistry = new BuffRegistry();
  private readonly skillSystem = new SkillSystem(this.skillRegistry);
  private readonly buffSystem = new BuffSystem(this.buffRegistry);

  private round = 0;
  private over = false;

  private teamA: FighterSnapshot[] = [];
  private teamB: FighterSnapshot[] = [];

  constructor(emitter: BattleEventEmitter, rng?: () => number) {
    this.emitter = emitter;
    this.rng = rng ?? Math.random;
  }

  /** Initialize battle state from setup. Safe to call multiple times. */
  public init(setup: BattleSetup): void {
    this.round = 0;
    this.over = false;
    // Clone input so callers cannot mutate logic state.
    this.teamA = setup.teamA.map((f) => ({ ...f }));
    this.teamB = setup.teamB.map((f) => ({ ...f }));

    // Init buff containers (placeholder; no stat modification in MVP)
    this.buffSystem.init([...this.teamA, ...this.teamB]);

    this.emitter.emit({
      type: 'battleStart',
      payload: {
        teamA: this.teamA.map((f) => ({ ...f })),
        teamB: this.teamB.map((f) => ({ ...f })),
      },
    });
  }

  /**
   * Run a full battle quickly (useful for tests or auto-sim).
   * In the game we typically drive it step-by-step using `step()`.
   */
  public runToEnd(maxRounds = 30): void {
    for (let i = 0; i < maxRounds && !this.over; i++) {
      this.stepRound();
    }
    if (!this.over) this.finish('Draw');
  }

  /**
   * Perform one "action" step.
   *
   * Our BattleEngine drives this with a timer so animations can keep up.
   */
  public step(): void {
    // In this MVP, `step()` just runs a whole round.
    // Later we can break it down into per-actor actions for finer-grained sync.
    this.stepRound();
  }

  public isOver(): boolean {
    return this.over;
  }

  public getRound(): number {
    return this.round;
  }

  private stepRound(): void {
    if (this.over) return;

    this.round += 1;
    this.emitter.emit({ type: 'roundStart', payload: { round: this.round } });
    this.buffSystem.onRoundStart(this.round);

    const actors = this.getAllAlive().sort((a, b) => b.spd - a.spd || a.id.localeCompare(b.id));
    for (const actor of actors) {
      if (this.over) break;
      if (actor.hp <= 0) continue;

      this.emitter.emit({ type: 'actorTurn', payload: { round: this.round, actorId: actor.id } });
      // Skill hook (structure only): onTurnStart
      this.skillSystem.tryTrigger('onTurnStart', actor, { round: this.round, actorId: actor.id }, this.getSkillApi());
      this.performBasicAttack(actor);
      this.checkBattleEnd();
    }

    // Safety: if both teams still alive but we reached too many rounds, treat as draw
    if (!this.over && this.round >= 30) {
      this.finish('Draw');
    }
  }

  private performBasicAttack(actor: FighterSnapshot): void {
    const enemyTeam = actor.side === 'A' ? this.teamB : this.teamA;

    // Front/Back targeting rule (minimal strategy):
    // - Only applies to enemy (side B) basic attacks against our team (A)
    // - Frontline slots: 0~1, Backline slots: 2~4 (based on team order / partyHeroIds order)
    // - allowHitBackline is reserved for future "assassin" style skills (default false)
    const allowHitBackline = false;

    let targets: FighterSnapshot[] = [];
    if (actor.side === 'B' && enemyTeam === this.teamA && !allowHitBackline) {
      const frontAlive = enemyTeam.slice(0, 2).filter((t) => t.hp > 0);
      targets = frontAlive.length > 0 ? frontAlive : enemyTeam.slice(2, 5).filter((t) => t.hp > 0);
      if (targets.length === 0) targets = enemyTeam.filter((t) => t.hp > 0);
    } else {
      targets = enemyTeam.filter((t) => t.hp > 0);
    }

    if (targets.length === 0) return;

    const target = targets[Math.floor(this.rng() * targets.length)];
    if (!target) return;

    const api = this.getSkillApi();
    this.skillSystem.tryTrigger('onBeforeAttack', actor, { round: this.round, actorId: actor.id, targetId: target.id }, api);

    // --- Damage formula (MVP) ---
    // Base damage = ATK * random(0.85 ~ 1.15)
    // Damage variance is config-driven for easy tuning without touching battle logic.
    const variance = BATTLE.damageVarianceMin + this.rng() * (BATTLE.damageVarianceMax - BATTLE.damageVarianceMin);
    const dmg = Math.max(1, Math.floor(actor.atk * variance));

    // Skill hook (structure only): onBeforeDamage
    this.skillSystem.tryTrigger('onBeforeDamage', actor, { round: this.round, actorId: actor.id, targetId: target.id }, api);

    this.dealDamage(actor.id, target.id, dmg);

    // Skill hook (structure only): onAfterDamage/onAfterAttack
    this.skillSystem.tryTrigger('onAfterDamage', actor, { round: this.round, actorId: actor.id, targetId: target.id }, api);
    this.skillSystem.tryTrigger('onAfterAttack', actor, { round: this.round, actorId: actor.id, targetId: target.id }, api);
  }

  /**
   * SkillRuntimeAPI implementation.
   * Effects call these helpers so BattleLogic remains the only place that mutates HP/buffs.
   */
  private getSkillApi(): SkillRuntimeAPI {
    return {
      dealDamage: (sourceId, targetId, amount) => this.dealDamage(sourceId, targetId, amount),
      heal: (sourceId, targetId, amount) => this.heal(sourceId, targetId, amount),
      addBuff: (sourceId, targetId, buffId, stacks) => this.addBuff(sourceId, targetId, buffId, stacks ?? 1),
      removeBuff: (targetId, buffId) => this.removeBuff(targetId, buffId),
    };
  }

  private findFighter(id: string): FighterSnapshot | undefined {
    return [...this.teamA, ...this.teamB].find((f) => f.id === id);
  }

  private dealDamage(sourceId: string, targetId: string, amount: number): void {
    const target = this.findFighter(targetId);
    if (!target || target.hp <= 0) return;
    const a = Math.max(1, Math.floor(amount));
    target.hp = Math.max(0, target.hp - a);

    this.emitter.emit({
      type: 'damage',
      payload: { sourceId, targetId, amount: a, targetHp: target.hp, targetMaxHp: target.maxHp },
    });
    if (target.hp <= 0) this.emitter.emit({ type: 'dead', payload: { targetId } });
  }

  private heal(sourceId: string, targetId: string, amount: number): void {
    const target = this.findFighter(targetId);
    if (!target || target.hp <= 0) return;
    const a = Math.max(1, Math.floor(amount));
    target.hp = Math.min(target.maxHp, target.hp + a);
    this.emitter.emit({ type: 'heal', payload: { sourceId, targetId, amount: a, targetHp: target.hp, targetMaxHp: target.maxHp } });
  }

  private addBuff(sourceId: string, targetId: string, buffId: string, stacks = 1): void {
    this.buffSystem.addBuff(sourceId, targetId, buffId, stacks, this.round);
    this.emitter.emit({ type: 'buffAdd', payload: { sourceId, targetId, buffId, stacks } });
  }

  private removeBuff(targetId: string, buffId: string): void {
    this.buffSystem.removeBuff(targetId, buffId);
    this.emitter.emit({ type: 'buffRemove', payload: { targetId, buffId } });
  }

  private checkBattleEnd(): void {
    const aAlive = this.teamA.some((f) => f.hp > 0);
    const bAlive = this.teamB.some((f) => f.hp > 0);
    if (aAlive && bAlive) return;

    if (aAlive && !bAlive) this.finish('A');
    else if (!aAlive && bAlive) this.finish('B');
    else this.finish('Draw');
  }

  private finish(winner: Side | 'Draw'): void {
    if (this.over) return;
    this.over = true;
    this.emitter.emit({ type: 'battleEnd', payload: { winner } });
  }

  private getAllAlive(): FighterSnapshot[] {
    return [...this.teamA, ...this.teamB].filter((f) => f.hp > 0);
  }
}
