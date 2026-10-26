export function verificationEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    CI: process.env.CI,
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
