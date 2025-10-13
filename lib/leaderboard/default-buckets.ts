export const defaultBuckets = new Map<number, number>(
  new Array(Math.floor(1500 / 50) + 1).fill(0).map((_, i) => [i * 50, 0])
);
