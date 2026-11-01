const REDACTED = "[redacted]";

// Values that are secrets wherever they appear. A key starts at a word boundary, so
// "risk-adjusted" and "task-based" survive.
const KEY_PATTERNS = [/postgres(?:ql)?:\/\/\S+/gi, /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g];

// Credentials recognized by the diagnostic text around them.
const DIAGNOSTIC_PATTERNS: [RegExp, string][] = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
  [/\b(authorization|proxy-authorization)(\s*:\s*)(?!Bearer\b)\S+/gi, `$1$2${REDACTED}`],
  [
    /\b(x-api-key|api[_-]?key|access[_-]?token|client[_-]?secret|password)(\s*[:=]\s*)[^\s&;,]+/gi,
    `$1$2${REDACTED}`,
  ],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${REDACTED}@`],
];

function exactSecrets(secrets: readonly string[]): string[] {
  return secrets
    .map((secret) => secret.trim())
    .filter((secret) => secret.length > 0)
    .sort((a, b) => b.length - a.length);
}

/**
 * Replace configured secrets, connection URLs, keys, and credential-bearing diagnostics in text,
 * keeping everything around them. Exact configured values go first because a provider key need
 * not match any recognizable shape.
 */
export function redactText(value: string, secrets: readonly string[] = []): string {
  const withoutConfigured = exactSecrets(secrets).reduce(
    (text, secret) => text.split(secret).join(REDACTED),
    value,
  );
  const withoutKeys = KEY_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, REDACTED),
    withoutConfigured,
  );
  return DIAGNOSTIC_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    withoutKeys,
  );
}

/**
 * Whether text holds a configured secret or a value shaped like a key. Diagnostic patterns are
 * left out: saved prose that merely mentions a password must not block a backup.
 */
export function containsSecret(value: string, secrets: readonly string[]): boolean {
  return (
    exactSecrets(secrets).some((secret) => value.includes(secret)) ||
    KEY_PATTERNS.some((pattern) => value.search(pattern) !== -1)
  );
}
