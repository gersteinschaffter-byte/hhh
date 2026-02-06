import { Container, Graphics, Text } from 'pixi.js';
import UIButton from './UIButton';
import { createText, formatNumber } from '../uiFactory';
import { openConfirm } from './openConfirm';
import type GameApp from '../../core/GameApp';

/**
 * Global top bar.
 *
 * Phase 1: keeps MVP look & feel.
 * - Shows diamonds & gold
 * - Global reset (⚙)
 * - Global back button (shown on non-home scenes)
 */
export default class TopBar extends Container {
  private readonly game: GameApp;
  private readonly bg: Graphics;
  private readonly diamondTxt: Text;
  private readonly goldTxt: Text;
  private readonly resetBtn: UIButton;
  private readonly backBtn: UIButton;

  constructor(game: GameApp) {
    super();
    this.game = game;

    this.bg = new Graphics();
    this.addChild(this.bg);

    this.diamondTxt = createText('', 26, 0xd8f2ff, '800');
    this.goldTxt = createText('', 26, 0xffe3a3, '800');
    this.diamondTxt.anchor.set(0, 0.5);
    this.goldTxt.anchor.set(0, 0.5);
    this.addChild(this.diamondTxt, this.goldTxt);

    this.resetBtn = new UIButton('⚙', 72, 56);
    this.resetBtn.txt.style.fontSize = 28;
    this.resetBtn.txt.position.set(36, 28);
    this.resetBtn.on('pointertap', () => {
      // Use a unified confirm helper to keep confirm UX consistent and avoid repeated wiring.
      openConfirm(this.game, {
        message: '确认重置存档？\n（清空英雄、资源）',
        onConfirm: () => this.game.hardReset(),
      });
    });
    this.addChild(this.resetBtn);

    this.backBtn = new UIButton('← 返回', 180, 60);
    this.backBtn.txt.style.fontSize = 28;
    this.backBtn.on('pointertap', () => this.game.goTo('home', { animate: false }));
    this.backBtn.visible = false;
    this.addChild(this.backBtn);

    // Data-driven: subscribe to state changes.
    this.game.state.on('currencyChanged', (p) => {
      this.diamondTxt.text = '💎 ' + formatNumber(p.diamonds);
      this.goldTxt.text = '🪙 ' + formatNumber(p.gold);
    });

    // Initial render
    const s = this.game.state.getSnapshot();
    this.diamondTxt.text = '💎 ' + formatNumber(s.diamonds);
    this.goldTxt.text = '🪙 ' + formatNumber(s.gold);
  }

  public setBackVisible(visible: boolean): void {
    this.backBtn.visible = visible;
  }

  public resize(w: number, _h: number): void {
    this.bg.clear();
    this.bg.beginFill(0x070b16, 0.45);
    this.bg.drawRect(0, 0, w, 92);
    this.bg.endFill();

    // When the global back button is visible, shift currency displays to the right
    // to avoid overlapping.
    const leftX = this.backBtn.visible ? 220 : 20;
    this.diamondTxt.position.set(leftX, 46);
    this.goldTxt.position.set(leftX + 220, 46);
    this.resetBtn.position.set(w - 84, 18);
    this.backBtn.position.set(16, 16);
  }

  // Phase 2: refresh() is no longer needed (kept removed to avoid manual calls).
}
