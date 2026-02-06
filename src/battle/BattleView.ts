import { Container, Graphics, Point, Text } from 'pixi.js';
import type { BattleEvent, FighterSnapshot, Side } from './BattleTypes';
import { createText, roundedRect } from '../ui/uiFactory';
import { Tween, TweenRunner, easeOutCubic } from '../fx/Tween';
import { spawnFloatingText } from '../fx/FloatingText';

/**
 * BattleView
 *
 * PixiJS rendering layer.
 * - Only consumes battle events
 * - Does NOT do any numeric simulation
 */
export default class BattleView {
  public readonly root: Container;

  private readonly fighterNodes: Map<string, FighterNode> = new Map();
  private readonly fxLayer: Container;
  private readonly uiLayer: Container;
  private readonly roundLabel: Text;
  private readonly resultLabel: Text;

  // Shared fx/tween runner (reused across battle effects)
  private readonly tweenRunner = new TweenRunner();

  // Reused single attack line to prevent "white line pile-up"
  private attackLine?: Graphics;

  constructor() {
    this.root = new Container();

    const arena = new Graphics();
    arena.beginFill(0x0b1533, 0.65);
    roundedRect(arena, 0, 0, 720, 900, 38);
    arena.endFill();
    arena.lineStyle(3, 0x5fa6ff, 0.35);
    roundedRect(arena, 6, 6, 708, 888, 34);
    this.root.addChild(arena);

    this.fxLayer = new Container();
    this.uiLayer = new Container();
    this.root.addChild(this.fxLayer, this.uiLayer);

    this.roundLabel = createText('回合 0', 22, 0xd7e6ff, '900');
    this.roundLabel.position.set(30, 22);
    this.uiLayer.addChild(this.roundLabel);

    this.resultLabel = createText('', 36, 0xffffff, '900');
    this.resultLabel.anchor.set(0.5);
    this.resultLabel.position.set(360, 450);
    this.resultLabel.visible = false;
    this.uiLayer.addChild(this.resultLabel);
  }

  /** Clear view and build fighters from setup. */
  public build(teamA: FighterSnapshot[], teamB: FighterSnapshot[]): void {
    // Remove old nodes
    for (const n of this.fighterNodes.values()) n.destroy();
    this.fighterNodes.clear();
    this.fxLayer.removeChildren();
    this.attackLine = undefined;

    // Create the single reusable attack line
    const line = new Graphics();
    line.alpha = 0;
    this.fxLayer.addChild(line);
    this.attackLine = line;

    // Positions (virtual arena 720x900)
    const arenaW = 720;
    const arenaH = 900;
    const centerX = arenaW / 2;

    // --- W formation for player (A): frontline 2 (slots 0-1), backline 3 (slots 2-4) ---
    // Use relative layout so scaling/resizing won't break.
    const yFrontA = Math.round(arenaH * 0.60);
    const yBackA = Math.round(arenaH * 0.74);
    const xFrontNarrow = Math.round(arenaW * 0.12);
    const xBackWide = Math.round(arenaW * 0.26);

    const slotsA = [
      { x: centerX - xFrontNarrow, y: yFrontA }, // 0: front-left
      { x: centerX + xFrontNarrow, y: yFrontA }, // 1: front-right
      { x: centerX - xBackWide, y: yBackA }, // 2: back-left
      { x: centerX, y: yBackA + 14 }, // 3: back-mid (slightly lower for "W")
      { x: centerX + xBackWide, y: yBackA }, // 4: back-right
    ];

    // Enemy row (B) on the upper half, centered spacing (supports up to 5 for future-proof)
    const maxSlotsB = 5;
    const yB = Math.round(arenaH * 0.28);
    const maxSpan = Math.round(arenaW * 0.72);

    const computeXs = (count: number) => {
      const n = Math.max(0, count);
      if (n <= 1) return [centerX];
      const step = Math.min(Math.round(arenaW * 0.18), maxSpan / (n - 1));
      const start = centerX - (step * (n - 1)) / 2;
      return Array.from({ length: n }).map((_, i) => start + step * i);
    };

    const placeTeam = (team: FighterSnapshot[], side: Side) => {
      const maxSlots = side === 'A' ? 5 : maxSlotsB;
      const count = Math.min(maxSlots, team.length);

      const xsB = side === 'B' ? computeXs(count) : [];

      for (let i = 0; i < count; i++) {
        const f = team[i]!;
        const node = new FighterNode(f);

        let x = centerX;
        let y = side === 'A' ? yBackA : yB;

        if (side === 'A') {
          const pos = slotsA[i];
          if (!pos) continue;
          x = pos.x;
          y = pos.y;
        } else {
          x = xsB[i] ?? centerX;
          y = yB;
        }

        node.setBasePosition(x, y);
        node.container.alpha = 0;

        // Entrance tween: slide from vertical direction for clear top/bottom separation.
        node.container.y += side === 'A' ? 90 : -90;

        this.fighterNodes.set(f.id, node);
        this.fxLayer.addChild(node.container);
        this.tweenRunner.add(Tween.to(node.container, { y, alpha: 1 }, 18, easeOutCubic));
      }
    };

    placeTeam(teamA, 'A');
    placeTeam(teamB, 'B');

    this.resultLabel.visible = false;
    this.resultLabel.text = '';
    this.roundLabel.text = '回合 0';
  }

  /** Receive one battle event from logic. */
  public onEvent(e: BattleEvent): void {
    switch (e.type) {
      case 'roundStart': {
        this.roundLabel.text = `回合 ${e.payload.round}`;
        this.pulseLabel(this.roundLabel);
        break;
      }
      case 'actorTurn': {
        const node = this.fighterNodes.get(e.payload.actorId);
        if (node) node.flashTurn(this.tweenRunner);
        break;
      }
      case 'heal': {
        const tar = this.fighterNodes.get(e.payload.targetId);
        if (tar) tar.onHeal(e.payload.amount, e.payload.targetHp, e.payload.targetMaxHp, this.fxLayer, this.tweenRunner);
        break;
      }
      case 'damage': {
        const src = this.fighterNodes.get(e.payload.sourceId);
        const tar = this.fighterNodes.get(e.payload.targetId);
        if (src && tar) {
          this.playAttackLine(src.container, tar.container);
          tar.onDamage(e.payload.amount, e.payload.targetHp, e.payload.targetMaxHp, this.fxLayer, this.tweenRunner);
        }
        break;
      }
      case 'dead': {
        const tar = this.fighterNodes.get(e.payload.targetId);
        if (tar) tar.playDeath(this.tweenRunner);
        break;
      }
      case 'battleEnd': {
        this.resultLabel.visible = true;
        this.resultLabel.text = e.payload.winner === 'Draw' ? '平局' : e.payload.winner === 'A' ? '我方胜利！' : '敌方胜利…';
        this.pulseLabel(this.resultLabel);
        break;
      }
      default:
        break;
    }
  }

  /** Update animations. Called by BattleEngine each tick. */
  public update(dt: number): void {
    this.tweenRunner.update(dt);
  }

  private playAttackLine(attacker: Container, target: Container): void {
    if (!this.attackLine) return;

    // Use global -> local conversion so line endpoints stay correct under scaling/parent transforms.
    const g0 = attacker.getGlobalPosition(new Point());
    const g1 = target.getGlobalPosition(new Point());
    const p0 = this.fxLayer.toLocal(g0);
    const p1 = this.fxLayer.toLocal(g1);

    const line = this.attackLine;
    line.clear();
    line.lineStyle(6, 0xffffff, 0.65);
    line.moveTo(p0.x, p0.y);
    line.lineTo(p1.x, p1.y);
    line.alpha = 1;

    // Fade out quickly; reuse the same Graphics every hit.
    this.tweenRunner.add(
      Tween.to(line, { alpha: 0 }, 10, (t) => t, () => {
        line.clear();
      }),
    );
  }

  private pulseLabel(label: Text): void {
    label.scale.set(1);
    this.tweenRunner.add(
      Tween.to(label.scale, { x: 1.08, y: 1.08 }, 8, easeOutCubic, () => {
        this.tweenRunner.add(Tween.to(label.scale, { x: 1, y: 1 }, 10, easeOutCubic));
      }),
    );
  }
}

class FighterNode {
  public readonly container: Container;
  private readonly body: Graphics;
  private readonly hpBar: Graphics;
  private readonly nameTxt: Text;
  private readonly turnGlow: Graphics;
  private readonly hitFlash: Graphics;

  private baseX = 0;
  private baseY = 0;

  private hp: number;
  private maxHp: number;

  constructor(f: FighterSnapshot) {
    this.hp = f.hp;
    this.maxHp = f.maxHp;

    this.container = new Container();

    this.turnGlow = new Graphics();
    this.container.addChild(this.turnGlow);

    this.body = new Graphics();
    this.container.addChild(this.body);

    // Hit flash overlay (white) - disabled by default
    this.hitFlash = new Graphics();
    this.hitFlash.beginFill(0xffffff, 0.75);
    this.hitFlash.drawRoundedRect(-58, -48, 116, 116, 28);
    this.hitFlash.endFill();
    this.hitFlash.alpha = 0;
    this.container.addChild(this.hitFlash);

    this.nameTxt = createText(f.name, 18, 0xffffff, '900');
    this.nameTxt.anchor.set(0.5);
    this.nameTxt.position.set(0, -62);
    this.container.addChild(this.nameTxt);

    this.hpBar = new Graphics();
    this.hpBar.position.set(-54, 52);
    this.container.addChild(this.hpBar);

    this.drawBody(f.side);
    this.drawHp();
  }

  public setBasePosition(x: number, y: number): void {
    this.baseX = x;
    this.baseY = y;
    this.container.position.set(x, y);
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }

  private drawBody(side: Side): void {
    const g = this.body;
    g.clear();
    const col = side === 'A' ? 0x3aa7ff : 0xff4d6d;
    g.lineStyle(6, 0xffffff, 0.25);
    g.beginFill(col, 0.9);
    g.drawRoundedRect(-58, -48, 116, 116, 28);
    g.endFill();

    g.beginFill(0x071129, 0.3);
    g.drawCircle(0, 0, 28);
    g.endFill();
  }

  private drawHp(): void {
    const w = 108;
    const h = 14;
    const ratio = this.maxHp <= 0 ? 0 : Math.max(0, Math.min(1, this.hp / this.maxHp));

    this.hpBar.clear();
    this.hpBar.beginFill(0x000000, 0.35);
    roundedRect(this.hpBar, 0, 0, w, h, 10);
    this.hpBar.endFill();

    this.hpBar.beginFill(0x54ff8d, 0.9);
    roundedRect(this.hpBar, 2, 2, Math.max(0, (w - 4) * ratio), h - 4, 8);
    this.hpBar.endFill();
  }

  public flashTurn(runner: TweenRunner): void {
    // Turn glow highlight: show then fade out quickly to avoid "always on"
    this.turnGlow.clear();
    this.turnGlow.beginFill(0xffffff, 0.08);
    this.turnGlow.drawRoundedRect(-74, -64, 148, 148, 34);
    this.turnGlow.endFill();
    this.turnGlow.alpha = 1;

    runner.add(
      Tween.to(this.turnGlow, { alpha: 0 }, 12, easeOutCubic, () => {
        this.turnGlow.clear();
      }),
    );
  }

  public onDamage(amount: number, hp: number, maxHp: number, fxLayer: Container, runner: TweenRunner): void {
    this.hp = hp;
    this.maxHp = maxHp;
    this.drawHp();

    // Hit flash (80~120ms-ish)
    this.hitFlash.alpha = 0.9;
    runner.add(
      Tween.to(this.hitFlash, { alpha: 0 }, 10, (t) => t),
    );

    // Hit shake (save base position; return back to base to avoid drift)
    const dx = (Math.random() < 0.5 ? -1 : 1) * 8;
    const dy = 0;

    this.container.position.set(this.baseX, this.baseY);
    runner.add(
      Tween.to(this.container, { x: this.baseX + dx, y: this.baseY + dy }, 5, easeOutCubic, () => {
        runner.add(Tween.to(this.container, { x: this.baseX, y: this.baseY }, 10, easeOutCubic));
      }),
    );

    // Floating damage text
    spawnFloatingText(fxLayer, `-${amount}`, this.baseX, this.baseY - 78, runner);
  }

  public onHeal(amount: number, hp: number, maxHp: number, fxLayer: Container, runner: TweenRunner): void {
    this.hp = hp;
    this.maxHp = maxHp;
    this.drawHp();
    spawnFloatingText(fxLayer, `+${amount}`, this.baseX, this.baseY - 78, runner, { color: 0x54ff8d });
  }

  public playDeath(runner: TweenRunner): void {
    const c = this.container;
    runner.add(
      Tween.to(c, { alpha: 0.2 }, 22, easeOutCubic, () => {
        runner.add(Tween.to(c, { alpha: 0 }, 16, easeOutCubic));
      }),
    );
  }
}
