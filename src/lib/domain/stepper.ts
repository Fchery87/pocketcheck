// Entry helpers for the odds and line steppers. They only move a value; the offer rules still validate it.

export type StepDirection = 1 | -1;

const STARTING_ODDS = -110;

/** Moves American odds by five cents. Even money is +100, so the range between −100 and +100 is skipped. */
export function stepAmericanOdds(current: number | null, direction: StepDirection): number {
  let odds =
    current === null || !Number.isFinite(current) || Math.abs(current) < 100
      ? STARTING_ODDS
      : current;
  if (odds === -100) odds = 100;
  const next = odds + 5 * direction;
  if (next > -105 && next < 100) return direction > 0 ? 100 : -105;
  return next;
}

/** Moves a spread or total line by half a point. */
export function stepPointLine(current: number | null, direction: StepDirection): number {
  const halves = current === null || !Number.isFinite(current) ? 0 : Math.round(current * 2);
  return (halves + direction) / 2;
}
