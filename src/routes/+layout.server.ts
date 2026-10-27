import { parseTheme, THEME_COOKIE } from "#lib/theme.ts";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ cookies }) => ({
  theme: parseTheme(cookies.get(THEME_COOKIE)),
});
