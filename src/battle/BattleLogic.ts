import type { BattleEventEmitter, BattleReport, BattleSetup, FighterSnapshot, Side, UnitStats } from './BattleTypes';
import { BATTLE } from '../game/config';
import BuffSystem from './BuffSystem';
import { BuffRegistry } from './SkillRegistry';
import { SKILL_MAP } from './SkillConfig';

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

  private readonly buffRegistry = new BuffRegistry();
  private readonly buffSystem = new BuffSystem(this.buffRegistry);

  private round = 0;
  private over = false;

  private teamA: FighterSnapshot[] = [];
  private teamB: FighterSnapshot[] = [];
  private report: BattleReport = { units: [] };
  private readonly statsById = new Map<string, UnitStats>();
  private readonly shieldById = new Map<string, number>();
  private readonly skillCooldowns = new Map<string, Map<string, number>>();

  constructor(emitter: BattleEventEmitter, rng?: () => number) {
    this.emitter = emitter;
    this.rng = rng ?? Math.random;
    this.registerDefaultBuffs();
  }

  /** Initialize battle state from setup. Safe to call multiple times. */
  public init(setup: BattleSetup): void {
    this.round = 0;
    this.over = false;
    // Clone input so callers cannot mutate logic state.
    this.teamA = setup.teamA.map((f) => ({ ...f }));
    this.teamB = setup.teamB.map((f) => ({ ...f }));
    this.shieldById.clear();
    this.skillCooldowns.clear();
    this.statsById.clear();
    this.report = { units: [] };

    const all = [...this.teamA, ...this.teamB];
    for (const f of all) {
      const stats: UnitStats = {
        unitId: f.id,
        heroId: f.heroId,
        heroClass: f.heroClass,
        damageDealt: 0,
        damageTaken: 0,
        healingDone: 0,
        shieldsApplied: 0,
        kills: 0,
        skillCasts: 0,
        skillCastsById: {},
      };
      this.statsById.set(f.id, stats);
      this.report.units.push(stats);
    }

    // Init buff containers (placeholder; no stat modification in MVP)
    this.buffSystem.init(all);

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

  public getReport(): BattleReport {
    return { units: this.report.units.map((u) => ({ ...u, skillCastsById: { ...(u.skillCastsById ?? {}) } })) };
  }

  private stepRound(): void {
    if (this.over) return;

    this.round += 1;
    this.emitter.emit({ type: 'roundStart', payload: { round: this.round } });
    this.buffSystem.onRoundStart(this.round);
    this.tickDots();
    this.reduceCooldowns();

    const actors = this.getAllAlive().sort((a, b) => b.spd - a.spd || a.id.localeCompare(b.id));
    for (const actor of actors) {
      if (this.over) break;
      if (actor.hp <= 0) continue;

      this.emitter.emit({ type: 'actorTurn', payload: { round: this.round, actorId: actor.id } });
      this.performAction(actor);
      this.checkBattleEnd();
    }

    // Safety: if both teams still alive but we reached too many rounds, treat as draw
    if (!this.over && this.round >= 30) {
      this.finish('Draw');
    }
  }

  private performBasicAttack(actor: FighterSnapshot): void {
    const enemyTeam = actor.side === 'A' ? this.teamB : this.teamA;
    const target = this.selectTarget(actor, enemyTeam);
    if (!target) return;

    // --- Damage formula (MVP) ---
    // Base damage = ATK * random(0.85 ~ 1.15)
    // Damage variance is config-driven for easy tuning without touching battle logic.
    const variance = BATTLE.damageVarianceMin + this.rng() * (BATTLE.damageVarianceMax - BATTLE.damageVarianceMin);
    const dmg = Math.max(1, Math.floor(actor.atk * variance));

    this.dealDamage(actor.id, target.id, dmg);
  }

  private performAction(actor: FighterSnapshot): void {
    const skillId = this.pickSkill(actor);
    if (skillId) {
      const skill = SKILL_MAP[skillId];
      if (skill && this.castSkill(actor, skill)) return;
    }
    this.performBasicAttack(actor);
  }

  private pickSkill(actor: FighterSnapshot): string | null {
    const skillIds = actor.skills ?? [];
    if (skillIds.length === 0) return null;
    const skillId = skillIds[0];
    if (!skillId) return null;
    const skill = SKILL_MAP[skillId];
    if (!skill || skill.kind !== 'active') return null;

    const cooldown = this.getCooldown(actor.id, skillId);
    if (cooldown > 0) return null;

    const enemyTeam = actor.side === 'A' ? this.teamB : this.teamA;
    const allyTeam = actor.side === 'A' ? this.teamA : this.teamB;
    const aliveEnemies = enemyTeam.filter((t) => t.hp > 0);
    const aliveAllies = allyTeam.filter((t) => t.hp > 0);

    switch (actor.heroClass) {
      case 'support': {
        const target = this.selectHealTarget(actor, aliveAllies);
        return target ? skillId : null;
      }
      case 'tank': {
        const hasTaunt = this.hasBuff(actor.id, 'taunt');
        return hasTaunt ? null : skillId;
      }
      case 'assassin': {
        const threshold = Number(skill.params?.executeThreshold ?? 0.35);
        const low = aliveEnemies.some((t) => t.hp > 0 && t.hp / t.maxHp <= threshold);
        return low ? skillId : null;
      }
      case 'warrior': {
        return aliveEnemies.length >= 2 ? skillId : null;
      }
      case 'mage': {
        return aliveEnemies.length >= 2 ? skillId : null;
      }
      default:
        return skillId;
    }
  }

  private castSkill(actor: FighterSnapshot, skill: (typeof SKILL_MAP)[string]): boolean {
    const enemyTeam = actor.side === 'A' ? this.teamB : this.teamA;
    const allyTeam = actor.side === 'A' ? this.teamA : this.teamB;
    const targets = this.resolveSkillTargets(actor, skill, allyTeam, enemyTeam);
    if (targets.length === 0) return false;

    this.recordSkillCast(actor.id, skill.id);
    const cooldown = Math.max(0, Math.floor(Number(skill.cooldown ?? 0)));
    if (cooldown > 0) this.setCooldown(actor.id, skill.id, cooldown);

    switch (skill.effect) {
      case 'damage': {
        const baseRatio = Number(skill.params?.ratio ?? 1);
        const threshold = Number(skill.params?.executeThreshold ?? -1);
        const executeMultiplier = Number(skill.params?.executeMultiplier ?? 1);
        for (const target of targets) {
          let ratio = baseRatio;
          if (threshold > 0 && target.hp / target.maxHp <= threshold) {
            ratio *= executeMultiplier;
          }
          const dmg = Math.max(1, Math.floor(actor.atk * ratio));
          this.dealDamage(actor.id, target.id, dmg);
        }
        break;
      }
      case 'heal': {
        const ratio = Number(skill.params?.ratio ?? 0.25);
        for (const target of targets) {
          const amount = Math.max(1, Math.floor(target.maxHp * ratio));
          this.heal(actor.id, target.id, amount);
        }
        break;
      }
      case 'shield': {
        const ratio = Number(skill.params?.ratio ?? 0.2);
        for (const target of targets) {
          const amount = Math.max(1, Math.floor(target.maxHp * ratio));
          this.applyShield(actor.id, target.id, amount);
        }
        break;
      }
      case 'apply_buff': {
        const buffId = String(skill.params?.buffId ?? '');
        const duration = Number(skill.params?.duration ?? 0);
        if (buffId) {
          for (const target of targets) {
            this.addBuff(actor.id, target.id, buffId, 1, duration > 0 ? duration : undefined);
          }
        }
        const shieldRatio = Number(skill.params?.shieldRatio ?? 0);
        if (shieldRatio > 0) {
          for (const target of targets) {
            const amount = Math.max(1, Math.floor(target.maxHp * shieldRatio));
            this.applyShield(actor.id, target.id, amount);
          }
        }
        break;
      }
      case 'apply_dot': {
        const ratio = Number(skill.params?.ratio ?? 0.4);
        const duration = Number(skill.params?.duration ?? 2);
        const buffId = String(skill.params?.buffId ?? 'burn');
        for (const target of targets) {
          const damagePerRound = Math.max(1, Math.floor(actor.atk * ratio));
          this.addBuff(actor.id, target.id, buffId, 1, duration + 1, { damagePerRound });
        }
        break;
      }
      default:
        break;
    }

    return true;
  }

  private resolveSkillTargets(
    actor: FighterSnapshot,
    skill: (typeof SKILL_MAP)[string],
    allyTeam: FighterSnapshot[],
    enemyTeam: FighterSnapshot[],
  ): FighterSnapshot[] {
    switch (skill.target) {
      case 'self':
        return [actor];
      case 'ally_single': {
        const target = this.selectHealTarget(actor, allyTeam.filter((t) => t.hp > 0));
        return target ? [target] : [];
      }
      case 'enemy_single': {
        const target = this.selectTarget(actor, enemyTeam);
        return target ? [target] : [];
      }
      case 'enemy_aoe': {
        const maxTargets = Number(skill.params?.maxTargets ?? 0);
        return this.selectAoeTargets(actor, enemyTeam, maxTargets > 0 ? maxTargets : undefined);
      }
      default:
        return [];
    }
  }

  private selectTarget(actor: FighterSnapshot, enemyTeam: FighterSnapshot[]): FighterSnapshot | null {
    const alive = enemyTeam.filter((t) => t.hp > 0);
    if (alive.length === 0) return null;

    const taunt = alive.find((t) => this.hasBuff(t.id, 'taunt'));
    if (taunt) return taunt;

    switch (actor.heroClass) {
      case 'assassin':
        return this.pickLowestHp(alive);
      case 'warrior':
      case 'tank':
        return this.pickFrontTarget(alive, enemyTeam);
      case 'mage':
      case 'support':
        return this.pickFrontTarget(alive, enemyTeam) ?? alive[0] ?? null;
      default:
        return alive[0] ?? null;
    }
  }

  private selectHealTarget(actor: FighterSnapshot, allyTeam: FighterSnapshot[]): FighterSnapshot | null {
    const candidates = allyTeam.filter((t) => t.hp > 0 && t.hp < t.maxHp);
    if (candidates.length === 0) return null;
    return this.pickLowestHp(candidates);
  }

  private selectAoeTargets(actor: FighterSnapshot, enemyTeam: FighterSnapshot[], maxTargets?: number): FighterSnapshot[] {
    const alive = enemyTeam.filter((t) => t.hp > 0);
    if (alive.length === 0) return [];

    const taunts = alive.filter((t) => this.hasBuff(t.id, 'taunt'));
    const list: FighterSnapshot[] = [];
    if (taunts.length > 0) {
      for (const t of taunts) {
        if (!list.includes(t)) list.push(t);
        if (maxTargets && list.length >= maxTargets) return list.slice(0, maxTargets);
      }
    }

    const ordered =
      actor.heroClass === 'assassin'
        ? [...alive].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
        : this.orderByFrontline(alive, enemyTeam);
    for (const t of ordered) {
      if (list.includes(t)) continue;
      list.push(t);
      if (maxTargets && list.length >= maxTargets) break;
    }
    return maxTargets ? list.slice(0, maxTargets) : list;
  }

  private pickLowestHp(list: FighterSnapshot[]): FighterSnapshot {
    return [...list].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0]!;
  }

  private pickFrontTarget(alive: FighterSnapshot[], fullTeam: FighterSnapshot[]): FighterSnapshot | null {
    const frontline = fullTeam.slice(0, 2).filter((t) => t.hp > 0);
    if (frontline.length > 0) return frontline[0] ?? null;
    return alive[0] ?? null;
  }

  private orderByFrontline(alive: FighterSnapshot[], fullTeam: FighterSnapshot[]): FighterSnapshot[] {
    const frontIds = new Set(fullTeam.slice(0, 2).map((t) => t.id));
    return [...alive].sort((a, b) => {
      const af = frontIds.has(a.id) ? 0 : 1;
      const bf = frontIds.has(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.id.localeCompare(b.id);
    });
  }

  private findFighter(id: string): FighterSnapshot | undefined {
    return [...this.teamA, ...this.teamB].find((f) => f.id === id);
  }

  private dealDamage(sourceId: string, targetId: string, amount: number): void {
    const target = this.findFighter(targetId);
    if (!target || target.hp <= 0) return;
    const raw = Math.max(1, Math.floor(amount));

    let remaining = raw;
    const shield = this.shieldById.get(targetId) ?? 0;
    if (shield > 0) {
      const absorbed = Math.min(shield, remaining);
      remaining -= absorbed;
      const nextShield = shield - absorbed;
      if (nextShield > 0) this.shieldById.set(targetId, nextShield);
      else this.shieldById.delete(targetId);
    }

    if (remaining > 0) {
      target.hp = Math.max(0, target.hp - remaining);
    }

    const srcStats = this.statsById.get(sourceId);
    if (srcStats) srcStats.damageDealt += raw;
    const tarStats = this.statsById.get(targetId);
    if (tarStats) tarStats.damageTaken += Math.max(0, remaining);

    if (remaining > 0) {
      this.emitter.emit({
        type: 'damage',
        payload: { sourceId, targetId, amount: remaining, targetHp: target.hp, targetMaxHp: target.maxHp },
      });
    }
    if (target.hp <= 0) {
      if (srcStats) srcStats.kills += 1;
      this.emitter.emit({ type: 'dead', payload: { targetId } });
    }
  }

  private heal(sourceId: string, targetId: string, amount: number): void {
    const target = this.findFighter(targetId);
    if (!target || target.hp <= 0) return;
    const a = Math.max(1, Math.floor(amount));
    target.hp = Math.min(target.maxHp, target.hp + a);
    const srcStats = this.statsById.get(sourceId);
    if (srcStats) srcStats.healingDone += a;
    this.emitter.emit({ type: 'heal', payload: { sourceId, targetId, amount: a, targetHp: target.hp, targetMaxHp: target.maxHp } });
  }

  private applyShield(sourceId: string, targetId: string, amount: number): void {
    const target = this.findFighter(targetId);
    if (!target || target.hp <= 0) return;
    const a = Math.max(1, Math.floor(amount));
    this.shieldById.set(targetId, (this.shieldById.get(targetId) ?? 0) + a);
    const srcStats = this.statsById.get(sourceId);
    if (srcStats) srcStats.shieldsApplied += a;
  }

  private addBuff(
    sourceId: string,
    targetId: string,
    buffId: string,
    stacks = 1,
    durationRounds?: number,
    data?: Record<string, number>,
  ): void {
    this.buffSystem.addBuff(sourceId, targetId, buffId, stacks, this.round, { durationRounds, data });
    this.emitter.emit({ type: 'buffAdd', payload: { sourceId, targetId, buffId, stacks } });
  }

  private removeBuff(targetId: string, buffId: string): void {
    this.buffSystem.removeBuff(targetId, buffId);
    this.emitter.emit({ type: 'buffRemove', payload: { targetId, buffId } });
  }

  private hasBuff(targetId: string, buffId: string): boolean {
    return this.buffSystem.getBuffs(targetId).some((b) => b.id === buffId);
  }

  private tickDots(): void {
    const fighters = [...this.teamA, ...this.teamB].filter((f) => f.hp > 0);
    for (const f of fighters) {
      const buffs = this.buffSystem.getBuffs(f.id);
      for (const buff of buffs) {
        if (buff.id !== 'burn') continue;
        const sourceId = buff.sourceId ?? f.id;
        const perRound = Math.max(1, Math.floor(Number(buff.data?.damagePerRound ?? 0)));
        const total = perRound * Math.max(1, buff.stacks || 1);
        if (total > 0) this.dealDamage(sourceId, f.id, total);
      }
    }
  }

  private recordSkillCast(sourceId: string, skillId: string): void {
    const stats = this.statsById.get(sourceId);
    if (!stats) return;
    stats.skillCasts += 1;
    if (!stats.skillCastsById) stats.skillCastsById = {};
    stats.skillCastsById[skillId] = (stats.skillCastsById[skillId] ?? 0) + 1;
  }

  private getCooldown(actorId: string, skillId: string): number {
    return this.skillCooldowns.get(actorId)?.get(skillId) ?? 0;
  }

  private setCooldown(actorId: string, skillId: string, value: number): void {
    const map = this.skillCooldowns.get(actorId) ?? new Map<string, number>();
    map.set(skillId, Math.max(0, value));
    this.skillCooldowns.set(actorId, map);
  }

  private reduceCooldowns(): void {
    for (const map of this.skillCooldowns.values()) {
      for (const [skillId, value] of map.entries()) {
        const next = Math.max(0, value - 1);
        map.set(skillId, next);
      }
    }
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

  private registerDefaultBuffs(): void {
    this.buffRegistry.register({ id: 'taunt', name: '嘲讽', durationRounds: 2 });
    this.buffRegistry.register({ id: 'burn', name: '灼烧', durationRounds: 3 });
  }
}
