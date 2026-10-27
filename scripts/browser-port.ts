import { createServer } from "node:net";

// Browser acceptance uses a pair of ports: the production server on `main`
// and the `npm start` launcher on `main + 1`. POCKETCHECK_BROWSER_PORT moves
// the pair so separate worktrees can verify at the same time.
export const BROWSER_PORT_VARIABLE = "POCKETCHECK_BROWSER_PORT";
export const DEFAULT_BROWSER_PORT = 42627;
const HOST = "127.0.0.1";
const ATTEMPTS = 50;
// Concurrent runs start probing at different pairs, so two runs that probe
// at the same moment rarely settle on the same pair before either binds it.
const SPREAD = 500;

export interface BrowserPorts {
  main: number;
  launcher: number;
  origin: string;
}

export function browserPorts(env: NodeJS.ProcessEnv): BrowserPorts {
  const main = parseBrowserPort(env[BROWSER_PORT_VARIABLE]);
  return { main, launcher: main + 1, origin: `http://${HOST}:${main}` };
}

function parseBrowserPort(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_BROWSER_PORT;
  const port = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65534) {
    throw new Error(`${BROWSER_PORT_VARIABLE} must be an integer from 1 to 65534, got "${value}"`);
  }
  return port;
}

export function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, HOST, () => server.close(() => resolve(true)));
  });
}

// Returns the configured browser port, or the first pair from `start` whose
// two ports both accept a loopback bind.
export async function chooseBrowserPort(
  env: NodeJS.ProcessEnv,
  isFree: (port: number) => Promise<boolean> = portIsFree,
  start: number = DEFAULT_BROWSER_PORT + 2 * Math.floor(Math.random() * SPREAD),
): Promise<number> {
  if (env[BROWSER_PORT_VARIABLE]) return browserPorts(env).main;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const port = start + 2 * attempt;
    if ((await isFree(port)) && (await isFree(port + 1))) return port;
  }
  throw new Error(`No free browser port pair in ${ATTEMPTS} attempts from ${start}`);
}
