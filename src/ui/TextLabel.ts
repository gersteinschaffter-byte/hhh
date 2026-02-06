import { Text, TextStyle } from "pixi.js";

export class TextLabel extends Text {
  constructor(text: string, fontSize = 18, color = 0xffffff) {
    const style = new TextStyle({
      fill: color,
      fontSize,
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontWeight: "500"
    });
    super({ text, style });
  }
}
