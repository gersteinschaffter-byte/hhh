import { Container, Graphics, Rectangle } from 'pixi.js';
import { clamp } from './uiFactory';

interface VirtualListOptions<T extends Container> {
  width: number;
  height: number;
  itemWidth: number;
  itemHeight: number;
  gapX: number;
  gapY: number;
  columns: number;
  overscanRows?: number;
  createItem: () => T;
  updateItem: (item: T, index: number) => void;
}

export default class VirtualList<T extends Container> extends Container {
  private viewW: number;
  private viewH: number;
  private itemW: number;
  private itemH: number;
  private gapX: number;
  private gapY: number;
  private columns: number;
  private overscanRows: number;

  private itemCount = 0;
  private readonly content: Container;
  private readonly maskG: Graphics;
  private pool: T[] = [];

  private scrollY = 0;
  private velocity = 0;
  private dragging = false;
  private moved = false;
  private dragStartY = 0;
  private dragStartScrollY = 0;
  private lastMoveY = 0;
  private lastMoveTime = 0;

  private readonly friction = 0.94;
  private readonly dragThreshold = 8;

  constructor(opts: VirtualListOptions<T>) {
    super();
    this.viewW = opts.width;
    this.viewH = opts.height;
    this.itemW = opts.itemWidth;
    this.itemH = opts.itemHeight;
    this.gapX = opts.gapX;
    this.gapY = opts.gapY;
    this.columns = Math.max(1, opts.columns);
    this.overscanRows = Math.max(1, opts.overscanRows ?? 2);

    this.content = new Container();
    this.addChild(this.content);

    this.maskG = new Graphics();
    this.addChild(this.maskG);
    this.content.mask = this.maskG;

    this.interactive = true;
    this.cursor = 'grab';
    this.on('pointerdown', (e) => this.onDown(e));
    this.on('pointerup', () => this.onUp());
    this.on('pointerupoutside', () => this.onUp());
    this.on('pointermove', (e) => this.onMove(e));

    this.redrawMask();
    this.buildPool(opts.createItem, opts.updateItem);
  }

  public bindWheel(dom: HTMLElement): () => void {
    const handler = (evt: WheelEvent) => {
      const rect = dom.getBoundingClientRect();
      const scaleX = rect.width > 0 ? (dom as any).width / rect.width : 1;
      const scaleY = rect.height > 0 ? (dom as any).height / rect.height : 1;
      const x = (evt.clientX - rect.left) * scaleX;
      const y = (evt.clientY - rect.top) * scaleY;

      const b = this.getBounds();
      if (x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) return;

      evt.preventDefault();
      this.velocity += evt.deltaY * 0.4;
    };
    dom.addEventListener('wheel', handler, { passive: false });
    return () => dom.removeEventListener('wheel', handler as any);
  }

  public resize(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
    this.redrawMask();
    this.refresh(true);
  }

  public setItemCount(count: number): void {
    this.itemCount = Math.max(0, Math.floor(count));
    this.refresh(true);
  }

  public refresh(force = false): void {
    if (force) this.scrollY = clamp(this.scrollY, 0, this.getMaxScroll());
    this.updateVisible(force);
  }

  public update(dt: number): void {
    if (this.dragging) return;
    if (Math.abs(this.velocity) < 0.05) return;
    this.scrollY += this.velocity * dt;
    this.velocity *= Math.pow(this.friction, dt);
    this.applyScroll();
  }

  public shouldBlockTap(): boolean {
    return this.dragging || this.moved || Math.abs(this.velocity) > 0.1;
  }

  private buildPool(createItem: () => T, updateItem: (item: T, index: number) => void): void {
    const rows = Math.ceil(this.viewH / (this.itemH + this.gapY));
    const poolSize = (rows + this.overscanRows * 2) * this.columns;
    this.pool = [];
    for (let i = 0; i < poolSize; i++) {
      const item = createItem();
      this.pool.push(item);
      this.content.addChild(item);
    }
    this.updateItem = updateItem;
  }

  private updateItem: (item: T, index: number) => void = () => {};

  private updateVisible(force = false): void {
    const rowH = this.itemH + this.gapY;
    const totalRows = Math.max(1, Math.ceil(this.itemCount / this.columns));
    const startRow = Math.max(0, Math.floor(this.scrollY / rowH) - this.overscanRows);
    const endRow = Math.min(totalRows - 1, Math.floor((this.scrollY + this.viewH) / rowH) + this.overscanRows);
    const startIndex = startRow * this.columns;
    const endIndex = Math.min(this.itemCount - 1, (endRow + 1) * this.columns - 1);

    let poolIndex = 0;
    for (let i = startIndex; i <= endIndex; i++) {
      const item = this.pool[poolIndex];
      if (!item) break;
      poolIndex += 1;

      const row = Math.floor(i / this.columns);
      const col = i % this.columns;
      item.position.set(col * (this.itemW + this.gapX), row * rowH);
      item.visible = true;
      if (force || (item as any).__index !== i) {
        (item as any).__index = i;
        this.updateItem(item, i);
      }
    }
    for (let i = poolIndex; i < this.pool.length; i++) {
      const item = this.pool[i];
      if (item) item.visible = false;
    }
    this.applyScroll(false);
  }

  private getMaxScroll(): number {
    const totalRows = Math.max(1, Math.ceil(this.itemCount / this.columns));
    const contentH = totalRows * (this.itemH + this.gapY) - this.gapY;
    return Math.max(0, contentH - this.viewH);
  }

  private applyScroll(clampOnly = true): void {
    const max = this.getMaxScroll();
    if (clampOnly) this.scrollY = clamp(this.scrollY, 0, max);
    else this.scrollY = clamp(this.scrollY, -40, max + 40);
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
    this.moved = false;
    this.cursor = 'grabbing';
    this.dragStartY = e.global.y;
    this.dragStartScrollY = this.scrollY;
    this.lastMoveY = e.global.y;
    this.lastMoveTime = performance.now();
    this.velocity = 0;
  }

  private onMove(e: any): void {
    if (!this.dragging) return;
    const dy = e.global.y - this.dragStartY;
    if (!this.moved && Math.abs(dy) >= this.dragThreshold) this.moved = true;
    this.scrollY = this.dragStartScrollY - dy;
    this.applyScroll(false);
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMoveTime);
    const deltaY = e.global.y - this.lastMoveY;
    this.velocity = -(deltaY / dt) * 16;
    this.lastMoveY = e.global.y;
    this.lastMoveTime = now;
  }

  private onUp(): void {
    this.dragging = false;
    this.cursor = 'grab';
    setTimeout(() => {
      this.moved = false;
    }, 0);
    this.applyScroll();
  }
}
