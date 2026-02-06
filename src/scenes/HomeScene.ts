import { Container, Graphics } from 'pixi.js';
import type GameApp from '../core/GameApp';
import BaseScene from './BaseScene';
import UIButton from '../ui/components/UIButton';
import { createText, roundedRect } from '../ui/uiFactory';

export default class HomeScene extends BaseScene {
  private readonly game: GameApp;
  private readonly title;
  private readonly sub;
  private readonly stageText;
  private readonly btnSummon;
  private readonly btnHeroes;
  private readonly btnBag;
  private readonly btnBattle;
  private readonly tip;
  private readonly tutorialBanner: Container;
  private readonly tutorialBg: Graphics;
  private readonly tutorialText;
  private readonly tutorialClose: UIButton;
  private tutorialTarget: 'summon' | 'heroes' | 'battle' | 'bag' | null = null;

  private unlistenStage?: () => void;
  private unlistenTutorials: Array<() => void> = [];

  constructor(game: GameApp) {
    super('home');
    this.game = game;

    this.title = createText('主城', 48, 0xffffff, '900');
    this.title.anchor.set(0.5);
    this.root.addChild(this.title);

    this.sub = createText('MVP：抽卡 · 英雄 · 背包', 22, 0xcfe3ff, '700');
    this.sub.anchor.set(0.5);
    this.root.addChild(this.sub);

    this.stageText = createText('当前关卡：第 1 关', 24, 0xe6f2ff, '800');
    this.stageText.anchor.set(0.5);
    this.root.addChild(this.stageText);

    this.btnSummon = new UIButton('进入抽卡', 420, 92);
    this.btnHeroes = new UIButton('英雄', 420, 92);
    this.btnBag = new UIButton('背包', 420, 92);
    this.btnBattle = new UIButton('挑战第 1 关', 420, 92);

    this.btnSummon.on('pointertap', () => this.game.goTo('summon', { animate: false }));
    this.btnHeroes.on('pointertap', () => this.game.goTo('heroes', { animate: false }));
    this.btnBag.on('pointertap', () => this.game.goTo('bag', { animate: false }));
    this.btnBattle.on('pointertap', () => {
      const partyCount = (this.game.state.partyHeroIds ?? []).length;
      if (partyCount <= 0) {
        this.game.toast.show('队伍为空：请去【英雄】页，点英雄卡牌→上阵至少1名英雄', 2);
        return;
      }
      try { this.game.modal.close(); } catch (_) {}
      this.game.goTo('battle', { animate: false });
    });

    this.root.addChild(this.btnSummon, this.btnHeroes, this.btnBag, this.btnBattle);

    this.tip = createText('提示：右上角 ⚙ 可重置存档', 20, 0xd0e2ff, '700');
    this.tip.anchor.set(0.5);
    this.root.addChild(this.tip);

    this.tutorialBanner = new Container();
    this.tutorialBg = new Graphics();
    this.tutorialBanner.addChild(this.tutorialBg);
    this.tutorialText = createText('新手目标', 22, 0xffffff, '800');
    this.tutorialText.anchor.set(0, 0.5);
    this.tutorialBanner.addChild(this.tutorialText);
    this.tutorialClose = new UIButton('关闭', 90, 46);
    this.tutorialClose.txt.style.fontSize = 18;
    this.tutorialClose.position.set(0, 0);
    this.tutorialBanner.addChild(this.tutorialClose);
    this.tutorialBanner.interactive = true;
    this.tutorialBanner.cursor = 'pointer';
    this.tutorialBanner.on('pointertap', () => {
      if (!this.tutorialTarget) return;
      this.game.goTo(this.tutorialTarget, { animate: false });
    });
    this.tutorialClose.on('pointertap', (e) => {
      try { (e as any)?.stopPropagation?.(); } catch (_) {}
      const flags = { ...(this.game.state.flags ?? {}), tutorialBannerDismissed: true };
      this.game.state.update({ flags });
      this.updateTutorialBanner();
    });
    this.root.addChild(this.tutorialBanner);
  }

    private formatStage(stage: number): { stageText: string; btnText: string } {
    const s = Math.max(1, Math.floor(stage || 1));
    const isBoss = s % 10 === 0;
    const bossTag = isBoss ? '【Boss】' : '';
    return {
      stageText: `当前关卡：第 ${s} 关${bossTag}`,
      btnText: `挑战第 ${s} 关${bossTag}`,
    };
  }

  private applySingleLineEllipsis(t: any, maxW: number): void {
    if (!t) return;
    // Pixi Text width updates after setting text; simple loop is enough (strings are short).
    if (t.width <= maxW) return;
    const raw = String(t.text ?? '');
    let s = raw;
    while (s.length > 0 && t.width > maxW) {
      s = s.slice(0, -1);
      t.text = s + '…';
    }
  }

  private updateStageUI(): void {
    const stage = (this.game.state as any).stage ?? (this.game.state.state?.stage ?? 1);
    const f = this.formatStage(stage);
    this.stageText.text = f.stageText;
    this.btnBattle.setLabel(f.btnText);
  }

  public override onEnter(): void {
    this.updateStageUI();
    this.updateTutorialBanner();
    this.unlistenStage?.();
    this.unlistenStage = this.game.state.on('stageChanged', () => this.updateStageUI());
    this.unlistenTutorials.forEach((u) => {
      try { u(); } catch (_) {}
    });
    this.unlistenTutorials = [
      this.game.state.on('heroesChanged', () => this.updateTutorialBanner()),
      this.game.state.on('partyChanged', () => this.updateTutorialBanner()),
      this.game.state.on('inventoryChanged', () => this.updateTutorialBanner()),
      this.game.state.on('stageChanged', () => this.updateTutorialBanner()),
    ];
  }

  public override onExit(): void {
    this.unlistenStage?.();
    this.unlistenStage = undefined;
    this.unlistenTutorials.forEach((u) => {
      try { u(); } catch (_) {}
    });
    this.unlistenTutorials = [];
  }

public override onResize(w: number, h: number): void {
    if (!this.title || (this.title as any).destroyed) return;
    this.title.position.set(w / 2, 210);
    this.sub.position.set(w / 2, 270);

    this.stageText.position.set(w / 2, 338);
    (this.stageText.style as any).wordWrap = false;
    (this.stageText.style as any).wordWrapWidth = w - 80;
    this.applySingleLineEllipsis(this.stageText, Math.max(120, w - 80));

    const y0 = 420;
    this.btnSummon.position.set((w - 420) / 2, y0);
    this.btnHeroes.position.set((w - 420) / 2, y0 + 120);
    this.btnBag.position.set((w - 420) / 2, y0 + 240);
    this.btnBattle.position.set((w - 420) / 2, y0 + 360);

    this.tip.position.set(w / 2, h - 110);

    const bannerW = Math.min(640, w - 80);
    const bannerH = 64;
    this.tutorialBg.clear();
    this.tutorialBg.beginFill(0x0b1630, 0.92);
    this.tutorialBg.lineStyle(2, 0x3c5aa6, 0.9);
    roundedRect(this.tutorialBg, 0, 0, bannerW, bannerH, 16);
    this.tutorialBg.endFill();
    this.tutorialBanner.position.set((w - bannerW) / 2, 120);
    this.tutorialText.position.set(18, bannerH / 2 + 1);
    this.tutorialClose.position.set(bannerW - 90 - 12, (bannerH - 46) / 2);
  }

  private updateTutorialBanner(): void {
    const flags = this.game.state.flags ?? {};
    if (flags.tutorialBannerDismissed) {
      this.tutorialBanner.visible = false;
      this.tutorialTarget = null;
      return;
    }

    const snap = this.game.state.getSnapshot();
    const heroCount = snap.heroes?.length ?? 0;
    const partyCount = snap.partyHeroIds?.length ?? 0;
    const stage = Math.max(1, Math.floor(snap.stage || 1));
    const hasChest = ['chest_c', 'chest_b', 'chest_a', 'chest_s'].some((key) => (snap.inventory?.[key] || 0) > 0);

    let text = '';
    let target: typeof this.tutorialTarget = null;

    if (heroCount <= 0) {
      text = '新手目标：去抽卡获得英雄';
      target = 'summon';
    } else if (partyCount <= 0) {
      text = '新手目标：去英雄上阵';
      target = 'heroes';
    } else if (stage > 1 && hasChest) {
      text = '新手目标：去背包开箱';
      target = 'bag';
    } else {
      text = '新手目标：去挑战关卡';
      target = 'battle';
    }

    this.tutorialText.text = text;
    this.tutorialBanner.visible = true;
    this.tutorialTarget = target;
  }
}
