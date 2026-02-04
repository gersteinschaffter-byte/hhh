import { Container, Graphics, Text } from 'pixi.js';
import { Theme } from '../utils/theme';
import { LayoutBounds } from '../utils/layout';

type ResourceItem = {
  label: string;
  value: number;
  color: number;
};

export class ResourceBar extends Container {
  private background: Graphics;
  private items: { container: Container; label: Text; value: Text; icon: Graphics }[] = [];

  constructor(resources: ResourceItem[]) {
    super();

    this.background = new Graphics();
    this.addChild(this.background);

    resources.forEach((resource) => {
      const itemContainer = new Container();

      const icon = new Graphics();
      icon.beginFill(resource.color).drawRoundedRect(0, 0, 28, 28, 8).endFill();

      const label = new Text(resource.label, {
        fontSize: 14,
        fill: Theme.colors.textSecondary,
      });

      const value = new Text(resource.value.toString(), {
        fontSize: 18,
        fill: Theme.colors.textPrimary,
        fontWeight: '600',
      });

      label.position.set(36, 0);
      value.position.set(36, 16);

      itemContainer.addChild(icon, label, value);
      this.addChild(itemContainer);
      this.items.push({ container: itemContainer, label, value, icon });
    });
  }

  updateLayout(bounds: LayoutBounds) {
    const { width, padding, topBarHeight } = bounds;

    this.background.clear();
    this.background.beginFill(Theme.colors.panel).drawRoundedRect(0, 0, width - padding * 2, topBarHeight, 16).endFill();
    this.position.set(padding, padding);

    const gap = 24;
    let xCursor = padding;

    this.items.forEach((item) => {
      item.container.position.set(xCursor, (topBarHeight - 32) / 2);
      xCursor += 140 + gap;
    });
  }
}
