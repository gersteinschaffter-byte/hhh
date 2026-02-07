import { Container } from "pixi.js";
import { PlaceholderScene } from "../scenes/PlaceholderScene";
import { HomeScene } from "../scenes/HomeScene";
import type { GameState } from "./GameState";
import type { Scene } from "./Scene";
import type { UIManager } from "./UIManager";

export type SceneName = "Home" | "Summon" | "Heroes" | "Battle" | "Bag";

export class SceneManager {
  private currentScene: Scene | null = null;

  constructor(private uiManager: UIManager, private gameState: GameState) {}

  changeScene(name: SceneName) {
    if (this.currentScene) {
      this.uiManager.sceneLayer.removeChild(this.currentScene.container);
      this.currentScene.destroyScene();
      this.currentScene = null;
    }

    let nextScene: Scene;
    if (name === "Home") {
      nextScene = new HomeScene(this.gameState, this);
    } else {
      nextScene = new PlaceholderScene(name, this);
    }

    this.currentScene = nextScene;
    this.uiManager.sceneLayer.addChild(nextScene.container);
    this.currentScene.resize(window.innerWidth, window.innerHeight);
  }

  resize(width: number, height: number) {
    this.currentScene?.resize(width, height);
  }
}
