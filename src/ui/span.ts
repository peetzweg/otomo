/** The stretch of a stage the elevation profile shows, in komoot-track km: all of it, or a zoomed-in part. */
export type Span = readonly [from: number, to: number];

/** Where a km falls across the profile, 0 to 1 (outside the span: below 0 or above 1). */
export const across = (span: Span, km: number) => (km - span[0]) / (span[1] - span[0]);

/** A stretch's left edge and width across the profile, clipped to it, as CSS percentages; undefined if it's outside. */
export function clip(span: Span, from: number, to: number) {
  if (to < span[0] || from > span[1]) return undefined;
  const left = Math.max(0, across(span, from));
  const right = Math.min(1, across(span, to));
  return { left: `${left * 100}%`, width: `${(right - left) * 100}%` };
}

export const inside = (span: Span, km: number) => km >= span[0] && km <= span[1];
