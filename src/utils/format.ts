export type Unit = 'kg' | 'lb';

const KG_TO_LB = 2.20462262;

/** Convert stored kg value to the display unit. */
export function toDisplay(kg: number, unit: Unit): number {
  const v = unit === 'lb' ? kg * KG_TO_LB : kg;
  return Math.round(v * 10) / 10;
}

/** Convert a value typed by the user (in display unit) back to kg for storage. */
export function fromDisplay(value: number, unit: Unit): number {
  return unit === 'lb' ? value / KG_TO_LB : value;
}

export function formatWeight(kg: number, unit: Unit): string {
  return `${toDisplay(kg, unit)}`;
}

/** e.g. "60 kg × 10" — weight with its unit first, then the reps. */
export function formatSet(reps: number, kg: number, unit: Unit): string {
  return `${formatWeight(kg, unit)} ${unit} × ${reps}`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
