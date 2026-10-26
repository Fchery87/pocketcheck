import "./reject-outbound.mjs";
import { assertBrowserFixture } from "../src/lib/server/verification.ts";

assertBrowserFixture(process.env);
await import(new URL("../build/index.js", import.meta.url).href);
