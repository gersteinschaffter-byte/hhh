import { Container, Text } from 'pixi.js';
import { createText } from '../ui/uiFactory';
import { Tween, TweenRunner, easeOutCubic } from './Tween';

/**
 * FloatingText
 * A reusable effect for damage numbers, heals, rewards, etc.
 */
export function spawnFloatingText(
  parent: Container,
  text: string,
  x: number,
  y: number,
  runner: TweenRunner,
  opts?: { fontSize?: number; color?: number; rise?: number; life?: number },
): Text {
  const fontSize = opts?.fontSize ?? 26;
  const color = opts?.color ?? 0xffffff;
  const rise = opts?.rise ?? 42;
  const life = opts?.life ?? 26;

  const t = createText(text, fontSize, color, '900');
  t.anchor.set(0.5);
  t.position.set(x, y);
  parent.addChild(t);

  runner.add(Tween.to(t, { y: y - rise, alpha: 0 }, life, easeOutCubic, () => t.destroy()));
  return t;
}