import { defineEnvVars } from "@sveltejs/kit/env";

const optional = (value: string | undefined) => (value === "" ? undefined : value);

// Server-only. Read through $app/env/private in src/lib/server/config.ts.
export const variables = defineEnvVars({
  DATABASE_URL: {
    schema: optional,
    description: "Neon connection string for the research journal.",
  },
  POCKETCHECK_JOURNAL: {
    schema: optional,
    description: "Set to memory for the browser suite only. Normal use leaves it unset.",
  },
  POCKETCHECK_NOW: {
    schema: optional,
    description: "Fixed clock for the browser suite only. Normal use leaves it unset.",
  },
  POCKETCHECK_SCHEDULE_CSV: {
    schema: optional,
    description: "Schedule CSV path. Defaults to data/sources/games.csv.",
  },
  POCKETCHECK_INJURY_CSV: {
    schema: optional,
    description: "Injury CSV path. Defaults to data/sources/injuries_<season>.csv.",
  },
  POCKETCHECK_WEATHER: {
    schema: optional,
    description:
      "Set to off to skip NWS forecasts (the browser suite does). Normal use leaves it unset.",
  },
  NWS_USER_AGENT: {
    schema: optional,
    description: "User-Agent for api.weather.gov. NWS asks for contact details, such as an email.",
  },
});
