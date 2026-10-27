// Serves the built application over plain HTTP. It stays on loopback unless
// HOST opts in to the network.
//
// The Node adapter assumes HTTPS unless a protocol header says otherwise, and a
// browser never sends one. This server is plain HTTP, so it declares that on
// every request. The production form check then compares the browser's Origin
// with http://<the address the browser used>, which is the same origin.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { listenPlan } from "../src/lib/server/listen.ts";

const PROTOCOL_HEADER = "x-forwarded-proto";
const plan = listenPlan(process.env);
const port = Number(process.env.PORT || 3000);
process.env.PROTOCOL_HEADER = PROTOCOL_HEADER;

const { handler } = await import(new URL("../build/handler.js", import.meta.url).href);

const server = createServer((req, res) => {
  req.headers[PROTOCOL_HEADER] = "http";
  handler(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
});

server.listen(port, plan.host, () => {
  if (plan.warning) console.warn(plan.warning);
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
