import { expect, it } from "vite-plus/test";
import viteConfig from "../../vite.config.ts";
import { listenPlan } from "../../src/lib/server/listen.ts";

it("binds dev and preview to loopback", () => {
  expect(viteConfig.server?.host).toBe("127.0.0.1");
  expect(viteConfig.preview?.host).toBe("127.0.0.1");
});

it("binds the Node server to loopback when HOST is unset", () => {
  expect(listenPlan({})).toEqual({ host: "127.0.0.1", warning: null });
  expect(listenPlan({ HOST: "" })).toEqual({ host: "127.0.0.1", warning: null });
});

it("stays quiet for an explicit loopback host", () => {
  for (const host of ["127.0.0.1", "127.0.1.1", "localhost", "::1"]) {
    expect(listenPlan({ HOST: host })).toEqual({ host, warning: null });
  }
});

it("warns that there is no login when bound beyond loopback", () => {
  for (const host of ["0.0.0.0", "::", "192.168.1.20"]) {
    const plan = listenPlan({ HOST: host });
    expect(plan.host).toBe(host);
    expect(plan.warning).toContain("no login");
    expect(plan.warning).toContain(host);
  }
});
