export const ENTRY_TIME_ZONE = "America/New_York";
export type TimeOccurrence = "earlier" | "later";
export type ParsedTime = { ok: true; iso: string } | { ok: false; error: string };

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ENTRY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wallTime(date: Date): string {
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function easternDateTimeInput(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? wallTime(date).slice(0, 16) : "";
}

export function parseEasternTime(value: string, occurrence?: TimeOccurrence): ParsedTime {
  const text = value.trim();
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(
      text,
    );
  const invalid = { ok: false, error: "Enter a valid date and time in America/New_York." } as const;
  if (!match) return invalid;
  const [, year, month, day, hour, minute, second = "00", fraction = "", offset] = match;
  const wall = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const naive = new Date(`${wall}.${fraction.padEnd(3, "0")}Z`);
  if (!Number.isFinite(naive.getTime()) || naive.toISOString().slice(0, 19) !== wall)
    return invalid;
  if (offset) {
    const date = new Date(text);
    return Number.isFinite(date.getTime()) ? { ok: true, iso: date.toISOString() } : invalid;
  }
  const offsets = new Set(
    [-1, 0, 1].map((dayOffset) => {
      const probe = new Date(naive.getTime() + dayOffset * 86_400_000);
      return Date.parse(`${wallTime(probe)}Z`) - Math.floor(probe.getTime() / 1000) * 1000;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => new Date(naive.getTime() - offset))
    .sort((first, second) => first.getTime() - second.getTime())
    .filter((date) => wallTime(date) === wall);
  if (!candidates.length)
    return {
      ok: false,
      error:
        "That time does not exist in America/New_York because clocks move forward. Choose another time.",
    };
  if (candidates.length > 1 && !occurrence)
    return {
      ok: false,
      error:
        "That time occurs twice in America/New_York. Choose the earlier or later occurrence, or enter an explicit UTC offset.",
    };
  return {
    ok: true,
    iso: candidates[occurrence === "later" ? candidates.length - 1 : 0]!.toISOString(),
  };
}
