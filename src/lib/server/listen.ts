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
