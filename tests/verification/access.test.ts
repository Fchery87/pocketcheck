import { expect, it } from "vite-plus/test";
import { accessConfiguration, createAccess, SESSION_COOKIE } from "../../src/lib/server/access.ts";

const secret = "a9f64e12cb7380d5".repeat(4);

it("requires a high-entropy-shaped configured secret without exposing it", () => {
  expect(accessConfiguration({})).toEqual({ mode: "disabled" });
  expect(() => accessConfiguration({ POCKETCHECK_ACCESS_SECRET: "short" })).toThrow("32");
  expect(() => accessConfiguration({ POCKETCHECK_ACCESS_SECRET: "x".repeat(64) })).toThrow();
});

it("issues expiring signed sessions without storing the access secret", () => {
  let now = 1_000_000;
  const access = createAccess(
    accessConfiguration({ POCKETCHECK_ACCESS_SECRET: secret }),
    () => now,
  );
  const login = access.login(secret, "client");
  expect(login.status).toBe("authenticated");
  if (login.status !== "authenticated") throw new Error("No session");
  expect(login.session).not.toContain(secret);
  expect(access.authenticated(login.session)).toBe(true);
  expect(access.authenticated(`${login.session}x`)).toBe(false);
  expect(access.authenticated(undefined)).toBe(false);
  now += 12 * 60 * 60 * 1000;
  expect(access.authenticated(login.session)).toBe(false);
  expect(SESSION_COOKIE).toBe("pocketcheck_session");
});

it("bounds attempts per client and globally and recovers after the window", () => {
  let now = 0;
  const access = createAccess(
    accessConfiguration({ POCKETCHECK_ACCESS_SECRET: secret }),
    () => now,
  );
  for (let i = 0; i < 5; i++) expect(access.login("wrong", "client").status).toBe("denied");
  expect(access.login(secret, "client").status).toBe("limited");
  for (let i = 0; i < 100; i++) access.login("wrong", `other-${i}`);
  expect(access.login(secret, "new-client").status).toBe("limited");
  now += 15 * 60 * 1000;
  expect(access.login(secret, "client").status).toBe("authenticated");
});

it("gates every protected path and never treats verification as a public bypass", () => {
  const access = createAccess(accessConfiguration({ POCKETCHECK_ACCESS_SECRET: secret }));
  for (const path of [
    "/",
    "/journal/export",
    "/settings",
    "/board/__data.json",
    "/__verification",
  ]) {
    expect(access.permits(path, undefined)).toBe(false);
  }
  expect(access.permits("/login", undefined)).toBe(true);
  expect(access.permits("/logout", undefined)).toBe(true);
  expect(access.permits("/login/other", undefined)).toBe(false);
  expect(createAccess({ mode: "disabled" }).permits("/journal/export", undefined)).toBe(true);
});
