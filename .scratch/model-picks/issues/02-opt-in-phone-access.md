# 02: Opt-in phone access on the home network

**What to build:** The user can open PocketCheck from their phone on their home network by deliberately opting in. The default stays bound to 127.0.0.1. The documented run mode sets the host and origin configuration so production form checks still pass from the phone. It warns plainly that the journal has no login and anyone on the network can reach it.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] README documents the opt-in network run: host binding, origin and protocol settings, and how to find the computer's address
- [ ] The documentation and the startup log warn that there is no authentication when bound beyond loopback
- [ ] Defaults are unchanged: dev, preview, and the documented Node command bind to 127.0.0.1, covered by a test
- [ ] A same-origin form submission from the network origin succeeds and a mismatched origin is still rejected (403)
- [ ] `npm run verify` passes
