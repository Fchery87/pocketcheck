import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "pocketcheck_session";
export const SESSION_SECONDS = 12 * 60 * 60;
const WINDOW_MS = 15 * 60 * 1000;

type Environment = Record<string, string | undefined>;
export type AccessConfiguration = { mode: "disabled" } | { mode: "protected"; secret: string };
type AttemptState = { count: number; until: number };
type LoginResult = { status: "authenticated"; session: string } | { status: "denied" | "limited" };

export function accessConfiguration(env: Environment): AccessConfiguration {
  const secret = env.POCKETCHECK_ACCESS_SECRET;
  if (!secret) return { mode: "disabled" };
  if (secret.length < 32 || secret.length > 1024 || new Set(secret).size < 8 || /\s/.test(secret)) {
    throw new Error(
      'POCKETCHECK_ACCESS_SECRET must be a random secret of 32 to 1024 characters. Generate it with node -p \'require("node:crypto").randomBytes(32).toString("hex")\'.',
    );
  }
  return { mode: "protected", secret };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export type AccessController = ReturnType<typeof createAccess>;
let runtime: AccessController | undefined;
export function runtimeAccess(env: Environment): AccessController {
  return (runtime ??= createAccess(accessConfiguration(env)));
}

export function createAccess(configuration: AccessConfiguration, clock = Date.now) {
  const attempts = new Map<string, AttemptState>();
  let global: AttemptState = { count: 0, until: 0 };
  const key = configuration.mode === "protected" ? digest(configuration.secret) : randomBytes(32);
  const sign = (payload: string) =>
    createHmac("sha256", key).update(`session.v1.${payload}`).digest("base64url");

  function authenticated(session: string | undefined): boolean {
    if (configuration.mode === "disabled") return true;
    if (!session || session.length > 256) return false;
    const parts = session.split(".");
    if (parts.length !== 3) return false;
    const [expiry, nonce, signature] = parts;
    if (!/^\d{1,16}$/.test(expiry) || !/^[\w-]{32}$/.test(nonce) || !/^[\w-]{43}$/.test(signature))
      return false;
    const expected = sign(`${expiry}.${nonce}`);
    return (
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) &&
      Number(expiry) > clock() &&
      Number(expiry) <= clock() + SESSION_SECONDS * 1000
    );
  }

  function login(secret: string, client: string): LoginResult {
    const now = clock();
    if (global.until <= now) global = { count: 0, until: now + WINDOW_MS };
    for (const [id, state] of attempts) if (state.until <= now) attempts.delete(id);
    const id = digest(client).toString("hex");
    const state = attempts.get(id) ?? { count: 0, until: now + WINDOW_MS };
    if (state.count >= 5 || global.count >= 100 || (!attempts.has(id) && attempts.size >= 100))
      return { status: "limited" };
    state.count++;
    global.count++;
    attempts.set(id, state);
    if (
      configuration.mode !== "protected" ||
      secret.length > 1024 ||
      !timingSafeEqual(digest(secret), digest(configuration.secret))
    )
      return { status: "denied" };
    const payload = `${now + SESSION_SECONDS * 1000}.${randomBytes(24).toString("base64url")}`;
    return { status: "authenticated", session: `${payload}.${sign(payload)}` };
  }

  return {
    authenticated,
    login,
    permits: (path: string, session: string | undefined) =>
      path === "/login" ||
      path === "/logout" ||
      path.startsWith("/_app/") ||
      authenticated(session),
  };
}
