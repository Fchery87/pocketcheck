// A key starts at a word boundary, so "risk-adjusted" and "task-based" survive.
const SECRET_PATTERNS = [/postgres(?:ql)?:\/\/\S+/gi, /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g];

/** Replace connection URLs and secret keys in text, keeping everything around them. */
export function redactText(value: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[redacted]"), value);
}

/** Redact every string in a JSON-like value. */
export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactSecrets(item)]),
    ) as T;
  }
  return value;
}
