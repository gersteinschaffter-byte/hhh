import { Container } from 'pixi.js';
import type GameApp from '../core/GameApp';
import BaseScene from './BaseScene';
import BattleEngine from '../battle/BattleEngine';
import type { FighterSnapshot, Side } from '../battle/BattleTypes';
import UIButton from '../ui/components/UIButton';
import { createText } from '../ui/uiFactory';
import { HERO_CLASS_LABEL, HERO_MAP } from '../game/data';
import { ECONOMY, RARITY } from '../game/config';

/**
 * BattleScene
 *
 * Phase 6 goal (MVP+):
 * - Read player's owned heroes from GameState
 * - Generate battle stats based on hero level + rarity
 * - Generate simple enemies based on player's power
 * - On battle end, settle rewards through GameState + show popup (Popup layer via global Modal)
 */
export default class BattleScene extends BaseScene {
  private readonly game: GameApp;
  private readonly engine: BattleEngine;
  private readonly title;
  private readonly btnRestart;
  private readonly hint;

  private battleResolved = false;

  // Progress stage is a first-class field in GameState (v0.0.8+).

  // Boss chest drop rates (boss win only)
  private static readonly CHEST_PROB = [
    { key: 'chest_c', p: 0.6 },
    { key: 'chest_b', p: 0.25 },
    { key: 'chest_a', p: 0.12 },
    { key: 'chest_s', p: 0.03 },
  ] as const;

  // Simple, tuneable stat multipliers by rarity.
  private static readonly RARITY_MULT: Record<string, number> = {
    [RARITY.R]: 1.0,
    [RARITY.SR]: 1.25,
    [RARITY.SSR]: 1.6,
    [RARITY.SP]: 2.0,
  };

  constructor(game: GameApp) {
    super('battle');
    this.game = game;
    this.engine = new BattleEngine({ stepIntervalTicks: 32 });

    // Intercept battle end to trigger settlement (rewards + popup).
    const rawEmit = this.engine.emit.bind(this.engine);
    (this.engine as any).emit = (e: any) => {
      rawEmit(e);
      if (e?.type === 'battleEnd') {
        const winner: Side | 'Draw' = e.payload?.winner;
        this.onBattleEnd(winner);
      }
    };

    this.title = createText('战斗', 40, 0xffffff, '900');
    this.title.anchor.set(0.5);
    this.root.addChild(this.title);

    // Arena view
    this.root.addChild(this.engine.view.root);

    this.btnRestart = new UIButton('重新开始', 240, 78);
    this.btnRestart.on('pointertap', () => this.startBattleFromState());
    this.root.addChild(this.btnRestart);

    this.hint = createText('自动回合制：使用玩家队伍 + 胜利奖励 ✅', 18, 0xd7e6ff, '800');
    this.hint.anchor.set(0.5);
    this.root.addChild(this.hint);
  }

  public override onEnter(): void {
    // Hide bottom nav for better immersion; keep TopBar for back.
    this.game.bottomNav.visible = false;
    this.startBattleFromState();
  }

  public override onExit(): void {
    this.game.bottomNav.visible = true;
  }

  public override onResize(w: number, h: number): void {
    if (!this.title || (this.title as any).destroyed) return;
    this.title.position.set(w / 2, 170);
    // Arena is 720x900 inside view; place it centered
    const root: any = (this.engine as any)?.view?.root;
    if (root && !root.destroyed) root.position.set((w - 720) / 2, 240);
    if (this.btnRestart && !(this.btnRestart as any).destroyed) this.btnRestart.position.set((w - 240) / 2, h - 220);
    if (this.hint && !(this.hint as any).destroyed) this.hint.position.set(w / 2, h - 128);
  }

  public override onUpdate(dt: number): void {
    this.engine.update(dt);
  }

  private startBattleFromState(): void {
    this.battleResolved = false;

    const rawParty = [...(this.game.state.partyHeroIds ?? [])].slice(0, 5);
    if (rawParty.length < 1) {
      this.game.toast.show("请先上阵至少1名英雄", 2);
      this.game.goTo("home", { animate: false });
      return;
    }

    const ownedHeroes = rawParty
      .map((id) => this.game.state.getOwnedHero(id))
      .filter((h): h is any => !!h)
      .slice(0, 5);


    const validHeroes = ownedHeroes.filter((h) => !!HERO_MAP[h.heroId]);
    if (validHeroes.length !== validHeroes.length) {
      this.game.state.setPartyHeroIds(validHeroes.map((h) => h.heroId));
    }

    if (validHeroes.length < 1) {
      this.game.toast.show("队伍英雄无效，请重新上阵", 2);
      this.game.state.setPartyHeroIds([]);
      this.game.goTo("home", { animate: false });
      return;
    }


    const mk = (
      id: string,
      name: string,
      side: 'A' | 'B',
      hp: number,
      atk: number,
      spd: number,
      heroId?: string,
      heroClass?: string,
      skills?: string[],
    ): FighterSnapshot => ({
      id,
      name,
      side,
      hp,
      maxHp: hp,
      atk,
      spd,
      heroId,
      heroClass,
      skills,
    });

    // --- Team A: player's owned heroes ---
    const teamA: FighterSnapshot[] = validHeroes.map((o, idx) => {
      const def = HERO_MAP[o.heroId];
      // If data is missing for some reason, keep a safe fallback.
      const rarity = def?.rarity ?? RARITY.R;
      const name = def?.name ?? `英雄${idx + 1}`;
      const baseStats = this.genHeroStats(def, o.level || 1, rarity);
      // Stars bonus (battle-only): mult = 1 + bonus * (stars - 1). Treat 0 as 1★ for backward compatibility.
      const stars = Math.max(1, o.stars || 0);
      const bonus = Math.max(0, Number((ECONOMY as any).starBonusPerStar ?? 0.1));
      const mult = 1 + bonus * (stars - 1);
      const hp2 = Math.round(baseStats.hp * mult);
      const atk2 = Math.round(baseStats.atk * mult);
      return mk(`p${idx + 1}:${o.heroId}`, name, 'A', hp2, atk2, baseStats.spd, o.heroId, def?.class, def?.skillIds ?? []);
    });

    // --- Team B: simple generated enemies ---
    const avgLv = Math.max(1, Math.round(validHeroes.reduce((s, h) => s + (h.level || 1), 0) / validHeroes.length));
    const enemyLv = Math.min(60, avgLv + 2);
    const enemyCount = 3;
    const enemyClasses = ['warrior', 'tank', 'assassin', 'mage', 'support'];
    const teamB: FighterSnapshot[] = Array.from({ length: enemyCount }).map((_, i) => {
      // Enemies are slightly weaker in rarity but scale with level.
      const r = enemyLv >= 20 ? RARITY.SR : RARITY.R;
      const { hp, atk, spd } = this.genEnemyStats(enemyLv, r, i);
      const heroClass = enemyClasses[i % enemyClasses.length];
      return mk(`e${i + 1}`, `敌人${i + 1}`, 'B', hp, atk, spd, undefined, heroClass, []);
    });

    this.engine.start({ teamA, teamB });
  }

  private getCurrentStage(): number {
    return this.game.state.stage;
  }

  private rollBossChest(stage: number): string {
    let r = Math.random();
    let picked = 'chest_c';
    for (const it of BattleScene.CHEST_PROB) {
      r -= it.p;
      if (r <= 0) {
        picked = it.key;
        break;
      }
    }
    // Pity: stage % 50 == 0 must be at least chest_a.
    if (stage % 50 === 0 && (picked === 'chest_c' || picked === 'chest_b')) {
      picked = 'chest_a';
    }
    return picked;
  }

  /**
   * Minimal stat generation (stable & tunable).
   * Ensures stats increase with level and rarity.
   */
  private genHeroStats(hero: (typeof HERO_MAP)[string] | undefined, level: number, rarity: string): { hp: number; atk: number; spd: number } {
    const lv = Math.max(1, Math.floor(level));
    const base = hero?.baseStats ?? { hp: 200, atk: 30, spd: 90 };
    const growth = hero?.perLevelGrowth ?? { hp: 36, atk: 7, spd: 1 };
    const hp = Math.round(base.hp + (lv - 1) * growth.hp);
    const atk = Math.round(base.atk + (lv - 1) * growth.atk);
    const spd = Math.round(base.spd + (lv - 1) * growth.spd);
    if (!hero) {
      const fallbackBase = BattleScene.RARITY_MULT[rarity] ?? 1.0;
      return { hp: Math.round(hp * fallbackBase), atk: Math.round(atk * fallbackBase), spd };
    }
    return { hp, atk, spd };
  }

  /**
   * Enemy stats: scale with player's power (avg level + 2).
   * Slight random-ish variation per slot to avoid identical enemies.
   */
  private genEnemyStats(level: number, rarity: string, index: number): { hp: number; atk: number; spd: number } {
    const lv = Math.max(1, Math.floor(level));
    const base = (BattleScene.RARITY_MULT[rarity] ?? 1.0) * 0.95;
    const slotMul = 1 + (index - 1) * 0.06; // -6%, 0%, +6%
    const hp = Math.round((220 * base + lv * 42 * base) * slotMul);
    const atk = Math.round((28 * base + lv * 7.5 * base) * slotMul);
    const spd = Math.round(88 + lv * 1 + index);
    return { hp, atk, spd };
  }

  private onBattleEnd(winner: Side | 'Draw'): void {
    if (this.battleResolved) return;
    this.battleResolved = true;

    const modal = this.game.modal;
    modal.content.removeChildren();

    const panelW = modal.panel.width;
    const panelH = modal.panel.height;

    const isWin = winner === 'A';
    const title = createText(isWin ? '胜利！' : winner === 'B' ? '失败' : '平局', 44, 0xffffff, '900');
    title.anchor.set(0.5);
    title.position.set(panelW / 2, 86);

    // Reward settlement must go through GameState (data-driven UI refresh).
    const lines: string[] = [];
    let goldGained = 0;
    let diamondsGained = 0;
    let shardsGained = 0;
    let chestText = '';
    const stage = this.getCurrentStage();
    const isBoss = stage % 10 === 0;
    if (isWin) {
      const ownedHeroes = [...this.game.state.heroes].slice(0, 3);
      const partyIds = [...(this.game.state.partyHeroIds ?? [])].slice(0, 5);
      const partyHeroes = partyIds.map((id) => this.game.state.getOwnedHero(id)).filter((h): h is any => !!h);
      const partyValid = partyHeroes.filter((h) => !!HERO_MAP[h.heroId]);
      const avgLv = partyValid.length > 0 ? Math.max(1, Math.round(partyValid.reduce((s, h) => s + (h.level || 1), 0) / partyValid.length)) : 1;
      const gold = Math.max(20, 60 + avgLv * 18);
      this.game.state.addGold(gold);
      goldGained = gold;
      lines.push(`金币 +${gold}`);

      // Advance stage after win.
      this.game.state.advanceStage(1);

      if (isBoss) {
        // Diamonds & shards (dupe shards)
        const diamonds = Math.max(10, 20 + Math.floor(stage / 10) * 5);
        const shards = Math.max(2, 6 + Math.floor(stage / 10));
        this.game.state.addDiamonds(diamonds);
        this.game.state.addInventory(ECONOMY.dupeShardKey, shards);
        diamondsGained = diamonds;
        shardsGained = shards;
        lines.push(`钻石 +${diamonds}`);
        lines.push(`万能碎片 +${shards}`);

        const chestKey = this.rollBossChest(stage);
        this.game.state.addInventory(chestKey, 1);
        const econ = ECONOMY as any;
        const chestName =
          chestKey === 'chest_c'
            ? econ.chest_cName ?? '普通宝箱'
            : chestKey === 'chest_b'
              ? econ.chest_bName ?? '高级宝箱'
              : chestKey === 'chest_a'
                ? econ.chest_aName ?? '史诗宝箱'
                : econ.chest_sName ?? '传说宝箱';
        chestText = `${chestName} x1`;
        lines.push(`宝箱：${chestName} x1`);
      }
    } else {
      lines.push(winner === 'Draw' ? '本次战斗平局，无奖励。' : '本次战斗失败，无奖励。');
    }
    // --- Reward UI (aligned + light animation) ---
    const rewardTitle = createText(isWin ? '获得奖励' : '本局奖励', 26, 0xffe3a3, '900');
    rewardTitle.anchor.set(0.5);
    rewardTitle.position.set(panelW / 2, 150);

    const rewardBox = new Container();
    rewardBox.position.set(60, 176);

    const rowH = 34;
    const makeRow = (y: number, left: string, rightText: string, valueRef?: { set: (n: number) => void }) => {
      const l = createText(left, 22, 0xd7e6ff, '900');
      l.anchor.set(0, 0.5);
      l.position.set(0, y);

      const r = createText(rightText, 22, 0xffffff, '900');
      r.anchor.set(1, 0.5);
      r.position.set(panelW - 120, y);
      rewardBox.addChild(l, r);
      return r;
    };

    // Values start from 0 for a tiny "count-up" feel.
    const valGold = makeRow(0 * rowH, '🪙 金币', '0');
    const valDia = makeRow(1 * rowH, '💎 钻石', '0');
    const valShard = makeRow(2 * rowH, '🧩 碎片', '0');
    const valChest = makeRow(3 * rowH, '📦 宝箱', chestText ? chestText : '0');

    const rounds = (this.engine as any)?.logic?.getRound?.() ?? 0;
    const partyNow = [...(this.game.state.partyHeroIds ?? [])].slice(0, 5);
    const statsLines: string[] = [];
    if (rounds > 0) statsLines.push(`回合数：${rounds}`);
    if (partyNow.length > 0) statsLines.push(`我方人数：${partyNow.length}/5`);
    const stats = statsLines.length > 0 ? createText(`本局统计：\n${statsLines.join('\n')}`, 20, 0xaed2ff, '800') : null;
    if (stats) {
      stats.anchor.set(0.5);
      stats.position.set(panelW / 2, 340);
      (stats.style as any).align = 'center';
      (stats.style as any).lineHeight = 28;
    }

    const report = this.engine.getReport();
    const teamStats = report.units.filter((u) => u.unitId.startsWith('p'));
    const reportTop = stats ? 392 : 340;

    const reportTitle = createText('战报', 24, 0xffe3a3, '900');
    reportTitle.anchor.set(0.5);
    reportTitle.position.set(panelW / 2, reportTop);

    const reportBox = new Container();
    reportBox.position.set(60, reportTop + 24);

    const reportWidth = panelW - 120;
    const colName = 0;
    const colDamage = Math.round(reportWidth * 0.42);
    const colTaken = Math.round(reportWidth * 0.62);
    const colHeal = Math.round(reportWidth * 0.80);
    const colSkill = Math.round(reportWidth * 0.94);

    const header = new Container();
    const hName = createText('英雄/职业', 18, 0xd7e6ff, '800');
    hName.position.set(colName, 0);
    const hDamage = createText('输出', 18, 0xd7e6ff, '800');
    hDamage.anchor.set(1, 0);
    hDamage.position.set(colDamage, 0);
    const hTaken = createText('承伤', 18, 0xd7e6ff, '800');
    hTaken.anchor.set(1, 0);
    hTaken.position.set(colTaken, 0);
    const hHeal = createText('治疗', 18, 0xd7e6ff, '800');
    hHeal.anchor.set(1, 0);
    hHeal.position.set(colHeal, 0);
    const hSkill = createText('技能', 18, 0xd7e6ff, '800');
    hSkill.anchor.set(1, 0);
    hSkill.position.set(colSkill, 0);
    header.addChild(hName, hDamage, hTaken, hHeal, hSkill);
    reportBox.addChild(header);

    const maxDamage = Math.max(0, ...teamStats.map((u) => u.damageDealt));
    const maxTaken = Math.max(0, ...teamStats.map((u) => u.damageTaken));
    const maxHeal = Math.max(0, ...teamStats.map((u) => u.healingDone));

    const reportRowH = 30;
    teamStats.forEach((u, idx) => {
      const heroName = u.heroId ? HERO_MAP[u.heroId]?.name ?? u.heroId : u.unitId;
      const classLabel = u.heroClass ? HERO_CLASS_LABEL[u.heroClass as keyof typeof HERO_CLASS_LABEL] ?? u.heroClass : '';
      const badges: string[] = [];
      if (maxDamage > 0 && u.damageDealt === maxDamage) badges.push('输出MVP');
      if (maxTaken > 0 && u.damageTaken === maxTaken) badges.push('承伤MVP');
      if (maxHeal > 0 && u.healingDone === maxHeal) badges.push('治疗MVP');
      const badgeText = badges.length > 0 ? ` · ${badges.join('/')}` : '';

      const nameLine = createText(`${heroName} · ${classLabel}${badgeText}`, 18, 0xffffff, '800');
      nameLine.position.set(colName, 6 + reportRowH * (idx + 1));

      const damageLine = createText(String(Math.floor(u.damageDealt)), 18, 0xffffff, '800');
      damageLine.anchor.set(1, 0);
      damageLine.position.set(colDamage, 6 + reportRowH * (idx + 1));

      const takenLine = createText(String(Math.floor(u.damageTaken)), 18, 0xffffff, '800');
      takenLine.anchor.set(1, 0);
      takenLine.position.set(colTaken, 6 + reportRowH * (idx + 1));

      const healLine = createText(String(Math.floor(u.healingDone)), 18, 0xffffff, '800');
      healLine.anchor.set(1, 0);
      healLine.position.set(colHeal, 6 + reportRowH * (idx + 1));

      const skillLine = createText(String(Math.floor(u.skillCasts)), 18, 0xffffff, '800');
      skillLine.anchor.set(1, 0);
      skillLine.position.set(colSkill, 6 + reportRowH * (idx + 1));

      reportBox.addChild(nameLine, damageLine, takenLine, healLine, skillLine);
    });
    const reportHeight = (teamStats.length + 1) * reportRowH + 10;
    const reportBottomY = reportBox.y + reportHeight;

    // Light animation: number count-up (no external deps).
    const intervals: any[] = [];
    const animateCounter = (t: any, target: number) => {
      const to = Math.max(0, Math.floor(target || 0));
      const from = 0;
      const dur = 420;
      const start = Date.now();
      const id = setInterval(() => {
        const p = Math.min(1, (Date.now() - start) / dur);
        const cur = Math.round(from + (to - from) * p);
        t.text = String(cur);
        if (p >= 1) clearInterval(id);
      }, 30);
      intervals.push(id);
    };

    if (isWin) {
      animateCounter(valGold, goldGained);
      animateCounter(valDia, diamondsGained);
      animateCounter(valShard, shardsGained);
      if (!chestText) valChest.text = '0';
    } else {
      // Loss/Draw: keep calm display.
      valGold.text = '0';
      valDia.text = '0';
      valShard.text = '0';
      if (!chestText) valChest.text = '0';
    }

    // Next stage hint (win only)
    const nextStage = isWin ? stage + 1 : stage;
    const nextBossTag = nextStage % 10 === 0 ? '【Boss】' : '';
    const nextHint = isWin ? createText(`下一关：第 ${nextStage} 关${nextBossTag}`, 22, 0xffffff, '900') : null;
    if (nextHint) {
      nextHint.anchor.set(0.5);
      nextHint.position.set(panelW / 2, Math.min(panelH - 320, reportBottomY + 18));
    }

    // Prevent double-trigger (rapid taps) creating multiple battles/modals.
    let actionTaken = false;

    const btnHome = new UIButton('返回主城', 320, 86);
    btnHome.position.set((panelW - 320) / 2, panelH - 160);
    btnHome.on('pointertap', () => {
      if (actionTaken) return;
      actionTaken = true;
      btnHome.setDisabled(true);
      btnAgain.setDisabled(true);
      modal.close();
      this.game.goTo('home', { animate: false });
    });

    const btnAgain = new UIButton(isWin ? '下一关' : '重试', 320, 86);
    btnAgain.position.set((panelW - 320) / 2, panelH - 260);
    btnAgain.on('pointertap', () => {
      if (actionTaken) return;
      actionTaken = true;
      btnHome.setDisabled(true);
      btnAgain.setDisabled(true);
      modal.close();
      this.startBattleFromState();
    });

    modal.content.addChild(title, rewardTitle, rewardBox, btnAgain, btnHome, reportTitle, reportBox);
    if (stats) modal.content.addChild(stats);
    if (nextHint) modal.content.addChild(nextHint);

    modal.onClose = () => {
      try { (intervals || []).forEach((id) => clearInterval(id)); } catch (_) {}
      modal.content.removeChildren();
    };
    modal.open();
  }
}
