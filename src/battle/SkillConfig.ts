import skillsJson from '../configs/skills.json';

export type SkillKind = 'active' | 'passive';
export type SkillTarget = 'enemy_single' | 'enemy_aoe' | 'ally_single' | 'self';
export type SkillEffect = 'damage' | 'heal' | 'shield' | 'apply_buff' | 'apply_dot';

export interface SkillConfig {
  id: string;
  name: string;
  kind: SkillKind;
  cooldown?: number;
  target: SkillTarget;
  effect: SkillEffect;
  params?: Record<string, number | string>;
}

export const SKILLS: SkillConfig[] = skillsJson as unknown as SkillConfig[];
export const SKILL_MAP: Record<string, SkillConfig> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
