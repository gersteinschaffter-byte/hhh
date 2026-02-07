import { Application } from "pixi.js";
import { GameState } from "./core/GameState";
import { SceneManager } from "./core/SceneManager";
import { UIManager } from "./core/UIManager";
import { loadGameState, saveGameState } from "./game/storage";
import { ResourceBar } from "./ui/ResourceBar";

const app = new Application();
await app.init({
  resizeTo: window,
  autoDensity: true,
  resolution: window.devicePixelRatio || 1,
  backgroundColor: 0x0b0f1a,
  antialias: true
});

const root = document.getElementById("app");
if (!root) {
  throw new Error("Root element not found");
}
root.appendChild(app.canvas);

const uiManager = new UIManager();
app.stage.addChild(uiManager.root);

const gameState = GameState.init(loadGameState());
const sceneManager = new SceneManager(uiManager, gameState);

const resourceBar = new ResourceBar(gameState);
uiManager.uiLayer.addChild(resourceBar.container);

const resize = () => {
  const { innerWidth, innerHeight } = window;
  resourceBar.resize(innerWidth);
  sceneManager.resize(innerWidth, innerHeight);
};

window.addEventListener("resize", resize);
sceneManager.changeScene("Home");
resize();

const unsubscribe = gameState.onChange((state) => {
  resourceBar.update(state);
  saveGameState(state);
});

window.addEventListener("beforeunload", () => {
  unsubscribe();
});
