import { Container, Graphics, Text } from 'pixi.js';
import { createText, roundedRect } from '../uiFactory';

/**
 * Simple button used by the MVP UI.
 *
 * Phase 1 keeps the visual style close to the original JS MVP.
 * Later phases will move towards a more componentized UI kit.
 */
export default class UIButton extends Container {
  public readonly w: number;
  public readonly h: number;
  public readonly bg: Graphics;
  public readonly txt: Text;
  private _hover = false;
  private _pressed = false;
  private _disabled = false;

  constructor(label: string, w = 260, h = 86) {
    super();
    this.w = w;
    this.h = h;

    this.bg = new Graphics();
    this.addChild(this.bg);

    this.txt = createText(label, 30, 0xffffff, '800');
    this.txt.anchor.set(0.5);
    this.txt.position.set(w / 2, h / 2);
    this.addChild(this.txt);

    this.interactive = true;
    this.cursor = 'pointer';
    this.on('pointerdown', () => this.setPressed(true));
    this.on('pointerup', () => this.setPressed(false));
    this.on('pointerupoutside', () => this.setPressed(false));
    this.on('pointerover', () => this.setHover(true));
    this.on('pointerout', () => this.setHover(false));

    this.draw();
  }

  public setLabel(label: string): void {
    this.txt.text = label;
  }

  public setDisabled(disabled: boolean): void {
    const next = !!disabled;
    if (this._disabled === next) return;
    this._disabled = next;

    this.interactive = !next;
    this.cursor = next ? 'default' : 'pointer';
    if (next) {
      this._hover = false;
      this._pressed = false;
      this.alpha = 0.55;
    } else {
      this.alpha = 1;
    }
    this.draw();
  }

  private setHover(v: boolean): void {
    if (this._disabled) return;
    this._hover = v;
    this.draw();
  }

  private setPressed(v: boolean): void {
    if (this._disabled) return;
    this._pressed = v;
    this.draw();
  }

  private draw(): void {
    const w = this.w,
      h = this.h;
    this.bg.clear();
    const base = this._disabled ? 0x1a2f63 : this._pressed ? 0x1b2e5a : this._hover ? 0x223a72 : 0x1a2f63;
    const line = this._disabled ? 0x3f6cc7 : this._hover ? 0x69a8ff : 0x3f6cc7;

    this.bg.beginFill(base, 0.98);
    this.bg.lineStyle(3, line, 1);
    roundedRect(this.bg, 0, 0, w, h, 22);
    this.bg.endFill();

    // Removed inner highlight strip for cleaner button visuals (keeps hit area & interactions unchanged).

  }
}