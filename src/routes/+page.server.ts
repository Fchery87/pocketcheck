import { fixtureGameName } from "#lib/server/fixtures.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = () => {
  return {
    gameName: fixtureGameName,
  };
};

export const actions = {
  default: async () => {
    return {
      gameName: fixtureGameName,
    };
  },
} satisfies Actions;
