import { Container, Graphics } from "pixi.js";
import type { GameState } from "../core/GameState";
import { TextLabel } from "./TextLabel";

export class ResourceBar {
  readonly container: Container;
  private background: Graphics;
  private goldLabel: TextLabel;
  private gemsLabel: TextLabel;
  private ticketsLabel: TextLabel;
  private stageLabel: TextLabel;

  constructor(private state: GameState) {
    this.container = new Container();
    this.background = new Graphics();
    this.goldLabel = new TextLabel("Gold: 0", 16, 0xffe082);
    this.gemsLabel = new TextLabel("Gems: 0", 16, 0x7dd3fc);
    this.ticketsLabel = new TextLabel("Tickets: 0", 16, 0xa7f3d0);
    this.stageLabel = new TextLabel("Stage: 0", 16, 0xfacc15);

    this.container.addChild(
      this.background,
      this.goldLabel,
      this.gemsLabel,
      this.ticketsLabel,
      this.stageLabel
    );
  }

  update(snapshot = this.state.snapshot) {
    this.goldLabel.text = `Gold: ${snapshot.gold}`;
    this.gemsLabel.text = `Gems: ${snapshot.gems}`;
    this.ticketsLabel.text = `Tickets: ${snapshot.tickets}`;
    this.stageLabel.text = `Stage: ${snapshot.stage}`;
  }

  resize(width: number) {
    const barHeight = 44;
    this.background.clear();
    this.background.rect(0, 0, width, barHeight).fill({ color: 0x111827, alpha: 0.9 });

    const padding = 16;
    const gap = 24;
    let x = padding;
    this.goldLabel.position.set(x, 12);
    x += this.goldLabel.width + gap;
    this.gemsLabel.position.set(x, 12);
    x += this.gemsLabel.width + gap;
    this.ticketsLabel.position.set(x, 12);
    x += this.ticketsLabel.width + gap;
    this.stageLabel.position.set(x, 12);
  }
}
