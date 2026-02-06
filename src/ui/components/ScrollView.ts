import { Container, Graphics, Rectangle } from 'pixi.js';
import { clamp } from '../uiFactory';

/**
 * A minimal vertical ScrollView for PixiJS.
 *
 * Phase-3 purpose:
 * - Probability / hero pool previews
 * - Result list for multi-summon
 *
 * Features:
 * - Masked viewport
 * - Drag to scroll (touch friendly)
 * - Wheel scroll (desktop friendly)
 */
export default class ScrollView extends Container {
  /** viewport width */
  private viewW = 0;
  /** viewport height */
  private viewH = 0;

  private readonly maskG: Graphics;
  public readonly content: Container;

  private scrollY = 0;
  private dragStartY = 0;
  private dragStartScrollY = 0;
  private dragging = false;

  constructor(w: number, h: number) {
    super();
    this.viewW = w;
    this.viewH = h;

    this.content = new Container();
    this.addChild(this.content);

    this.maskG = new Graphics();
    this.addChild(this.maskG);
    this.content.mask = this.maskG;

    // Enable touch dragging.
    this.interactive = true;
    this.on('pointerdown', (e) => this.onDown(e));
    this.on('pointerup', () => this.onUp());
    this.on('pointerupoutside', () => this.onUp());
    this.on('pointermove', (e) => this.onMove(e));

    this.redrawMask();
  }

  
/**
 * Bind wheel scrolling to a DOM element (usually the PIXI canvas).
 * Some environments do not dispatch wheel events on Pixi Containers reliably,
 * so we listen on the canvas and do hit-testing against this ScrollView bounds.
 *
 * Returns an unbind function to avoid leaking listeners when popups close.
 */
public bindWheel(dom: HTMLElement): () => void {
  const handler = (evt: WheelEvent) => {
    // Convert client coords to canvas pixel coords (handles CSS scaling).
    const rect = dom.getBoundingClientRect();
    const scaleX = rect.width > 0 ? (dom as any).width / rect.width : 1;
    const scaleY = rect.height > 0 ? (dom as any).height / rect.height : 1;
    const x = (evt.clientX - rect.left) * scaleX;
    const y = (evt.clientY - rect.top) * scaleY;

    const b = this.getBounds(); // global bounds in world/canvas coords
    if (x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) return;

    evt.preventDefault(); // prevent page scroll when wheel is over this ScrollView
    this.scrollBy(evt.deltaY * 0.65);
  };

  dom.addEventListener('wheel', handler, { passive: false });

  // unbind: caller must invoke on close/destroy to prevent duplicate bindings
  return () => dom.removeEventListener('wheel', handler as any);
}

/** Update the viewport size and redraw the mask. */
  public resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.redrawMask();
    this.applyScroll();
  }

  /** Scroll to a specific offset (0 means top). */
  public scrollTo(y: number): void {
    this.scrollY = y;
    this.applyScroll();
  }

  /** Scroll by delta pixels (positive = scroll down). */
  public scrollBy(dy: number): void {
    this.scrollY += dy;
    this.applyScroll();
  }

  /** Max scroll range based on content height. */
  private getMaxScroll(): number {
    // content.height is bounds-based, safe after children added.
    const overflow = Math.max(0, this.content.height - this.viewH);
    return overflow;
  }

  private applyScroll(): void {
    const max = this.getMaxScroll();
    this.scrollY = clamp(this.scrollY, 0, max);
    this.content.y = -this.scrollY;
  }

  private redrawMask(): void {
    this.maskG.clear();
    this.maskG.beginFill(0xffffff, 1);
    this.maskG.drawRect(0, 0, this.viewW, this.viewH);
    this.maskG.endFill();
    this.maskG.hitArea = new Rectangle(0, 0, this.viewW, this.viewH);
  }

  private onDown(e: any): void {
    this.dragging = true;
    this.dragStartY = e.global.y;
    this.dragStartScrollY = this.scrollY;
  }

  private onMove(e: any): void {
    if (!this.dragging) return;
    const dy = e.global.y - this.dragStartY;
    // Dragging down should scroll up.
    this.scrollY = this.dragStartScrollY - dy;
    this.applyScroll();
  }

  private onUp(): void {
    this.dragging = false;
  }
}
