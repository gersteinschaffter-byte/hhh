import { Container, Graphics, Text } from 'pixi.js';
import { Theme } from '../utils/theme';
import { LayoutBounds } from '../utils/layout';

const BUTTONS = ['关卡', '英雄', '背包', '召唤', '挂机收益'];

export class BottomMenu extends Container {
  private background: Graphics;
  private buttons: { container: Container; label: Text; frame: Graphics }[] = [];

  constructor() {
    super();

    this.background = new Graphics();
    this.addChild(this.background);

    BUTTONS.forEach((text) => {
      const container = new Container();
      const frame = new Graphics();
      const label = new Text(text, {
        fontSize: 16,
        fill: Theme.colors.textPrimary,
        fontWeight: '600',
      });

      container.addChild(frame, label);
      this.addChild(container);
      this.buttons.push({ container, label, frame });
    });
  }

  updateLayout(bounds: LayoutBounds) {
    const { width, height, padding, bottomBarHeight } = bounds;

    this.background.clear();
    this.background.beginFill(Theme.colors.panel).drawRoundedRect(0, 0, width - padding * 2, bottomBarHeight, 20).endFill();
    this.position.set(padding, height - bottomBarHeight - padding);

    const buttonWidth = (width - padding * 2 - 32 - 16 * (this.buttons.length - 1)) / this.buttons.length;
    const buttonHeight = Math.min(56, bottomBarHeight - 32);

    this.buttons.forEach((button, index) => {
      const x = 16 + index * (buttonWidth + 16);
      const y = (bottomBarHeight - buttonHeight) / 2;

      button.frame.clear();
      button.frame.beginFill(Theme.colors.panelLight).drawRoundedRect(0, 0, buttonWidth, buttonHeight, 16).endFill();
      button.frame.lineStyle(2, Theme.colors.accent, 0.4).drawRoundedRect(0, 0, buttonWidth, buttonHeight, 16);

      button.container.position.set(x, y);
      button.label.anchor.set(0.5);
      button.label.position.set(buttonWidth / 2, buttonHeight / 2);
    });
  }
}
