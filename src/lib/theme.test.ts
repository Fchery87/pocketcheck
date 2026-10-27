import { describe, expect, it } from "vite-plus/test";
import { parseTheme, themeAttribute } from "#lib/theme.ts";

describe("theme preference", () => {
  it("accepts light, dark, and system", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
  });

  it("falls back to system for a missing or unknown cookie", () => {
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("")).toBe("system");
    expect(parseTheme("sepia")).toBe("system");
    expect(parseTheme('dark" onload="x')).toBe("system");
  });

  it("renders a root attribute only for an explicit choice", () => {
    expect(themeAttribute("dark")).toBe('data-theme="dark"');
    expect(themeAttribute("light")).toBe('data-theme="light"');
    expect(themeAttribute("system")).toBe("");
  });
});
