import { createLayoutBounds, LayoutBounds } from '../utils/layout';

export class LayoutSystem {
  private bounds: LayoutBounds;

  constructor(width: number, height: number) {
    this.bounds = createLayoutBounds(width, height);
  }

  update(width: number, height: number) {
    this.bounds = createLayoutBounds(width, height);
  }

  get layout(): LayoutBounds {
    return this.bounds;
  }
}
