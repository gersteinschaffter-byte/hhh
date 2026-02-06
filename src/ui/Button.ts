import { Container, Graphics, Text, TextStyle } from "pixi.js";

export class Button extends Container {
  private background: Graphics;
  private label: Text;

  constructor(text: string, width = 200, height = 56) {
    super();
    this.background = new Graphics();
    this.label = new Text({
      text,
      style: new TextStyle({
        fill: 0xffffff,
        fontSize: 20,
        fontFamily: "Segoe UI, Arial, sans-serif",
        fontWeight: "600"
      })
    });

    this.drawBackground(width, height, 0x3b6dff);
    this.label.anchor.set(0.5);
    this.label.position.set(width / 2, height / 2);

    this.addChild(this.background, this.label);

    this.eventMode = "static";
    this.cursor = "pointer";

    this.on("pointerover", () => this.drawBackground(width, height, 0x4f7dff));
    this.on("pointerout", () => this.drawBackground(width, height, 0x3b6dff));
  }

  private drawBackground(width: number, height: number, color: number) {
    this.background.clear();
    this.background.roundRect(0, 0, width, height, 12).fill({ color });
  }

  setText(text: string) {
    this.label.text = text;
  }
}
