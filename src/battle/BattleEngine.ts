import type { BattleEvent, BattleEventEmitter, BattleSetup } from './BattleTypes';
import BattleLogic from './BattleLogic';
import BattleView from './BattleView';

/**
 * BattleEngine
 *
 * Orchestrates the battle by:
 * - creating BattleLogic (simulation)
 * - forwarding logic events to BattleView (presentation)
 * - controlling step cadence so animations can be seen
 */
export default class BattleEngine implements BattleEventEmitter {
  public readonly view: BattleView;
  public readonly logic: BattleLogic;

  // Step pacing (in ticks). Smaller = faster.
  private readonly stepIntervalTicks: number;
  private stepAcc = 0;

  // Keep a lightweight event log for potential replay (phase 4+).
  private readonly log: BattleEvent[] = [];

  constructor(opts: { stepIntervalTicks?: number } = {}) {
    this.stepIntervalTicks = opts.stepIntervalTicks ?? 36;
    this.view = new BattleView();
    this.logic = new BattleLogic(this);
  }

  /** Start a new battle and reset internal pacing. */
  public start(setup: BattleSetup): void {
    this.log.length = 0;
    this.stepAcc = 0;
    this.logic.init(setup);
  }

  /**
   * Update engine each tick.
   * - advances animations (view)
   * - advances simulation at a fixed cadence
   */
  public update(dt: number): void {
    this.view.update(dt);
    if (this.logic.isOver()) return;

    this.stepAcc += dt;
    if (this.stepAcc >= this.stepIntervalTicks) {
      this.stepAcc = 0;
      this.logic.step();
    }
  }

  public emit(e: BattleEvent): void {
    // Record
    this.log.push(e);
    // Forward to view
    if (e.type === 'battleStart') {
      this.view.build(e.payload.teamA, e.payload.teamB);
    }
    this.view.onEvent(e);
  }

  /** Retrieve a snapshot of emitted events. Useful for debugging or replay. */
  public getEventLog(): BattleEvent[] {
    return [...this.log];
  }
}
