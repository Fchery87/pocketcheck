import { beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock("$app/env/private", () => ({ POCKETCHECK_ACCESS_SECRET: "0123456789abcdef".repeat(4) }));
vi.mock("#lib/server/verification.ts", () => ({ assertBrowserFixture: vi.fn() }));

import { handle } from "../../src/hooks.server.ts";
import { actions } from "../../src/routes/login/+page.server.ts";
import { actions as logout } from "../../src/routes/logout/+page.server.ts";
import { SESSION_COOKIE } from "../../src/lib/server/access.ts";

const cookieValues = new Map<string, string>();
const cookies = {
  get: (key: string) => cookieValues.get(key),
  set: vi.fn((key: string, value: string) => cookieValues.set(key, value)),
  delete: vi.fn((key: string) => cookieValues.delete(key)),
};
function event(path: string, method = "GET", origin = "http://localhost", protocol = "http:") {
  const url = new URL(`${protocol}//localhost${path}`);
  return {
    url,
    cookies,
    isDataRequest: path.endsWith("__data.json"),
    getClientAddress: () => "route-client",
    request: new Request(url, {
      method,
      ...(method === "POST"
        ? {
            headers: { origin, "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ secret: "0123456789abcdef".repeat(4) }),
          }
        : {}),
    }),
  };
}

beforeEach(() => {
  cookieValues.clear();
  vi.clearAllMocks();
});

it("blocks pages, data, exports and mutations before route resolution", async () => {
  const resolve = vi.fn();
  for (const [path, method, status] of [
    ["/journal", "GET", 303],
    ["/journal/export", "GET", 303],
    ["/board/__data.json", "GET", 401],
    ["/settings", "POST", 401],
    ["/__verification", "GET", 303],
  ] as const) {
    const response = await handle({ event: event(path, method), resolve } as never);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(resolve).not.toHaveBeenCalled();
});

it("logs in with an HttpOnly expiring same-site cookie and permits a protected export", async () => {
  await expect(actions.default(event("/login", "POST") as never)).rejects.toMatchObject({
    status: 303,
    location: "/",
  });
  expect(cookies.set).toHaveBeenCalledWith(
    SESSION_COOKIE,
    expect.any(String),
    expect.objectContaining({
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      maxAge: 43200,
      expires: expect.any(Date),
    }),
  );
  const resolve = vi.fn(async () => new Response("journal"));
  const response = await handle({ event: event("/journal/export"), resolve } as never);
  expect(await response.text()).toBe("journal");
  expect(resolve).toHaveBeenCalledOnce();
});

it("uses Secure cookies only for HTTPS and rejects cross-origin login and logout", async () => {
  const rejected = await actions.default(
    event("/login", "POST", "https://attacker.example") as never,
  );
  expect(rejected).toMatchObject({ status: 403 });
  expect(cookies.set).not.toHaveBeenCalled();
  await expect(
    actions.default(event("/login", "POST", "https://localhost", "https:") as never),
  ).rejects.toMatchObject({ status: 303 });
  expect(cookies.set).toHaveBeenCalledWith(
    SESSION_COOKIE,
    expect.any(String),
    expect.objectContaining({ secure: true }),
  );
  expect(
    logout.default(event("/logout", "POST", "https://attacker.example") as never),
  ).toMatchObject({ status: 403 });
  expect(cookies.delete).not.toHaveBeenCalled();
  expect(() => logout.default(event("/logout", "POST") as never)).toThrow();
  expect(cookies.delete).toHaveBeenCalledWith(
    SESSION_COOKIE,
    expect.objectContaining({ path: "/" }),
  );
  expect(cookieValues.has(SESSION_COOKIE)).toBe(false);
});
