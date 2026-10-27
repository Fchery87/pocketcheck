import { expect, it } from "vite-plus/test";
import viteConfig from "../../vite.config.ts";
import {
  describeHosts,
  hostAllowlist,
  isAllowedHost,
  listenPlan,
} from "../../src/lib/server/listen.ts";

// A DNS-rebinding page names its own host. The launcher accepts only loopback,
// this machine's interface addresses, and names the user lists in ALLOWED_HOSTS.
const interfaces = {
  lo: [
    { address: "127.0.0.1", family: "IPv4" },
    { address: "::1", family: "IPv6" },
  ],
  wlan0: [
    { address: "192.168.1.20", family: "IPv4" },
    { address: "fe80::1c2b:3aff:fe4d:5e6f%wlan0", family: "IPv6" },
  ],
};

it("accepts loopback hosts with any port", () => {
  const allowed = hostAllowlist({}, {});
  for (const host of [
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "127.0.0.1:42628",
    "[::1]",
    "[::1]:3000",
  ]) {
    expect(isAllowedHost(host, allowed)).toBe(true);
  }
});

it("accepts this machine's interface addresses", () => {
  const allowed = hostAllowlist({}, interfaces);
  expect(isAllowedHost("192.168.1.20:3000", allowed)).toBe(true);
  expect(isAllowedHost("192.168.1.20", allowed)).toBe(true);
  expect(isAllowedHost("[fe80::1c2b:3aff:fe4d:5e6f]:3000", allowed)).toBe(true);
  expect(isAllowedHost("192.168.1.21:3000", allowed)).toBe(false);
});

it("rejects a host name nobody listed", () => {
  const allowed = hostAllowlist({}, interfaces);
  for (const host of [
    "rebind.attacker.example",
    "rebind.attacker.example:3000",
    "pocketcheck.local",
  ]) {
    expect(isAllowedHost(host, allowed)).toBe(false);
  }
});

it("accepts names listed in ALLOWED_HOSTS", () => {
  const allowed = hostAllowlist({ ALLOWED_HOSTS: " PocketCheck.local , desk.lan:3000,," }, {});
  expect(isAllowedHost("pocketcheck.local:3000", allowed)).toBe(true);
  expect(isAllowedHost("desk.lan", allowed)).toBe(true);
  expect(isAllowedHost("other.local", allowed)).toBe(false);
});

it("ignores case and port and requires a well-formed port", () => {
  const allowed = hostAllowlist({}, interfaces);
  expect(isAllowedHost("LocalHost:8080", allowed)).toBe(true);
  expect(isAllowedHost("localhost:", allowed)).toBe(false);
  expect(isAllowedHost("localhost:abc", allowed)).toBe(false);
  expect(isAllowedHost("localhost@rebind.attacker.example", allowed)).toBe(false);
});

it("requires brackets around an IPv6 host", () => {
  const allowed = hostAllowlist({}, interfaces);
  expect(isAllowedHost("[::1]:3000", allowed)).toBe(true);
  expect(isAllowedHost("::1", allowed)).toBe(false);
  expect(isAllowedHost("[::2]", allowed)).toBe(false);
  expect(hostAllowlist({ ALLOWED_HOSTS: "[fd00::5]" }, {}).has("fd00::5")).toBe(true);
});

it("rejects a missing or empty Host", () => {
  const allowed = hostAllowlist({}, interfaces);
  expect(isAllowedHost(undefined, allowed)).toBe(false);
  expect(isAllowedHost("", allowed)).toBe(false);
});

it("describes the allowlist as browser hosts", () => {
  expect(describeHosts(hostAllowlist({ ALLOWED_HOSTS: "pc.local" }, interfaces))).toBe(
    "localhost, 127.0.0.1, [::1], 192.168.1.20, [fe80::1c2b:3aff:fe4d:5e6f], pc.local",
  );
});

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
