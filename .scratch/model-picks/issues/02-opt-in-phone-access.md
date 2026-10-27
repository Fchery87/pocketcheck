# 02: Opt-in phone access on the home network

**What to build:** The user can open PocketCheck from their phone on their home network by deliberately opting in. The default stays bound to 127.0.0.1. The documented run mode sets the host and origin configuration so production form checks still pass from the phone. It warns plainly that the journal has no login and anyone on the network can reach it.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] README documents the opt-in network run: host binding, origin and protocol settings, and how to find the computer's address
- [x] The documentation and the startup log warn that there is no authentication when bound beyond loopback
- [x] Defaults are unchanged: dev, preview, and the documented Node command bind to 127.0.0.1, covered by a test
- [x] A same-origin form submission from the network origin succeeds and a mismatched origin is still rejected (403)
- [x] `npm run verify` passes

## Answer

`npm start` runs `scripts/start.ts`, a plain-HTTP launcher that declares `http` on every request, so the production form check passes from the address the browser used (phone included) and a mismatched origin still returns 403.
It binds to `127.0.0.1` by default; setting `HOST` to the computer's LAN address opts in, and the README and startup log then warn that PocketCheck has no login and anyone on the network can reach the journal.
Caveat: running `build/index.js` directly still listens on all interfaces unless `HOST` is set, so the README points users to `npm start`.
