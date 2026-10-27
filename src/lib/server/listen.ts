// The Node adapter listens on every interface unless HOST is set. PocketCheck
// has no login, so the launcher keeps it on loopback unless the user opts in.
export const LOOPBACK_HOST = "127.0.0.1";

export interface ListenPlan {
  host: string;
  warning: string | null;
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host);
}

// The launcher declares plain HTTP, so the form check accepts any Origin that
// matches the Host header. A DNS-rebinding page points its own host name at
// this computer, which makes its requests same-origin. Checking Host closes
// that: loopback and this machine's IP literals cannot be an attacker's name,
// and any other name must be listed in ALLOWED_HOSTS.
const LOOPBACK_NAMES = ["localhost", "127.0.0.1", "::1"];

interface InterfaceAddress {
  address: string;
}

// The host part of a Host header, lowercased, without port or IPv6 brackets.
// Returns null when the header is missing or malformed.
function hostName(header: string | undefined): string | null {
  if (!header) return null;
  const value = header.trim().toLowerCase();
  const bracketed = /^\[([0-9a-f:.]+)\](?::\d+)?$/.exec(value);
  if (bracketed) return bracketed[1];
  const plain = /^([^:[\]\s/@]+)(?::\d+)?$/.exec(value);
  return plain ? plain[1] : null;
}

export function hostAllowlist(
  env: Record<string, string | undefined>,
  interfaces: Record<string, InterfaceAddress[] | undefined>,
): Set<string> {
  const allowed = new Set(LOOPBACK_NAMES);
  for (const addresses of Object.values(interfaces)) {
    // A link-local IPv6 address carries a zone (%wlan0) that a Host header cannot.
    for (const { address } of addresses ?? []) allowed.add(address.toLowerCase().split("%")[0]);
  }
  for (const entry of (env.ALLOWED_HOSTS ?? "").split(",")) {
    const name = hostName(entry) ?? hostName(`[${entry.trim()}]`);
    if (name) allowed.add(name);
  }
  return allowed;
}

export function isAllowedHost(header: string | undefined, allowed: Set<string>): boolean {
  const name = hostName(header);
  return name !== null && allowed.has(name);
}

// The allowlist as a person types it into a browser, for the startup log.
export function describeHosts(allowed: Set<string>): string {
  return [...allowed].map((name) => (name.includes(":") ? `[${name}]` : name)).join(", ");
}

export function listenPlan(env: Record<string, string | undefined>): ListenPlan {
  const host = env.HOST || LOOPBACK_HOST;
  if (isLoopback(host)) return { host, warning: null };
  return {
    host,
    warning:
      `Warning: PocketCheck is listening on ${host}, beyond this computer. ` +
      "The journal has no login. Anyone who can reach this address on the network can read and change it.",
  };
}
