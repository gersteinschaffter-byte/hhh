import type { FighterSnapshot } from './BattleTypes';
import type { EffectContext, SkillRuntimeAPI, TriggerContext, TriggerType } from './SkillTypes';
import type { SkillRegistry } from './SkillRegistry';

/**
 * SkillSystem
 *
 * Runtime executor that:
 * - looks up skills by id (registry)
 * - checks triggers
 * - applies effects through a small API
 *
 * This keeps BattleLogic clean: no giant switch/case per skill.
 */
export default class SkillSystem {
  constructor(private readonly registry: SkillRegistry) {}

  /** Execute skills owned by `actor` for the given trigger. */
  public tryTrigger(trigger: TriggerType, actor: FighterSnapshot, ctx: TriggerContext, api: SkillRuntimeAPI): void {
    const skillIds = actor.skills ?? [];
    if (skillIds.length === 0) return;

    for (const id of skillIds) {
      const s = this.registry.get(id);
      if (!s) continue;
      // Check any matching trigger; if matches, run all effects.
      const ok = s.triggers.some((tr) => tr.type === trigger && tr.match(ctx));
      if (!ok) continue;
      const ectx: EffectContext = {
        round: ctx.round,
        sourceId: ctx.actorId,
        targetId: ctx.targetId ?? ctx.actorId,
      };
      for (const eff of s.effects) {
        eff.apply(ectx, api);
      }
    }
  }
}
