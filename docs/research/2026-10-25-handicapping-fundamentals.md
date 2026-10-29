# Sports handicapping fundamentals

Research date: October 25, 2026. Purpose: a practical foundation for PocketCheck's research and evaluation design, beginning with NFL pregame markets and eventually expanding to NBA, college football, college basketball, and MLB.

This document distinguishes established definitions and mathematics from proposed research methods. Worked examples use invented probabilities; they do not identify actual betting opportunities. No method here promises profitable picks.

## What a handicapper is trying to establish

A handicapper studies an event to estimate how likely a particular outcome is. A value assessment then compares that probability with the price actually available. A likely winner can still be a poor bet when its price requires an even higher win probability. Conversely, an underdog does not need to be more likely than its opponent to offer positive expected value. The conversion between odds and probability is explained by the betting exchange [Smarkets](https://help.smarkets.com/hc/en-gb/articles/214058369-How-to-calculate-implied-probability-in-betting).

The object being evaluated must be precise: game, start time, selected team, market, point line if applicable, price, sportsbook, settlement rules, and the time that price was observed. “Team A is good” is not a probability for Team A −3.5 at −110. A moneyline, spread, and total are separate questions about the same game.

Proposed research sequence:

1. Identify the exact market and its break-even probability.
2. Collect information available before the analysis cutoff.
3. Describe team strength, matchup, availability, and context using defined metrics.
4. Compare competing explanations and explicit uncertainties.
5. If a separately validated probability model exists, calculate its price-relative estimate. Otherwise produce a sourced research assessment without inventing a probability or EV.
6. Record the assessment before the outcome and later evaluate it against results and the market.

These are design recommendations, not a claim that this checklist creates an edge.

## The mathematics of the offered price

Let `A` be American odds, `d` decimal odds including returned stake, and `q` the price's break-even probability when there is no push.

| Offered odds | Decimal odds           | Break-even probability        |
| ------------ | ---------------------- | ----------------------------- |
| Positive `A` | `d = 1 + A / 100`      | `q = 100 / (A + 100)`         |
| Negative `A` | `d = 1 + 100 / abs(A)` | `q = abs(A) / (abs(A) + 100)` |

For example, −110 means risking $110 to profit $100; +130 means risking $100 to profit $130. In either format `q = 1 / d`. These equations describe the offered price, not the event's true probability. [Source: Smarkets odds conversion](https://help.smarkets.com/hc/en-gb/articles/214058369-How-to-calculate-implied-probability-in-betting).

### Expected value

For a $1 stake with probabilities `p_win`, `p_lose`, and `p_push` summing to one:

```text
EV = p_win × (d − 1) − p_lose
```

A push contributes zero net profit because the stake is returned. With no push, `p_lose = 1 − p_win`, so:

```text
EV = p_win × d − 1
Expected net profit for stake S = S × EV
```

This is an average over hypothetical repetitions at the same probabilities and price. It does not predict the next game's result. The general expected-value definition sums each net payoff multiplied by its probability. [Source: Wizard of Odds' mathematical explanation](https://wizardofodds.com/article/expected-value-in-player-prop-betting/).

“Probability edge” in percentage points and EV as a percentage of stake are different quantities. For no-push bets, probability edge is `p_win − q`; EV is `p_win × d − 1`.

### Worked example: −110

At −110, `d = 1.9090909` and `q = 52.38095%`. Suppose a model genuinely estimates 55% wins for a market without pushes:

```text
Probability edge = 55% − 52.38095% = 2.61905 percentage points
EV = 0.55 × 1.9090909 − 1 = 0.05
```

That is an estimated $5 net profit per $100 staked over repetitions under those assumptions. If the true chance is 51%, EV becomes approximately −2.64%. The conclusion depends on the credibility of the probability estimate, not how confidently a report describes it. These figures are direct calculations from the equations above.

### Vig and a −150 / +130 example

Bookmaker prices for exhaustive, mutually exclusive outcomes commonly imply probabilities summing above 100%. The excess is called overround. Removing it requires an assumption about how margin is allocated; there is no unique transformation that reveals the true probabilities. A bookmaker's explanation of why margin need not be allocated uniformly is useful here. [Source: Pinnacle on favorite–longshot bias and margin allocation](https://www.pinnacle.bet/betting-resources/en/betting-strategy/why-the-favourite-longshot-bias-is-not-a-bias/qjb2prcq4q96nftd?page=7).

For a hypothetical two-outcome market with no draw or push:

```text
Favorite −150: q_F = 150 / 250 = 0.60
Underdog +130: q_U = 100 / 230 = 0.4347826
Sum = 1.0347826
Overround = 3.47826 percentage points
```

A simple _proportional_ removal rule is:

```text
p_i_market = q_i / sum(q_j)
Favorite: 0.60 / 1.0347826 = 57.98319%
Underdog: 0.4347826 / 1.0347826 = 42.01681%
```

These are market-derived reference estimates under the proportional assumption. They are not independently estimated probabilities. Using those estimates against the same original prices gives approximately −3.36% EV on either side. Overround and expected loss per dollar are not the same percentage.

Suppose an independently validated model estimates the favorite at 62%. At −150, `d = 1.6666667`, giving `EV = 0.62 × 1.6666667 − 1 = +3.33333%`. A 58% estimate gives approximately −3.33333%. Being the likely winner alone does not establish value. These are arithmetic examples, not actual recommendations.

De-vigging needs all exhaustive sides of the _same market_: same game, line, period, rules, book, and timestamp. Mixing Team A −3.5 with Team B +4.5 does not form complementary outcomes. Combining each side's best price across books is not a single book's margin. A one-sided user entry supports a break-even calculation but not a complete-market de-vig calculation.

### Pushes and NFL ties

A whole-number spread or total can push. If estimated probabilities are 52% wins, 44% losses, and 4% pushes at −110:

```text
EV = 0.52 × (100 / 110) − 0.44 = 0.0327273
Conditional win rate among decisive results = 0.52 / 0.96 = 54.16667%
```

The familiar 52.38% threshold at −110 applies to the conditional decisive-result win rate. It is not an unconditional threshold when pushes occur. Half-point lines remove score-equality pushes, but unusual voids still depend on house rules. Moneyline handling of an NFL tie also depends on the market's settlement rules. Store the rules; do not silently map a tied game to a loss or a win. This section follows directly from the three-outcome payoff equation.

### Kelly criterion: educational context only

Kelly's original framework maximizes expected logarithmic wealth growth under specified probabilities and payoffs. For an isolated binary bet with no push, profit multiple `b = d − 1`, win probability `p`, and loss probability `1 − p`, the unconstrained optimum is:

```text
f* = [b × p − (1 − p)] / b
```

Restricting to a nonnegative wager gives zero when this expression is negative. At −110 and an assumed 55% chance, full Kelly is 5.5% of bankroll. That number illustrates sensitivity to assumptions; it is not a recommended stake. Estimated probabilities, correlated positions, changing odds, and constraints violate the simplified setup. Fractional Kelly reduces exposure but cannot turn an incorrect probability into a correct one. PocketCheck's proposed initial scope has **no staking recommendation feature**. [Primary source: J. L. Kelly Jr., 1956, “A New Interpretation of Information Rate”](https://www.princeton.edu/~wbialek/rome/refs/kelly_56.pdf).

## NFL evidence: what to research and how to define it

An information source and a feature are different things. An official availability report documents status; deciding how that status affects a game's probability requires another model. A strong thesis should show both what was observed and what interpretation is being proposed.

### Core metric definitions

The following definitions provide a consistent starting vocabulary. nflfastR's documentation demonstrates EPA aggregation and identifies important play-classification differences, such as treating sacks and scrambles as passing plays for some analytical fields. [Primary implementation documentation: nflfastR examples](https://nflfastr.com/articles/nflfastR.html), [beginner's guide](https://nflfastr.com/articles/beginners_guide.html).

| Metric                     | Meaning                                                                                          | Required caution                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Expected points, EP        | A model's estimate of the scoring value of a game situation.                                     | Depends on model version, state variables, and perspective; not a game's projected total.              |
| Expected points added, EPA | Change in situation value attributable to a play, accounting for scoring and possession changes. | Use the provider's convention; a turnover requires a consistent possession perspective.                |
| EPA per play               | Mean EPA over a declared play sample.                                                            | State whether kneels, spikes, penalties, sacks, and garbage-time plays are included.                   |
| EPA-based success rate     | Fraction of eligible plays with EPA greater than zero.                                           | Other providers use down-and-distance yardage thresholds. Do not merge definitions.                    |
| Dropback efficiency        | Passing-process performance across the provider's declared dropbacks.                            | Define inclusion of sacks, scrambles, and penalties; attempts alone are a different denominator.       |
| Defensive EPA allowed      | Offensive EPA yielded to opponents.                                                              | Lower is generally better from the defense's perspective; declare the sign convention.                 |
| Opponent adjustment        | Estimating performance relative to the quality of opponents faced.                               | Raw EPA is not automatically opponent-adjusted. The adjustment must be fitted using prior information. |

For EP's meaning, see the NFL's technology partner's [description of the expected-points model](https://press.aboutamazon.com/2020/9/aws-and-the-national-football-league-announce-new-next-gen-stats-powered-by-aws-for-the-2020-season). EPA-based success aggregation is illustrated in the nflfastR guide linked above. Definitions are not evidence that any single metric beats market prices.

### Proposed NFL research checklist

These are candidate research dimensions to evaluate, rather than proven predictive weights:

- **Underlying team strength:** offensive and defensive EPA/play, passing versus rushing splits, success rate, sample size, and opponent quality. Describe both full-season and recent samples without cherry-picking whichever supports the preferred team.
- **Quarterback and lineup:** expected starter, practice participation, injury designation, replacement uncertainty, offensive-line combinations, and relevant defensive absences. A player's presence and expected effectiveness are separate assumptions.
- **Matchup:** pressure versus protection, personnel, coverage, run/pass tendencies, and explosive-play exposure. Avoid asserting a matchup advantage without comparable definitions and adequate observations.
- **Context:** venue, rest days, travel, weather forecast available at the cutoff, and coaching or lineup changes. Quantify effects only when a fitted method supports them; a windy forecast alone is not a numerical total adjustment.
- **Game state:** trailing teams behave differently from leading teams. Specify filtering or modeling choices before seeing results. Removing all inconvenient plays after the fact introduces selection bias.
- **Market information:** offered line and price, timestamp, competing prices, movement, and house rules. Movement is an observation; attributing it to “sharp money” requires evidence unavailable from the line alone.
- **Countercase:** identify evidence favoring the other side, missing information, and what news or price change would invalidate the thesis.

NFL weekly injury feeds can include practice status, but update timing is specific to the provider. [Sportradar's NFL injury documentation](https://developer.sportradar.com/football/reference/nfl-weekly-injuries) documents a four-hour cache and recommends pulls based on use case. nflverse publishes [pipeline schedules and availability](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html); check live status and coverage rather than assuming the presence of a loader guarantees current-season completeness. Neither a current report nor a historical final status proves the exact report was available before a past recommendation.

## From research to a probability: candidate methods and pitfalls

The methods below are proposed modeling options, not validated PocketCheck components. They require separate datasets, implementation, and evaluation before supplying probabilities to a report.

### Baselines first

The forecasting model starts from the anchor line, the no-vig price from one sportsbook's two sides, and learns only an adjustment to it. The anchor is never mixed across sportsbooks. A forecast without both sides is unavailable. Line shopping uses the best price on that same point line. A price on a different line is a different contract. Close-anchored historical scores are development evidence and do not show that the model beats the market.

A market baseline uses complete, contemporaneous prices with an explicit de-vig method. A simple statistical baseline can use previously observed team-strength ratings, home field, and declared availability variables to predict margin or outcome. Compare more complex models against these baselines on the same dates and eligible events. A complicated model should not receive credit merely for predicting favorites successfully.

An illustrative margin model is:

```text
M = home points − away points
Estimated mean margin μ = home strength − away strength + fitted home/context terms
```

Predicting `μ` is insufficient to calculate the chance of covering. The distribution of errors around `μ` is also needed. If, for illustration, `M` is approximated as normal with fitted standard deviation `σ`, then a home team laying `k` points has approximate cover probability `1 − Φ((k − μ) / σ)`. This continuous approximation assigns zero chance to an exact margin and therefore cannot properly price NFL whole-number pushes or scoring concentrations such as margins of 3 and 7. Do not use it unexamined for production recommendations.

Alternatives worth testing include a discrete margin distribution, historical residual resampling conditioned on relevant contexts, or a joint score/drive simulation. Each requires justification and calibration. More simulation draws reduce numerical simulation noise; they do not establish that the underlying model is correct.

For totals, model `T = home points + away points` and its uncertainty. Separately predicted team means do not determine the variance or correlation of scores. Independent Poisson scores are a possible toy baseline, but their independence and equal-mean/variance assumptions need testing; NFL scoring increments, possessions, and game-state dependence make automatic adoption inappropriate. These caveats follow from the mathematical assumptions, not a claim that one particular alternative is best.

One general danger is double counting: an injury may already be reflected in market prices and in recent team metrics. Another is using a provider's retrospectively fitted EP model for older games and describing those features as fully point-in-time. Declare upstream model-training provenance, not just the date of the underlying game.

## Validation: what would support trust

### Historical testing and prospective testing answer different questions

A historical backtest asks how a frozen method would have performed on reconstructed past information. It is only credible if every feature and price was available by the stated decision time. A prospective paper record freezes each recommendation before the game as new information arrives, then settles it later. This is especially important for an AI research system that can otherwise encounter retrospective articles or information learned after the historical event.

Proposed sequence: establish chronological baselines; reserve untouched later dates; freeze the model and selection rules; evaluate once on that holdout; then collect a prospective paper record. The size and duration of that record should depend on uncertainty and event dependence, not an arbitrary promise that a fixed number of picks proves profitability.

Randomly splitting time-ordered events can put future information into training. Fit transformations, feature selection, calibration, and thresholds using training data only. Use rolling or expanding windows separated by date; avoid splitting two representations of the same game between training and evaluation. [Primary guidance: scikit-learn on time-ordered evaluation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html), [data leakage](https://scikit-learn.org/stable/common_pitfalls.html).

Specific leakage traps include final-season ratings used in early-season predictions, a current injury status substituted for the earlier report, using closing odds for a prediction supposedly made that morning, corrected data unavailable at prediction time, and selecting favorable thresholds after inspecting test results. Historical source publication time and collection time both matter.

### Probability quality

For binary outcomes `y_i` in `{0,1}` and probabilities `p_i`:

```text
Brier score = mean((p_i − y_i)^2)
Log loss = −mean(y_i × ln(p_i) + (1 − y_i) × ln(1 − p_i))
```

Lower is better for these scoring conventions. Log loss strongly penalizes confident mistakes; any numerical clipping must be declared. A reliability diagram compares predicted probabilities with observed frequencies: a well-calibrated set of 60% predictions should win around 60% over sufficient comparable cases. Brier and log loss evaluate more than calibration alone; include reliability plots and sample counts rather than interpreting a single score as complete proof. [Primary documentation: probability calibration](https://scikit-learn.org/stable/modules/calibration.html).

Evaluate each target separately. Moneyline calibration does not validate spread-cover probabilities. For push-capable markets, use a declared three-outcome assessment or clearly separate conditional decisive-result evaluation; silently dropping pushes changes the target.

### Returns and market-relative diagnostics

```text
Realized ROI = total settled net profit / total amount staked
```

Report the exact stake convention, push/void treatment, eligible-event universe, number of recommendations, dates, offered prices, and transaction assumptions. Win rate without prices is insufficient. A high favorite win rate can coexist with negative ROI.

Closing-line value, CLV, compares the recorded entry with a defined later market reference. For the _same outcome and line_, one price-relative diagnostic is `entry_decimal × closing_no_vig_probability − 1`. Compare point movement separately; −3 and −3.5 are different bets, so their price ratio alone is not a sound comparison. Define the book set, closing cutoff, and de-vig method. Pinnacle's own analysis treats closing prices as a proxy rather than asserting they are always correct. [Primary discussion and qualification](https://www.pinnacle.bet/betting-resources/en/betting-strategy/how-much-value-is-there-in-soccer-betting-markets/b3d266z5ruaaxjna?page=4).

Positive CLV is supporting market-relative evidence, not proof of guaranteed profit. Prospective source quality, probability calibration, market comparisons, and realized returns answer different questions and should be shown together.

### Uncertainty and research discipline

At a hypothetical 55% observed win rate over 100 independent binary bets, the approximate standard error is `sqrt(0.55 × 0.45 / 100) ≈ 4.97 percentage points`; an approximate two-standard-error interval is wide. This illustration is not a valid interval for ROI or correlated bets. Wilson intervals are preferable to naive normal intervals for many binomial settings. [NIST's interval guidance](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm).

Recommendations from the same game or slate can be correlated. Resampling for uncertainty should preserve relevant clusters, such as game or week, rather than pretending every bet is independent. Report uncertainty from data scarcity and model assumptions as well as game randomness. A scenario range is not automatically a statistically calibrated confidence interval.

Searching hundreds of filters and publishing only the winner creates selection bias. Preserve all tested variants, predeclare comparisons where possible, keep an untouched holdout, and report losing and passing cases. Multiple-comparison procedures address specified families of comparisons; they do not rescue an undocumented search over unlimited strategies. [NIST's explanation of family-wise comparisons](https://www.itl.nist.gov/div898/handbook/prc/section4/prc473.htm). These are proposed evaluation safeguards, not a substitute for independent replication.

## Expansion beyond the NFL

The shared concepts are exact market identification, price arithmetic, source provenance, model validation, and honest uncertainty. The features and fitted distributions must be sport-specific.

| Sport              | Proposed research emphasis                                                                                         | Distinction to preserve                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NBA                | Possession efficiency, lineup availability, minutes/rotation scenarios, rest and schedule context.                 | Offensive rating normalizes scoring to possessions; NBA pace uses a 48-minute basis.                                                                                      |
| College football   | Opponent-adjusted efficiency, roster/quarterback changes, schedule imbalance, venue and weather.                   | Validate across competition levels and season stages; NFL parameters and injury-data assumptions cannot be copied automatically.                                          |
| College basketball | Opponent-adjusted possession efficiency, venue, rotation changes, tempo, and schedule quality.                     | A resume ranking is not automatically a win probability or a spread model. Account for shorter game duration when comparing pace definitions.                             |
| MLB                | Confirmed starters and lineup, pitcher/batter handedness, bullpen availability, contact quality, park and weather. | Full-game and first-five-inning bets expose different pitching uncertainty and settlement rules; expected contact metrics do not directly produce game win probabilities. |

The NBA supplies [first-party metric definitions](https://www.nba.com/stats/help/glossary?hidenav=true). The NCAA describes [opponent- and location-adjusted possession efficiency](https://www.ncaa.org/news/march-basketball/media-center-how-do-net-rankings-work-in-ncaa-tournament-selection/). MLB's [expected-statistics documentation](https://baseballsavant.mlb.com/expected_statistics) describes using batted-ball characteristics plus observed walks, strikeouts, and hit-by-pitches to summarize contact/process performance. The research dimensions in the table are proposed inputs to test, not assertions of established betting advantage.

## Data feasibility and remaining limits

Historical results alone cannot establish performance against prices that were available at the decision time. The Odds API documents featured-market history from June 6, 2020, initially at ten-minute intervals and from September 2022 at five-minute intervals. Additional-market history starts in May 2023; historical endpoints require paid plans. Coverage must still be checked for each sport, book, date, and market. [First-party API reference](https://the-odds-api.com/liveapi/guides/v4/).

Manual sportsbook entry avoids requiring an automated user-book feed, but it does not supply historical comparative odds, complete opposing prices, injuries, or statistical data. Timestamp the entry and distinguish user-entered observations from independently fetched values. A manually entered price is not evidence the same price remained obtainable after the report finished.

Provider access, permitted storage/use/display, historical availability, stable identifiers, revisions, and update delays require explicit verification before choosing feeds. Sportradar's [coverage overview](https://developer.sportradar.com/getting-started/docs/get-started) documents different league-specific and general-sport coverage. This research did not establish a complete, licensed, affordable dataset covering all desired information across all five sports, nor did it validate any probability model.

## Proposed contract for an AI-generated thesis

For the initial application, AI should **synthesize cited evidence**, with deterministic code performing odds arithmetic. It should not independently manufacture win probabilities, “confidence percentages,” model edges, or projected scores. Quantitative forecasts can be added later only as outputs of separately versioned, evaluated models.

A useful report would contain:

1. Exact user-entered market, price, timestamp, and break-even calculation.
2. A concise research assessment, with an explicit pass or insufficient-evidence outcome available.
3. Supporting evidence with source links, publication/observation times, metric definitions, and relevant sample sizes.
4. The strongest counterargument and conflicting evidence.
5. Unresolved lineup/news scenarios and conditions that would change the assessment.
6. A clear distinction among verified facts, interpretations, user assumptions, market-derived estimates, and independently modeled estimates.
7. A retained original report for prospective review, with subsequent updates stored separately.

This is a proposed product contract derived from the research. Citation count and fluent prose are not measures of predictive skill. A thesis can be useful for comparing the user's reasoning while still being unable to establish a numerical betting edge.
