# 09: Situational inputs

**What to build:** The forecasting model adds situational inputs computed from the schedule and stadium data:

- travel distance and time zones crossed
- rest differential, short week, and coming off a bye
- international venue and altitude
- roof and surface

Each is kept only if the ablation shows a gain.

**Blocked by:** 03

**Status:** resolved

- [x] Inputs are computed only from schedule and stadium facts known before the cutoff
- [x] Neutral and international venues are handled explicitly, not treated as home
- [x] Feature definitions are named and versioned in the artifact
- [x] The ablation result and keep or drop decision are recorded
- [x] `npm run verify` passes

## Answer

- Travel distance and time zones crossed (from each club's season home stadium to the game's stadium), international site, elevation, closed roof, and turf, from the schedule and a stadium table (`sources/venues.ts`). Time zones are the nearest 15-degree meridian. An unknown stadium reads as no information. A neutral or international site is not a home game: the designated home club travels from its own base.
- Rest differential, short week, and bye already existed.
- Features and parameters are named and versioned in the artifact (version 6).
- Ablation (2022-2025): travel helps the total but harms the spread, venue shows nothing, and the rest/bye group is dropped. All are excluded through `excludedGroups`; the code stays so they can be re-tested.
