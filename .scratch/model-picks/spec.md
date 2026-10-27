# PocketCheck game board and model picks

Status: ready-for-agent
Type: task
Test seams confirmed by the user on 2026-10-26.
Decisions: the user accepted every recommendation from the 2026-10-26 grilling round. See [ADR 0002](../../docs/adr/0002-show-unvalidated-model-picks.md).

## Problem Statement

The user looks at a game on their sportsbook and wants to know which side to take and why. PocketCheck makes them enter one side of one market, add their own evidence, and read a report. Every report ends in "insufficient evidence" because no market has passed the release gate. The forecasting model already computes probabilities on every run, but the policy hides them. The user has no quick way to enter what the sportsbook shows for both teams and get a named side with reasons.

The user also mixes up the drafter (Grok 4.7 through TheClawBay) with the forecasting model. They need the app to make clear which part chose the side and which part explained it.

## Solution

Add a game board: the user picks an upcoming game, chooses a sportsbook, and enters both sides of any of the moneyline, spread, and total, exactly as the sportsbook lists them. One submission runs the existing evidence collection and the forecasting model, then produces one model pick per entered market.

Each model pick names a side and gives it a strength grade of strong, lean, or no edge. The grade is computed in code from the entered prices. Code-computed reasons come with it: the model's probability for each side, the no-vig probability implied by the prices, expected value per unit, the minimum price that would keep the pick, the inputs that moved the forecast most, and the evidence gaps. The selected drafter then writes a readable explanation from those facts, including the strongest case for the other side. It cannot change the side, the grade, or any number.

While a market is unreleased, its picks are labeled "Unvalidated model pick" and say plainly that the forecasting model has not beaten the closing market. The release gate, the research analysis policy, and the prospective protocol are unchanged. Every model pick is frozen before kickoff and graded by settlement, so the journal shows over time whether the picks hold up.

The board is the quick path. The user's own evidence and private lean are optional on it. The full research analysis flow stays as it is.

## User Stories

1. As a bettor, I want to start a game board from the home page, so that I can get a pick without going through the full research flow.
2. As a bettor, I want to choose an upcoming game from the schedule, so that the board is tied to a real matchup and kickoff.
3. As a bettor, I want to enter the sportsbook name once for the board, so that every price on it shares that sportsbook.
4. As a bettor, I want to enter the observation time once for the board, defaulting to now, so that the prices are timestamped.
5. As a bettor, I want to enter the moneyline for both teams, so that the system can compare the two sides.
6. As a bettor, I want to enter the spread line and odds for both teams, so that the system can compare the two spread sides.
7. As a bettor, I want to enter the total and the over and under odds, so that the system can compare the two total sides.
8. As a bettor, I want each market on the board to be optional, so that I can enter only what I care about.
9. As a bettor, I want to enter the home spread line once and see the away line filled in as its mirror, so that I don't mistype the opposite number.
10. As a bettor, I want a board that has neither side of any market to be rejected, so that I don't run an empty analysis.
11. As a bettor, I want a market with only one side entered to be rejected with a clear reason, so that the system always compares two real prices.
12. As a bettor, I want a spread whose two lines are not mirrors to be rejected, so that the comparison is between two sides of the same contract.
13. As a bettor, I want to choose the moneyline tie rule, so that tie handling matches my sportsbook.
14. As a bettor, I want invalid odds rejected, such as −50 or +99, so that impossible prices never reach the math.
15. As a bettor, I want my typed values kept when the board is rejected, so that I only fix the mistake.
16. As a bettor, I want a board for a game that has already started rejected, so that every pick is pregame.
17. As a bettor, I want to optionally add my own evidence before submitting, so that fresh injury or weather news can clear a gap.
18. As a bettor, I want to optionally record a private lean before seeing the picks, so that I can later compare my instinct with the system's.
19. As a bettor, I want one model pick for each market I entered, so that I know which side the system prefers in each.
20. As a bettor, I want every model pick to name a side, even when neither side looks good, so that I always get an answer.
21. As a bettor, I want a strength grade of strong, lean, or no edge on each pick, so that I know how much the numbers support it.
22. As a bettor, I want "no edge" to say that neither side clears the sportsbook's margin, so that I don't mistake the less-bad side for a good bet.
23. As a bettor, I want "strong" to mean the conservative expected value clears the versioned threshold, so that the top grade matches the existing value test.
24. As a bettor, I want "lean" to mean positive expected value at the entered price that misses the conservative threshold, so that the middle grade is honest.
25. As a bettor, I want a pick never graded strong while material evidence is missing, so that missing injury or weather coverage limits confidence.
26. As a bettor, I want to see the model's win, loss, and push probabilities for both sides, so that I can check the pick.
27. As a bettor, I want to see the no-vig probability for both sides, so that I can see what the sportsbook's prices imply.
28. As a bettor, I want to see the sportsbook margin for each market, so that I know how much the prices take.
29. As a bettor, I want to see expected value per unit for both sides at the entered prices, so that I understand why one side was chosen.
30. As a bettor, I want to see the minimum odds at which the pick would still meet its grade, so that I know when a worse price should change my mind.
31. As a bettor, I want to see the inputs that moved the forecast most, such as quarterback, form, rest, and home field, so that I understand what the forecasting model is reacting to.
32. As a bettor, I want to see the evidence gaps on each pick, so that I know what the forecasting model did not know.
33. As a bettor, I want a plain-language explanation written by my selected drafter, so that the numbers are easy to read.
34. As a bettor, I want the explanation to include the strongest case for the other side, so that I can challenge the pick.
35. As a bettor, I want the explanation to cite only supplied evidence, so that the drafter cannot invent facts.
36. As a bettor, I want the run to fail visibly when the drafter's text contradicts the pick, grade, or numbers, so that a wrong explanation is never saved as the result.
37. As a bettor, I want the board's numbers and pick saved before drafting, so that a drafter failure does not lose the pick.
38. As a bettor, I want the page to say which part chose the side (the forecasting model) and which part wrote the explanation (the drafter and its model ID), so that I know what to trust.
39. As a bettor, I want an unreleased market's picks labeled "Unvalidated model pick" with a note that the forecasting model has not beaten the closing market, so that I size my trust correctly.
40. As a bettor, I want a released market's picks labeled "Released model pick" with the existing reminder that release is not a profitability claim, so that the label follows real evidence.
41. As a bettor, I want a clear reason instead of a pick when the forecasting model is unavailable, so that I know why no side was named.
42. As a bettor, I want the reason shown when the forecasting model's training includes this game or its cutoff is wrong, so that leaked forecasts are never shown as picks.
43. As a bettor, I want the board, its prices, its picks, and its reasons frozen when the run finishes, so that later schedule or price changes never rewrite them.
44. As a bettor, I want to refresh a board with new prices for the same game, so that I can see whether a line move changed the pick.
45. As a bettor, I want a refresh linked to its parent with the parent unchanged, so that I can compare the two.
46. As a bettor, I want to record an actual bet from a model pick with the picked contract filled in as editable starting values, so that logging what I placed is quick.
47. As a bettor, I want the actual bet to keep its own contract even when it comes from a pick, so that a different line or price I took is recorded as placed.
48. As a bettor, I want each board in the journal with its game, sportsbook, observation time, and picks, so that I can find it later.
49. As a bettor, I want each model pick graded when the game's final settlement is recorded, so that I can see whether it won, lost, or pushed.
50. As a bettor, I want a settlement correction to regrade model picks and keep the earlier grade in history, so that corrections stay traceable.
51. As a bettor, I want a separate model-pick performance view, so that system picks are never mixed with my actual bets or with research assessments.
52. As a bettor, I want model-pick performance to count only the primary model pick per game and market, so that refreshes do not inflate the sample.
53. As a bettor, I want model-pick performance broken down by market and by strength grade, so that I can see whether "strong" beats "no edge".
54. As a bettor, I want model-pick performance to show settled, unresolved, push, and void counts and the return denominator, so that unavailable results are never shown as zero.
55. As a bettor, I want a closing comparison on each model pick when a comparable close is recorded, so that I can see whether the pick beat the closing price.
56. As a bettor, I want each pick's frozen forecast recorded under the prospective protocol, so that my picks become release evidence over time.
57. As a bettor, I want boards and model picks included in journal export and restore, so that my history survives a backup.
58. As a bettor, I want the board to work well on my phone, so that I can enter prices while looking at my sportsbook app.
59. As a bettor, I want an opt-in way to open PocketCheck from my phone on my home network, with a clear warning that it has no login, so that I can use it away from my desk.
60. As a bettor, I want the handbook to explain the forecasting model, the drafter, no-vig probability, and the strength grades, so that I can read a pick correctly.

## Implementation Decisions

- **Glossary.** Use the new glossary terms throughout: game board, model pick, strength grade, unvalidated model pick, forecasting model, drafter. In code and copy, "pick" is always "model pick" and never names an actual bet.
- **Game board record.** A new journal record, separate from the analysis snapshot. It freezes the game snapshot, the sportsbook, the observation time, the decision cutoff, both sides' prices for each entered market (with point lines and the moneyline tie rule), evidence, gaps, forecasting model identity, frozen forecasts, model picks, the drafter identity, and provider attempts. It has its own submission identifier with the same idempotency and conflict rules as analyses. Do not copy a board into an analysis snapshot or the reverse.
- **Board parsing at the edge.** Parse a board into per-market two-sided offers. Reuse the existing offer parsing and opposing-price compatibility checks. Each side becomes a full offer with the other side as its opposing price. Reject: an empty board, a one-sided market, non-mirrored spread lines, over and under with different totals, invalid American odds, a missing moneyline tie rule, and an observation time at or after kickoff. Rejection returns the typed values.
- **Model pick calculation (pure, deterministic).** Inputs: the market's two offers, the forecasting model's outcome probabilities for each side, the conservative probabilities from the uncertainty assessment, release status for the market, and whether material evidence is missing. Steps:
  - Calculate expected value per unit for each side at its own decimal price, counting pushes.
  - The picked side has the higher expected value. On an exact tie, take the higher model win probability. If that also ties, take home (or over) and grade it no edge.
  - Grade **strong** when the picked side's conservative expected value exceeds the versioned threshold and no material evidence is missing. Grade **lean** when its point expected value is positive but it misses strong. Otherwise grade **no edge**.
  - Output: picked side, grade, both sides' probabilities, no-vig probabilities, margin, expected values, conservative expected value, the price cutoff for the grade, release label, and a calculation version.
- **Version the pick calculation** separately from the research policy, so later grade changes do not reinterpret saved picks.
- **Forecast drivers.** Extend the forecasting model's prediction to return each feature's contribution to the predicted margin and total. For a ridge regression, that is the coefficient times the scaled deviation from the training mean. Reasons list the largest contributors for the market (margin for moneyline and spread, total for totals) with signed point effects. Drivers are recorded in the frozen forecast.
- **The research policy is unchanged.** Research analyses keep their existing conclusions. The release gate and the protocol `prospective-2026-10-26` are unchanged. Only the board surfaces probabilities for unreleased markets, and only inside a model pick labeled unvalidated.
- **Forecasting model unavailable.** When the artifact is missing, invalid, trained through the game, or cut off after the decision cutoff, that market gets no model pick and records the reason. The board still saves its prices, evidence, and gaps.
- **Drafter.** Add a pick-explanation draft to the drafter contract, implemented for TheClawBay, DeepSeek, and the fixture drafter. The packet contains the frozen picks, numbers, drivers, evidence, and gaps, and excludes the private lean. Report validation rejects text that names a different side, grade, or number than the frozen pick, matching the existing check that a thesis cannot override the policy conclusion. No automatic provider fallback.
- **Durability.** Save the board attempt before evidence collection, and save picks before drafting. Provider requests and accounting follow the existing attempt, recovery, and ambiguity rules. A finalization failure reuses the saved provider response.
- **Refresh.** A board refresh links to its parent, keeps the game, and may change sportsbook, prices, lines, and observation time for each market. Adding or dropping a market on refresh is allowed. Each model pick links to the parent pick in the same market when one exists.
- **Primary model pick.** For each game and market, the primary model pick is the earliest completed model pick whose cutoff is strictly before kickoff, frozen when its board finishes. It follows the same tie and legacy rules as the analysis primary. Model-pick performance counts only primaries.
- **Settlement and grading.** A final settlement notice for the game grades every model pick on that game from the picked side's own contract. Postponed and unresolved results stay unresolved. Corrections regrade and keep history. Choose one approach and record it in the store contract: either settlement notices are keyed to the game, or a board-scoped notice reuses the analysis notice semantics. Either way, the same event identifier must never produce two grades.
- **Performance.** Add a model-pick performance view, separate from assessment and actual-bet performance. It covers one unit on the picked contract, counts by market and grade, return and closing comparisons with explicit denominators, and push and void returning stake outside the return denominator.
- **Actual bet from a model pick.** The model pick page links to the existing actual-bet form with the picked contract prefilled as editable values. The saved actual bet stores its own contract and an optional reference to the model pick. It is validated independently, and saving it never changes the board.
- **Storage.** New Neon migrations for game boards, board markets, model picks, model pick grades, and the actual-bet reference. Apply them with `npm run db:migrate`. The memory journal implements the same contract.
- **Export and restore.** Journal export version 1 is the only restorable format, and adding board records changes its shape. Decide during implementation whether that needs version 2. If it does, restore must keep accepting version 1 unchanged, and the docs and AGENTS.md must be updated to say which versions restore.
- **UI.** A "Game board" entry on the home page, a board form (sportsbook, time, then one section per market with both sides side by side and the mirrored spread line), and a model pick page with one card per market. Each card shows the picked side, grade, release label, the probability and expected-value table for both sides, drivers, gaps, and the drafter's explanation, with forecasting model and drafter identities visibly separate. Follow DESIGN.md and ADR 0001: market and tie rule stay native selects, and the odds stepper stays plain Svelte.
- **Phone access.** Document an opt-in network run (host bound to the LAN address, matching origin configuration) with a warning that the journal has no authentication. The default stays 127.0.0.1.
- **Docs.** Update README (what the app does, model pick vs. research analysis), AGENTS.md Journal rules (game board and model pick separation, primary model pick, grading), the handbook page, and `docs/testing.md` for the browser fixture model.

## Testing Decisions

- Good tests drive the feature from its highest existing entry point and assert observable results: saved records, returned failures, outgoing provider requests, exports, and what the page shows. They do not assert private helpers or call order.
- **Seam 1: research run.** Extend the run-level tests that use the memory journal, a scripted `ModelSource`, and the fixture drafter. Cover:
  - A two-sided board produces one saved model pick per market with the expected side, grade, numbers, and drivers.
  - Grade boundaries: strong, lean, no edge, ties, and material gaps blocking strong.
  - Unavailable and leaked forecasting models give a reason and no pick.
  - The drafter packet excludes the private lean, and a contradicting explanation fails the run with the pick kept.
  - Boards with no market, one side, non-mirrored lines, or a started game are rejected.
  - Refresh linking leaves the parent unchanged.
  - Unknown provider usage stays unknown.
  - Prior art: the research run, research run evidence, and research run model suites, plus the policy tests' table style for grade boundaries.
- **Seam 2: shared storage contract.** Extend the store contract that runs against both the memory journal and an isolated Neon schema. Cover board and pick save and readback, submission idempotency and conflicts, primary model pick classification, settlement grading and correction history, the actual-bet reference, model-pick performance counts, and export plus restore round-trip and rejection. Prior art: the existing store contract and the journal and Neon integration tests.
- **Seam 3: browser acceptance.** Add a fixture forecasting model to `fixture-browser` mode (a checked-in artifact or deterministic stub, reported by `/__verification` instead of `model: "off"`). Startup must still reject unexpected configuration. One test enters a two-sided board, sees model pick cards with the unvalidated label and separate forecasting model and drafter identities, and records an actual bet from a pick with edited odds. One test checks that a rejected board keeps the typed values. Prior art: the existing research-flow test.
- A workflow counts as verified only after `npm run verify` and `TEST_DATABASE_URL=... npm run verify:database` pass.

## Out of Scope

- Removing or loosening the release gate, the prospective protocol, or the research analysis policy.
- Letting the drafter choose a side, a grade, or a probability, or an "AI opinion" pick.
- Improving the forecasting model's accuracy (market-anchored prior, play-by-play efficiency, quarterback availability, other news). That is a separate follow-up effort.
- Accounts, authentication, public hosting, or other users.
- Player props, alternate lines, first-half or quarter markets, parlays, live betting, other sports.
- Stake sizing, bankroll advice, or automatic bet placement.
- Pulling odds from a sportsbook or odds API. The user enters prices.
- Claims that a model pick is profitable or validated.

## Further Notes

The forecasting model currently scores worse than the no-vig closing market on all three markets (`docs/research/model-evaluation.md`). The user has been told that model picks are expected to be less accurate than the market until the forecasting model improves. The UI copy must keep saying so for unreleased markets.

ADR 0002 narrows the MVP spec's exclusion of forced picks. Treat that exclusion as superseded only for model picks on a game board.

Suggested increments:

1. Board parsing and the pick calculation with run-level tests.
2. Storage, migrations, and the store contract.
3. Drafter explanation and validation.
4. Board and pick pages with the browser fixture model.
5. Settlement grading, primary model picks, and performance.
6. Actual bet from a pick, export and restore, phone access docs, handbook.
