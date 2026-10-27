import { BROWSER_PORT_VARIABLE } from "./browser-port.ts";

export function verificationEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    PATH: source.PATH,
    HOME: source.HOME,
    TMPDIR: source.TMPDIR,
    CI: source.CI,
    DATABASE_URL: "",
    TEST_DATABASE_URL: "",
    DEEPSEEK_API_KEY: "",
    THECLAWBAY_API_KEY: "",
    NWS_USER_AGENT: "",
    POCKETCHECK_TEST_MODE: "",
    POCKETCHECK_TEST_JOURNAL_ID: "",
    POCKETCHECK_JOURNAL: "",
    POCKETCHECK_NOW: "",
    POCKETCHECK_SCHEDULE_CSV: "",
    POCKETCHECK_INJURY_CSV: "",
    POCKETCHECK_WEATHER: "",
    POCKETCHECK_MODEL_ARTIFACT: "",
    TZ: "America/New_York",
  };
}

// The clean environment for a verification step, plus the caller's browser
// port when one is set. No other caller variable passes through.
export function verificationRunEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = verificationEnv(source);
  const port = source[BROWSER_PORT_VARIABLE];
  if (port) env[BROWSER_PORT_VARIABLE] = port;
  return env;
}
