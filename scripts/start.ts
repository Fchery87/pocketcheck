// Serves the built application over plain HTTP. It stays on loopback unless
// HOST opts in to the network.
//
// The Node adapter assumes HTTPS unless a protocol header says otherwise, and a
// browser never sends one. This server is plain HTTP, so it declares that on
// every request. The production form check then compares the browser's Origin
// with http://<the address the browser used>, which is the same origin.
//
// Because Origin is compared with Host, a DNS-rebinding page would pass that
// check. So every request's Host must be loopback, one of this machine's IP
// addresses, or a name in ALLOWED_HOSTS before it reaches the application.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import {
  describeHosts,
  hostAllowlist,
  isAllowedHost,
  listenPlan,
} from "../src/lib/server/listen.ts";

const PROTOCOL_HEADER = "x-forwarded-proto";
const plan = listenPlan(process.env);
let allowed = hostAllowlist(process.env, networkInterfaces());
const port = Number(process.env.PORT || 3000);
process.env.PROTOCOL_HEADER = PROTOCOL_HEADER;

const { handler } = await import(new URL("../build/handler.js", import.meta.url).href);

function hostAllowed(host: string | undefined): boolean {
  if (isAllowedHost(host, allowed)) return true;
  // The computer may have joined a network or taken a new address since startup.
  allowed = hostAllowlist(process.env, networkInterfaces());
  return isAllowedHost(host, allowed);
}

const server = createServer((req, res) => {
  if (!hostAllowed(req.headers.host)) {
    res.writeHead(421, { "content-type": "text/plain; charset=utf-8" });
    res.end(
      "PocketCheck refused this request: its Host is not an allowed host. " +
        "Open PocketCheck by its IP address, or add the name to ALLOWED_HOSTS.\n",
    );
    return;
  }
  req.headers[PROTOCOL_HEADER] = "http";
  handler(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
});

server.listen(port, plan.host, () => {
  if (plan.warning) console.warn(plan.warning);
  console.log(`Allowed hosts: ${describeHosts(allowed)} (any port; add names with ALLOWED_HOSTS)`);
  const address = server.address() as AddressInfo;
  const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
  console.log(`Listening on http://${host}:${address.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
