import { Application } from 'pixi.js';
import { MainScene } from './scenes/MainScene';

const app = new Application({
  resizeTo: window,
  antialias: true,
  backgroundAlpha: 0,
});

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app element');
}

root.appendChild(app.view as HTMLCanvasElement);

const scene = new MainScene(window.innerWidth, window.innerHeight);
app.stage.addChild(scene);

const handleResize = () => {
  scene.resize(app.renderer.width, app.renderer.height);
};

window.addEventListener('resize', handleResize);
handleResize();
