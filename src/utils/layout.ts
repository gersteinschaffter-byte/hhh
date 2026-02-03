export type LayoutBounds = {
  width: number;
  height: number;
  padding: number;
  topBarHeight: number;
  bottomBarHeight: number;
};

export const createLayoutBounds = (width: number, height: number): LayoutBounds => {
  const padding = Math.max(16, Math.min(width, height) * 0.03);
  const topBarHeight = Math.max(60, height * 0.12);
  const bottomBarHeight = Math.max(88, height * 0.18);

  return {
    width,
    height,
    padding,
    topBarHeight,
    bottomBarHeight,
  };
};
