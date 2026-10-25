const SECRET_MARKERS = ["postgresql://", "sk-"];

export function containsSecretMarker(value: string): boolean {
  return SECRET_MARKERS.some((marker) => value.includes(marker));
}

/** Strip strings that carry connection URLs or secret-key prefixes. Keys are removed, not blanked to zero. */
export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") {
    return (containsSecretMarker(value) ? undefined : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)).filter((item) => item !== undefined) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string" && containsSecretMarker(item)) continue;
      const next = redactSecrets(item);
      if (next !== undefined) out[key] = next;
    }
    return out as T;
  }
  return value;
}
