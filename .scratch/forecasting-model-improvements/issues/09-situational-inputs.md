# 09: Situational inputs

**What to build:** The forecasting model adds situational inputs computed from the schedule and stadium data:

- travel distance and time zones crossed
- rest differential, short week, and coming off a bye
- international venue and altitude
- roof and surface

Each is kept only if the ablation shows a gain.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Inputs are computed only from schedule and stadium facts known before the cutoff
- [ ] Neutral and international venues are handled explicitly, not treated as home
- [ ] Feature definitions are named and versioned in the artifact
- [ ] The ablation result and keep or drop decision are recorded
- [ ] `npm run verify` passes
