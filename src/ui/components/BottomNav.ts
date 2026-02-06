import { Container, Graphics, Text } from 'pixi.js';
import { roundedRect } from '../uiFactory';
import { createText } from '../uiFactory';
import type { SceneKey } from '../../core/types';

class TabButton extends Container {
  public w: number;
  public h: number;
  private selected = false;
  private isHover = false;
  private isPressed = false;
  private readonly bg: Graphics;
  private readonly iconTxt: Text;
  private readonly labTxt: Text;

  constructor(icon: string, label: string, w = 160, h = 108) {
    super();
    this.w = w;
    this.h = h;
    this.bg = new Graphics();
    this.addChild(this.bg);

    this.iconTxt = createText(icon, 34, 0xd7e6ff, '900');
    this.iconTxt.anchor.set(0.5);
    this.iconTxt.position.set(w / 2, 38);
    this.addChild(this.iconTxt);

    this.labTxt = createText(label, 20, 0xcfe3ff, '800');
    this.labTxt.anchor.set(0.5);
    this.labTxt.position.set(w / 2, 80);
    this.addChild(this.labTxt);

    this.interactive = true;
    this.cursor = 'pointer';
    this.on('pointerdown', () => this.press(true));
    this.on('pointerup', () => this.press(false));
    this.on('pointerupoutside', () => this.press(false));
    this.on('pointerover', () => this.hover(true));
    this.on('pointerout', () => this.hover(false));

    this.draw();
  }

  public setSelected(v: boolean): void {
    this.selected = v;
    this.draw();
  }

  private hover(v: boolean): void {
    this.isHover = v;
    this.draw();
  }

  private press(v: boolean): void {
    this.isPressed = v;
    this.draw();
  }

  public draw(): void {
    const w = this.w,
      h = this.h;
    this.bg.clear();

    const base = this.selected ? 0x23458e : 0x162a56;
    const line = this.selected ? 0x9bd0ff : this.isHover ? 0x69a8ff : 0x3f6cc7;
    const glowA = this.selected ? 0.22 : this.isHover ? 0.14 : 0.08;

    this.bg.lineStyle(10, line, glowA);
    roundedRect(this.bg, 4, 6, w - 8, h - 10, 26);

    this.bg.lineStyle(3, line, 1);
    this.bg.beginFill(base, 0.98);
    roundedRect(this.bg, 0, 0, w, h, 26);
    this.bg.endFill();

    // Removed inner highlight strip for cleaner tab visuals (keeps hit area & interactions unchanged).


    this.scale.set(this.isPressed ? 0.98 : 1);
    (this.iconTxt.style as any).fill = this.selected ? 0xffffff : 0xd7e6ff;
    (this.labTxt.style as any).fill = this.selected ? 0xffffff : 0xcfe3ff;

    // Keep text centered after w changes.
    this.iconTxt.position.set(w / 2, 38);
    this.labTxt.position.set(w / 2, 80);
  }
}

export default class BottomNav extends Container {
  private readonly bg: Graphics;
  private readonly tabRow: Container;
  private readonly tabs: Array<{
    key: SceneKey;
    btn: TabButton;
  }>;

  constructor() {
    super();
    this.bg = new Graphics();
    this.addChild(this.bg);

    const tabDefs: Array<{ key: SceneKey; icon: string; label: string }> = [
      { key: 'home', icon: '🏠', label: '主城' },
      { key: 'summon', icon: '🎴', label: '抽卡' },
      { key: 'heroes', icon: '🦸', label: '英雄' },
      { key: 'bag', icon: '🎒', label: '背包' },
    ];

    this.tabs = tabDefs.map((t) => ({ ...t, btn: new TabButton(t.icon, t.label) }));

    this.tabRow = new Container();
    this.addChild(this.tabRow);
    for (const t of this.tabs) this.tabRow.addChild(t.btn);
  }

  public bind(onSelect: (key: SceneKey) => void): void {
    for (const t of this.tabs) {
      t.btn.on('pointertap', () => onSelect(t.key));
    }
  }

  public setActive(key: SceneKey): void {
    for (const t of this.tabs) t.btn.setSelected(t.key === key);
  }

  public resize(w: number, h: number): void {
    this.layout(w, h);
  }

  private layout(w: number, h: number): void {
    const barH = 150;
    const y = h - barH - 10;
    this.position.set(0, y);

    this.bg.clear();
    this.bg.beginFill(0x071129, 0.7);
    this.bg.lineStyle(2, 0x2f57a8, 0.85);
    roundedRect(this.bg, 20, 0, w - 40, barH, 36);
    this.bg.endFill();

    this.bg.lineStyle(4, 0x69a8ff, 0.2);
    this.bg.moveTo(48, 18);
    this.bg.lineTo(w - 48, 18);

    const padX = 48;
    const gap = 16;
    const totalW = w - padX * 2;
    const btnW = Math.floor((totalW - gap * 3) / 4);
    const btnH = 108;

    this.tabRow.position.set(padX, 28);

    for (let i = 0; i < this.tabs.length; i++) {
      const b = this.tabs[i].btn;
      b.w = btnW;
      b.h = btnH;
      b.draw();
      b.position.set(i * (btnW + gap), 0);
    }
  }
}