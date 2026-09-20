/**
 * KSHETRA — pure screen-space helpers for GIS parcel labels (no Leaflet, so
 * they can be unit-tested). Labels are placed greedily in priority order; a
 * label that cannot be placed without overlapping an already-placed box or
 * leaving the viewport is skipped rather than drawn cluttered.
 */
export interface Box { x: number; y: number; w: number; h: number }

export const boxesOverlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Which parcels deserve a label, and in what order (lower = placed first).
 * null = no label. Selected → high exposure → overlaps the active ROW → critical priority.
 */
export const labelPriority = (p: { isSelected: boolean; isHigh: boolean; intersectsRow: boolean; isCritical: boolean }): number | null =>
  p.isSelected ? 0 : p.isHigh ? 1 : p.intersectsRow ? 2 : p.isCritical ? 3 : null;

export const labelSize = (id: string, sub?: string): { w: number; h: number } => ({
  w: Math.max(46, 10 + id.length * 6.4, sub ? 10 + sub.length * 5.2 : 0),
  h: sub ? 32 : 18
});

/** First candidate offset around `pt` that is inside the viewport and free of `placed`. Pushes the box onto `placed`. */
export function placeLabel(
  pt: { x: number; y: number },
  size: { w: number; h: number },
  placed: Box[],
  viewport: { x: number; y: number },
  pad = 4
): Box | null {
  const { w, h } = size;
  const offsets: [number, number][] = [
    [16, -h - 8], [16, 10], [-w - 16, -h - 8], [-w - 16, 10], [-w / 2, -h - 20], [-w / 2, 20]
  ];
  for (const [dx, dy] of offsets) {
    const box = { x: pt.x + dx, y: pt.y + dy, w, h };
    const inView = box.x >= pad && box.y >= pad && box.x + w <= viewport.x - pad && box.y + h <= viewport.y - pad;
    if (!inView || placed.some(o => boxesOverlap(box, o))) continue;
    placed.push(box);
    return box;
  }
  return null;
}
