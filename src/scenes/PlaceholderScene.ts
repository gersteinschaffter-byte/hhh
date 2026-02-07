import { Container, Graphics } from "pixi.js";
import { Button } from "../ui/Button";
import { TextLabel } from "../ui/TextLabel";
import type { Scene } from "../core/Scene";
import type { SceneManager, SceneName } from "../core/SceneManager";

export class PlaceholderScene implements Scene {
  readonly container: Container;
  private background: Graphics;
  private title: TextLabel;
  private description: TextLabel;
  private backButton: Button;

  constructor(private name: SceneName, private sceneManager: SceneManager) {
    this.container = new Container();
    this.background = new Graphics();
    this.title = new TextLabel(`${name} Scene`, 30, 0xffffff);
    this.description = new TextLabel("Coming Soon", 20, 0x9ca3af);
    this.backButton = new Button("Back", 180, 56);

    this.backButton.on("pointertap", () => this.sceneManager.changeScene("Home"));

    this.container.addChild(
      this.background,
      this.title,
      this.description,
      this.backButton
    );
  }

  resize(width: number, height: number) {
    this.background.clear();
    this.background.rect(0, 0, width, height).fill({ color: 0x111827 });

    this.title.position.set(width / 2 - this.title.width / 2, height * 0.25);
    this.description.position.set(
      width / 2 - this.description.width / 2,
      height * 0.35
    );
    this.backButton.position.set(width / 2 - this.backButton.width / 2, height * 0.55);
  }

  destroyScene() {
    this.container.removeChildren();
    this.container.destroy({ children: true });
  }
}
