# PocketCheck forecasting model improvements

Status: ready-for-agent
Type: task
Test seams confirmed by the user on 2026-10-26.
Depends on: [game board and model picks](../model-picks/spec.md). See [ADR 0003](../../docs/adr/0003-anchor-forecasts-on-the-market.md).

## Problem Statement

The user wants model picks that are as accurate as free information allows. The current forecasting model predicts each game from scratch using recency-weighted score margins, rest, home field, and an assumed starting quarterback. It scores worse than the no-vig closing market in moneyline, spread, and total, so its model picks are expected to be less accurate than the sportsbook's own prices.

The app already collects the injury report and the kickoff weather forecast, but neither reaches the forecast. It does not use the free nflverse play-by-play, depth charts, snap counts, or rosters. It cannot tell when a backup quarterback starts. The user also enters one sportsbook per board, so they cannot see which sportsbook offers the best price for the side they like.

## Solution

Rebuild the forecasting model in five steps, each judged by the same honest scoring the project already uses:

1. **Anchor on the market.** The forecast starts from the anchor line: the no-vig probability or line from the game board at decision time, or from the recorded close in history. The forecasting model learns only how far to move away from it.
2. **Quarterback availability.** Use the injury report and weekly depth charts to tell who is starting. Rate the starter and backup with play-by-play efficiency instead of assuming the usual starter.
3. **Team efficiency.** Replace score-margin form with opponent-adjusted play-by-play efficiency (EPA per play, success rate, passing and rushing splits, explosive play rate), with weekly updates and early-season starting ratings.
4. **Weather and pace for totals.** Feed forecast wind, precipitation, and temperature, plus team pace and pass tendency, into the total forecast.
5. **Weighted injuries and situational inputs.** Weight missing players by snap share and position, and add travel, time zones, short weeks, byes, altitude, roof, and surface.

Separately, the game board accepts quotes from several sportsbooks per side and uses the best available price for the model pick.

Every new artifact is scored against the no-vig close and its earlier version. An input is kept only if it improves held-out log loss. Close-anchored history is development evidence only; release still requires prospective forecasts under the frozen protocol.

## User Stories

1. As a bettor, I want the forecasting model to start from the sportsbook's own line, so that its picks are at least about as accurate as the market.
2. As a bettor, I want the forecasting model to explain how far it moved from the anchor line and why, so that I can see what it adds beyond the market.
3. As a bettor, I want a forecast without an anchor line marked unavailable, so that I never get a from-scratch guess passed off as the improved forecasting model.
4. As a bettor, I want the anchor line taken from my game board at decision time, so that the forecast uses the price I actually saw.
5. As a bettor, I want the anchor line recorded in the frozen forecast, so that the forecast can be reproduced and audited later.
6. As a bettor, I want close-anchored historical scores labeled development evidence, so that I don't mistake them for real-world accuracy.
7. As a bettor, I want the forecasting model to know when the usual quarterback will not start, so that the forecast reacts to the biggest single factor.
8. As a bettor, I want each starter to be known, assumed, or unknown, with the source and time behind it, so that I know how sure the forecasting model is about who plays.
9. As a bettor, I want an "out" or "doubtful" injury designation for the usual starter to switch the forecast to the depth-chart backup, so that backup starts are priced.
10. As a bettor, I want an unknown starter shown as a material gap on the model pick, so that the grade cannot be strong while the quarterback is uncertain.
11. As a bettor, I want quarterbacks rated by play-by-play efficiency, so that the rating reflects how the quarterback plays, not just team scores.
12. As a bettor, I want quarterbacks with few starts shrunk toward a replacement level, so that a backup with two good games is not overrated.
13. As a bettor, I want team strength measured by opponent-adjusted efficiency per play, so that noisy final scores matter less.
14. As a bettor, I want separate offense and defense efficiency for passing and rushing, so that the forecast captures matchups.
15. As a bettor, I want team ratings updated after every completed game, so that the forecast reflects current form.
16. As a bettor, I want early-season ratings to start from last season's ratings shrunk toward average, so that week 1 is not treated as if every team were equal.
17. As a bettor, I want turnover and fumble-recovery luck discounted, so that teams that got lucky are not overrated.
18. As a bettor, I want the total forecast to use forecast wind, precipitation, and temperature, so that weather moves totals when it should.
19. As a bettor, I want a dome or closed-roof game to ignore outdoor weather, so that weather only applies where it matters.
20. As a bettor, I want the total forecast to use team pace and pass tendency, so that fast, pass-heavy matchups are expected to score more.
21. As a bettor, I want missing players weighted by recent snap share and position value, so that losing a starting left tackle matters more than losing a reserve.
22. As a bettor, I want practice participation trend across the week used where it is published before the cutoff, so that late status changes count.
23. As a bettor, I want offensive line starters missing counted, so that a depleted line lowers the forecast.
24. As a bettor, I want travel distance, time zones crossed, short weeks, byes, altitude, international venues, roof, and surface included, so that small situational effects add up.
25. As a bettor, I want every input to come only from information available strictly before the decision cutoff, so that the forecasting model never trains or predicts on hindsight.
26. As a bettor, I want each missing or malformed source to become a visible gap, so that a broken download never silently changes a forecast.
27. As a bettor, I want large play-by-play files kept on my computer and only compact features stored in the journal, so that Neon stays small.
28. As a bettor, I want a data command for each new source that records its retrieval time, so that I can refresh data before analyzing.
29. As a bettor, I want each data source's license and attribution kept with it, so that I stay within its terms.
30. As a bettor, I want every new forecasting model scored against the no-vig close and the previous artifact on the same games, so that I can see if it improved.
31. As a bettor, I want each input group kept only when it improves held-out log loss, so that the forecasting model doesn't grow features that add noise.
32. As a bettor, I want an ablation report showing what each input group contributed, so that I know which information helps.
33. As a bettor, I want calibration checked for every new artifact, so that a 60% forecast wins about 60% of the time.
34. As a bettor, I want a weekly refit command that produces a new, checksummed, unreleased artifact, so that ratings stay current without manual steps.
35. As a bettor, I want each model pick to record which artifact produced it, so that results can be compared across artifact versions.
36. As a bettor, I want prospective forecasts from the new forecasting model frozen under the existing protocol, so that it can earn release on real games.
37. As a bettor, I want closing-line value summarized per artifact, so that I can tell within weeks whether picks beat the final price.
38. As a bettor, I want older artifacts rejected with a clear "refit required" reason, so that a stale format never produces picks.
39. As a bettor, I want to enter the same side's price from several sportsbooks on one board, so that I can shop for the best price.
40. As a bettor, I want the model pick to use the best available price for its side, so that expected value reflects the best price I can actually get.
41. As a bettor, I want to see every sportsbook's price and which one is best, so that I know where to bet.
42. As a bettor, I want quotes with different point lines kept as different contracts, so that a better price on a worse line is not called better.
43. As a bettor, I want the anchor line computed from a single sportsbook's two sides, never mixed across books, so that the no-vig calculation stays valid.
44. As a bettor, I want an actual bet recorded from a model pick to fill in the best sportsbook and price as editable values, so that logging the shopped bet is quick.
45. As a bettor, I want the handbook to explain the anchor line, the new inputs, and line shopping, so that I understand how picks are made.
46. As a bettor, I want no claim that the improved forecasting model is profitable until the release protocol says so, so that improvement isn't confused with proof.

## Implementation Decisions

- **Vocabulary.** Use the glossary terms anchor line, best available price, forecasting model, drafter, model pick, game board.
- **Artifact version.** The improved forecasting model is a new artifact version with its own kind identifier and checksum. It records feature definitions, source datasets with hashes and retrieval times, chronology rules, the anchor definition, fit parameters, residual distributions, calibration, and the ablation results it was chosen from. Version 4 artifacts are rejected with a refit-required reason. The release gate and protocol `prospective-2026-10-26` are unchanged. A new artifact starts unreleased.
- **Market anchor (step 1).**
  - **Moneyline:** the anchor is the no-vig home win probability, converted to an implied mean margin through the existing margin distribution.
  - **Spread:** the anchor is the home line as an implied mean margin.
  - **Total:** the anchor is the total line as the implied mean total.
  - **What the model fits:** ridge regressions predict the outcome's deviation from the anchor mean. Shrinkage is strong enough that weak features stay near zero.
  - **Probabilities:** they still come from the residual distribution with key-number weights.
  - **No board, no forecast:** at decision time the anchor comes from one sportsbook's two sides on the game board (the first quote entered for that market, or a sportsbook the user marks). Without a two-sided quote, the market has no forecast.
  - **History:** the anchor is the recorded closing line. Rows without a recorded close are excluded and counted.
- **Evaluation honesty.** Close-anchored holdout scores are labeled development evidence in reports and docs. The comparison baseline stays the no-vig close. Each evaluation report also compares against the previous artifact on identical games and includes a per-input-group ablation (with and without), measured on log loss and Brier score with slate-clustered intervals.
- **Quarterback availability (step 2).**
  - **Starter state:** for each team, the starter is known, assumed, or unknown, with its source and source time. The rule: an injury designation of out or doubtful for the usual starter, published before the cutoff, makes the depth-chart backup the assumed starter. A timestamped depth chart before the cutoff gives a known starter. Otherwise the starter is the most frequent recent starter, marked assumed. Conflicting sources make it unknown.
  - **Material gap:** an unknown starter is a material gap.
  - **Quarterback rating:** recency-weighted EPA per dropback plus completion percentage over expected from play-by-play, with prior shrinkage toward a replacement level for few starts.
  - **Frozen forecast:** it records the starter state, the source, and the rating used. This extends the existing starter assumption record.
- **Team efficiency (step 3).** Per-game team aggregates from play-by-play: offensive and defensive EPA per play, split by passing and rushing, success rate, early-down EPA, explosive play rate, and pace. These become opponent-adjusted, recency-weighted ratings, updated after each eligible game under the existing result-availability chronology. Preseason ratings carry last season's ratings with shrinkage toward the mean. Turnover luck is handled by using EPA excluding fumble-recovery outcomes, or by regressing turnover margin, whichever wins the ablation.
- **Totals inputs (step 4).** Wind speed, precipitation probability, and temperature from the NWS forecast snapshot already collected at analysis time, applied only to outdoor and open-roof venues. Plus combined pace and pass rate over expected. Historical training cannot recreate past forecasts. Weather enters training only from prospectively saved forecast snapshots, and until enough exist, the weather adjustment is a documented fixed prior from the handbook research, versioned in the artifact and labeled as such.
- **Injuries and situational inputs (step 5).** Each player listed out or doubtful before the cutoff is weighted by their recent snap share times a position value (quarterback handled separately), summed per team and unit. Also: offensive line starters missing. Situational features come from the schedule and stadium data: travel distance, time zones crossed, rest differential, short week, off a bye, international venue, altitude, roof, surface.
- **Sources.** New source modules and data commands for nflverse play-by-play, weekly depth charts, snap counts, and weekly rosters. They follow the existing pattern: download to the local data directory with a sidecar retrieval record, parse at the edge, treat a malformed or missing payload as a gap, and keep large files out of Neon. Record each dataset's license with it, and keep FTN data out. Depth charts are used live only where timestamped (from 2025). Earlier seasons fall back to the assumed-starter rule for training.
- **Feature rows.** Feature construction keeps its contract: one row per game built only from eligible results, and a later result never changes an earlier row. New features are named and defined in the artifact's feature definitions.
- **Model drivers.** Driver contributions for model pick reasons (from the game board spec) report the adjustment from the anchor line, broken down by input group.
- **Weekly refit.** A command refits with the latest eligible data and writes a new unreleased artifact plus its evaluation report. It never overwrites the artifact the app is using without an explicit flag.
- **Line shopping.**
  - **Entry:** the game board accepts several sportsbook quotes per side, each with its own sportsbook, point line, odds, and observation time.
  - **Best price:** the best available price per side is the highest decimal odds among quotes with the same point line as the anchor sportsbook's line. Quotes on other lines are listed as other contracts, not compared on price.
  - **Pick and anchor:** the model pick's expected value and grade use the best available price. The anchor always uses one sportsbook's two sides.
  - **Records:** every quote is frozen with the board. An actual bet from a pick prefills the best sportsbook and price as editable values.
- **Closing-line value.** The model-pick performance view groups closing comparisons by artifact checksum.
- **Docs.** Update the model evaluation note, the free data audit (sources now used), the handbook, README, and AGENTS.md.

## Testing Decisions

- Good tests assert behavior visible from outside a module: the produced artifact, the evaluation report, the frozen forecast, saved board records, gaps, and what the page shows. Exact model coefficients are not asserted except in the existing reproducibility checks.
- **Seam 1: model pipeline.** Fit and evaluate on small checked-in fixtures, the way the existing baseline, chronology, features, residuals, and release tests do. Cover:
  - Anchor arithmetic per market, and rows without a close excluded and counted.
  - A synthetic signal planted in an input group is learned, and its ablation shows the gain.
  - No-leakage properties: a later result, a later injury designation, or a later depth chart never changes an earlier row or forecast.
  - Starter state rules and conflicts.
  - Weather applied only outdoors.
  - Version 4 artifacts rejected, and checksum tampering rejected.
  - The report labels close-anchored scores as development evidence.
  - Reproducible fits within the existing time budget.
- **Seam 2: source parsing.** Small checked-in samples of play-by-play, depth charts, snap counts, and rosters, parsed the way the existing injury and NWS source tests parse theirs. Malformed, empty, stale, and missing files become gaps and leave the rest readable. Retrieval time is recorded separately from publication time.
- **Seam 3: research run.** With a scripted model source and the memory journal, a game board run passes the board's anchor line, starter state, and weather into the forecast. The frozen forecast records them. A board without a two-sided quote yields no forecast with a reason. An unknown starter caps the grade below strong.
- **Seam 4: browser acceptance.** Enter two sportsbooks for one side. The model pick shows both prices and marks the best, a different-line quote is shown as another contract, and the actual bet prefills the best price.
- Verified only after `npm run verify` and `TEST_DATABASE_URL=... npm run verify:database` pass. Real-data fits and evaluations are run and reported in the model evaluation note, but are not part of automated verification.

## Out of Scope

- Changing the release gate, the prospective protocol, or the research analysis policy.
- Paid data: odds APIs, paid player grades, public betting splits.
- FTN charting data, Next Gen Stats, referee crews, special teams, coaching-change features, and model ensembles. These are candidates for a later spec after this one's ablations.
- Using the drafter to produce or adjust probabilities.
- Other sports, player props, alternate lines, live betting, stake sizing, automatic bet placement.
- Any claim that the improved forecasting model is profitable or released.

## Further Notes

Expected outcome: market anchoring should bring the forecasting model to roughly match the no-vig close. Quarterback, injury, and weather inputs may add small edges where news arrives before the line moves. Line shopping improves expected value at the price level, whatever the forecasting model's accuracy. None of this is guaranteed. Prospective tracking decides.

Because forecasts now depend on the market, agreement between the forecasting model and the market is not corroboration (ADR 0003).

Suggested order: sources (play-by-play, depth charts, snap counts, rosters) → market anchor with evaluation and ablation reporting → quarterback availability → team efficiency → weather and pace → weighted injuries and situational inputs → weekly refit → line shopping. Line shopping only depends on the game board spec, so it can run in parallel with the model work.
