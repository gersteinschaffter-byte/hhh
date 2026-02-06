import { Application, Container, Graphics } from "pixi.js";
import { GameState } from "./core/GameState";
import { SceneManager } from "./core/SceneManager";
import { UIManager } from "./core/UIManager";
import { loadGameState, saveGameState } from "./game/storage";
import { TextLabel } from "./ui/TextLabel";

const app = new Application();
await app.init({
  resizeTo: window,
  autoDensity: true,
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

const resourceBar = createResourceBar(gameState);
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

function createResourceBar(state: GameState) {
  const container = new Container();
  const background = new Graphics();
  const goldLabel = new TextLabel("Gold: 0", 16, 0xffe082);
  const gemsLabel = new TextLabel("Gems: 0", 16, 0x7dd3fc);
  const ticketsLabel = new TextLabel("Tickets: 0", 16, 0xa7f3d0);
  const stageLabel = new TextLabel("Stage: 0", 16, 0xfacc15);

  container.addChild(background, goldLabel, gemsLabel, ticketsLabel, stageLabel);

  const update = (snapshot = state.snapshot) => {
    goldLabel.text = `Gold: ${snapshot.gold}`;
    gemsLabel.text = `Gems: ${snapshot.gems}`;
    ticketsLabel.text = `Tickets: ${snapshot.tickets}`;
    stageLabel.text = `Stage: ${snapshot.stage}`;
  };

  const resize = (width: number) => {
    const barHeight = 44;
    background.clear();
    background.rect(0, 0, width, barHeight).fill({ color: 0x111827, alpha: 0.9 });

    const padding = 16;
    const gap = 24;
    let x = padding;
    goldLabel.position.set(x, 12);
    x += goldLabel.width + gap;
    gemsLabel.position.set(x, 12);
    x += gemsLabel.width + gap;
    ticketsLabel.position.set(x, 12);
    x += ticketsLabel.width + gap;
    stageLabel.position.set(x, 12);
  };

  return { container, update, resize };
}
