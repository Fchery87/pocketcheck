const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Reads an observed-time field. A datetime-local value has no zone, so it is read
 * as this computer's local time; PocketCheck runs on the user's own machine.
 */
export function parseObservedAt(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const local = LOCAL_INPUT.exec(value);
  const instant = local
    ? new Date(
        Number(local[1]),
        Number(local[2]) - 1,
        Number(local[3]),
        Number(local[4]),
        Number(local[5]),
      )
    : new Date(value);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : null;
}

/** A datetime-local value for an instant, in this computer's local time. */
export function localInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
