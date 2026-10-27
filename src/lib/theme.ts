// The Light, Dark, and System preference. The server reads it from a cookie so the page paints in the right theme.

export type Theme = "light" | "dark" | "system";

export const THEME_COOKIE = "pocketcheck-theme";
export const THEMES: readonly Theme[] = ["light", "dark", "system"];

export function parseTheme(value: string | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? "system";
}

/** The root element attribute for a theme. System sets none and follows the device. */
export function themeAttribute(theme: Theme): string {
  return theme === "system" ? "" : `data-theme="${theme}"`;
}
