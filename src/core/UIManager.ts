import { Container } from "pixi.js";

export class UIManager {
  readonly root: Container;
  readonly backgroundLayer: Container;
  readonly sceneLayer: Container;
  readonly uiLayer: Container;
  readonly popupLayer: Container;
  readonly toastLayer: Container;

  constructor() {
    this.root = new Container();
    this.backgroundLayer = new Container();
    this.sceneLayer = new Container();
    this.uiLayer = new Container();
    this.popupLayer = new Container();
    this.toastLayer = new Container();

    this.root.addChild(
      this.backgroundLayer,
      this.sceneLayer,
      this.uiLayer,
      this.popupLayer,
      this.toastLayer
    );
  }
}
