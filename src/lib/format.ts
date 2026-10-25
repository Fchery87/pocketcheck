// Display helpers shared by pages. NFL kickoffs are shown in America/New_York.

const eastern = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export function easternTime(iso: string | null | undefined): string {
  if (!iso || iso === "unknown") return "unknown";
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? eastern.format(date) : "unknown";
}

export function percent(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function signedLine(value: number | null): string {
  if (value === null) return "";
  return value > 0 ? `+${value}` : String(value);
}
