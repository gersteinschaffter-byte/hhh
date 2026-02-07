import type { Container } from "pixi.js";

export interface Scene {
  container: Container;
  destroyScene(): void;
  resize(width: number, height: number): void;
}
