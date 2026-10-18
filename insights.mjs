/** Source record counts. Designation and closure overlap; neither implies the other. */
export function wellStatusSummary(records) {
  const result = {total: records.length, abandoned: 0, designated: 0, both: 0, closureUnknown: 0};
  for (const record of records) {
    const abandoned = record.closureStatus === 'abandoned';
    const designated = record.orphanStatus === 'designated';
    if (abandoned) result.abandoned++;
    if (designated) result.designated++;
    if (abandoned && designated) result.both++;
    if (record.closureStatus === 'unknown') result.closureUnknown++;
  }
  return result;
}
/** Common zero baseline; valid for nonnegative values in the same unit. */
export function comparisonWidths(values) {
  if (!values.every(v => Number.isFinite(v) && v >= 0)) throw new Error('Comparison requires finite nonnegative values');
  const max = Math.max(0, ...values);
  return values.map(value => max ? value / max * 100 : 0);
}
/** A damped spring sampled for native Web Animations; no animation loop remains alive. */
export function revealPanel(element) {
  if (!element?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const frames = Array.from({length: 25}, (_, i) => {
    const t = i / 24;
    const displacement = i === 24 ? 0 : Math.exp(-8 * t) * Math.cos(9 * t);
    return {transform: `translateY(${8 * displacement}px)`, opacity: Math.min(1, .6 + t * 3), offset: t};
  });
  element.animate(frames, {duration: 360, easing: 'linear'});
}
