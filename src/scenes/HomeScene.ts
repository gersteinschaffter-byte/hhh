import { Container, Graphics } from "pixi.js";
import { Button } from "../ui/Button";
import { TextLabel } from "../ui/TextLabel";
import type { GameState } from "../core/GameState";
import type { SceneManager } from "../core/SceneManager";

export class HomeScene {
  readonly container: Container;
  private background: Graphics;
  private title: TextLabel;
  private buttons: Button[];

  constructor(private gameState: GameState, private sceneManager: SceneManager) {
    this.container = new Container();
    this.background = new Graphics();
    this.title = new TextLabel("Idle Card RPG", 32, 0xffffff);

    this.buttons = [
      new Button("Summon", 220, 60),
      new Button("Heroes", 220, 60),
      new Button("Battle", 220, 60),
      new Button("Bag", 220, 60)
    ];

    this.buttons[0].on("pointertap", () => this.sceneManager.changeScene("Summon"));
    this.buttons[1].on("pointertap", () => this.sceneManager.changeScene("Heroes"));
    this.buttons[2].on("pointertap", () => this.sceneManager.changeScene("Battle"));
    this.buttons[3].on("pointertap", () => this.sceneManager.changeScene("Bag"));

    this.container.addChild(this.background, this.title, ...this.buttons);
  }

  resize(width: number, height: number) {
    this.background.clear();
    this.background.rect(0, 0, width, height).fill({ color: 0x0f172a });

    this.title.position.set(width / 2 - this.title.width / 2, height * 0.2);

    const startY = height * 0.35;
    const gap = 18;
    this.buttons.forEach((button, index) => {
      button.position.set(width / 2 - button.width / 2, startY + index * (button.height + gap));
    });
  }

  destroyScene() {
    this.container.removeChildren();
    this.container.destroy({ children: true });
  }
}
