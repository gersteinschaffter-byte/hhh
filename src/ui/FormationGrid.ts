import { Container, Graphics, Text } from 'pixi.js';
import { Theme } from '../utils/theme';
import { LayoutBounds } from '../utils/layout';

export class FormationGrid extends Container {
  private slots: { frame: Graphics; label: Text }[] = [];

  constructor(slotCount = 6) {
    super();

    for (let i = 0; i < slotCount; i += 1) {
      const frame = new Graphics();
      const label = new Text(`卡槽 ${i + 1}`, {
        fontSize: 14,
        fill: Theme.colors.textSecondary,
      });

      const slotContainer = new Container();
      slotContainer.addChild(frame, label);
      this.addChild(slotContainer);
      this.slots.push({ frame, label });
    }
  }

  updateLayout(bounds: LayoutBounds) {
    const { width, height, padding, topBarHeight, bottomBarHeight } = bounds;
    const availableHeight = height - topBarHeight - bottomBarHeight - padding * 4;

    const columns = 3;
    const rows = 2;
    const slotGap = 20;
    const slotWidth = Math.min(180, (width - padding * 2 - slotGap * (columns - 1)) / columns);
    const slotHeight = Math.min(140, (availableHeight - slotGap * (rows - 1)) / rows);

    const gridWidth = slotWidth * columns + slotGap * (columns - 1);
    const gridHeight = slotHeight * rows + slotGap * (rows - 1);

    const startX = (width - gridWidth) / 2;
    const startY = topBarHeight + padding * 2 + (availableHeight - gridHeight) / 2;

    this.slots.forEach((slot, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + column * (slotWidth + slotGap);
      const y = startY + row * (slotHeight + slotGap);

      slot.frame.clear();
      slot.frame.lineStyle(2, Theme.colors.panelLight).beginFill(Theme.colors.panel, 0.9);
      slot.frame.drawRoundedRect(x, y, slotWidth, slotHeight, 16).endFill();

      slot.label.position.set(x + 16, y + 16);
    });
  }
}
