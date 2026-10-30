# PocketCheck

PocketCheck is a personal research journal for NFL pregame bets on moneylines, spreads, and totals. It runs on your own computer and saves its records in your Neon Postgres database. You enter the exact price a sportsbook shows you. PocketCheck collects the injury report and the kickoff forecast, does the price mathematics in code, and freezes the result as a permanent record. After the game, you record the score, and the journal grades each record from its own contract.

The journal keeps three kinds of record apart, and they stay distinguishable after kickoff.

- An **analysis** is your research on one offer. It ends in a policy conclusion such as `pass` or `insufficient evidence`.
- A **model pick** comes from a game board. The forecasting model picks a side for each market you entered, and code grades it `strong`, `lean`, or `no edge`.
- An **actual bet** is the contract you placed, with your stake in units.

## What PocketCheck claims today

Status on 2026-10-30. The research workflow and the game board run end to end on the real nflverse schedule and save every run to Neon. The forecasting model has not beaten the closing market, and no market has been released.

That has three consequences you will see in the app.

- Every valid analysis whose evidence is complete concludes `insufficient evidence`. The reason it gives is that the model artifact is unreleased. The analysis still records the model's probabilities and its frozen forecast.
- Every model pick is labeled "Unvalidated model pick". It is tracked so it can be evaluated later. It is not evidence of an edge.
- A `strong` grade means the code's conservative expected-value check passed at the entered price. It is not a measured win rate.

On 860 historical games after the model's training cutoff, the model's log loss was slightly worse than the no-vig close on moneylines, slightly better on spreads, and worse on totals. The moneyline and spread differences are within noise. Those games were inspected during development, so they are development evidence and cannot release a market. The [model evaluation note](docs/research/model-evaluation.md) has the numbers and how they were produced.

A market can be released only by the prospective protocol `prospective-2026-10-26`, described in [Evaluate the model on new games](#evaluate-the-model-on-new-games). Release is not a profitability claim.

## Set up PocketCheck

### Requirements

- Node 24 and npm 11. The toolchain was verified on Node 24.15.0 and npm 11.19.0.
- A Neon Postgres database for the journal. Any PostgreSQL connection string works, but the app is built and tested against Neon.
- About 1.1 GB of free disk space for nflverse source files under `data/sources/`, with play-by-play from 2016 on.
- Optional. An API key for TheClawBay or DeepSeek, if you want an AI model to write the explanation text. Without one, use the fixture drafter, which makes no network call.

### Install and configure

1. Install dependencies.

   ```sh
   npm install
   ```

2. Copy the example environment file.

   ```sh
   cp .env.example .env
   ```

3. Open `.env` and set `DATABASE_URL` to your Neon connection string. PocketCheck refuses to start a journal without it. It never falls back to an in-memory journal.
4. Optional. Set `NWS_USER_AGENT` to a string with your email address, such as `PocketCheck (you@example.com)`. The National Weather Service asks callers of api.weather.gov to identify themselves.
5. Optional. Set `THECLAWBAY_API_KEY`, `DEEPSEEK_API_KEY`, or both. The keys stay on the server. The Settings page shows only whether each key is set.
6. Create the journal tables.

   ```sh
   npm run db:migrate
   ```

   This applies every pending file in `migrations/` in order. It is the only supported way to change the journal schema.

### Download the source data

Each download writes a CSV under `data/sources/` and a `.json` file beside it that records when it was retrieved. These files stay on your computer and are not committed.

```sh
npm run data:schedule        # nflverse schedule, results, and closing lines -> data/sources/games.csv
npm run data:injuries        # this season's nflverse injury report -> data/sources/injuries_<season>.csv
npm run data:depth-charts    # this season's depth charts -> data/sources/depth_charts_<season>.csv
npm run data:play-by-play    # this season's plays -> data/sources/play_by_play_<season>.csv
```

The injury, depth-chart, and play-by-play commands take an optional season year as their first argument, such as `npm run data:play-by-play -- 2024`. The NFL season is named for the year it starts, so a January game belongs to the previous year's season.

- The schedule lists the games you can pick, and its finished games are the model's training data.
- The injury report feeds the injury evidence and helps decide each team's starting quarterback.
- The depth chart names the backup quarterback when the usual starter is out or doubtful.
- Play-by-play files supply the efficiency inputs. The model uses history only from the first season that has a play-by-play file, so download every season you want it to learn from.

### Fit the forecasting model

The app reads the model from `data/artifacts/baseline.json`.

```sh
npm run model:fit -- data/sources/games.csv data/artifacts/baseline.json
```

Without a third argument, the earliest 70% of games train the model. To choose the training cutoff yourself, add an ISO time, such as `2022-03-01T00:00:00Z`. The command prints the new artifact's checksum. Keep that checksum, because the prospective evaluation needs it.

The artifact in use was trained through 2023-10-22 and has checksum `68f341bc8a02…`. If you refit, the checksum changes, and the new artifact needs its own prospective registration.

### Start the app

For daily use, build once and run the production server.

```sh
npm run build
npm start
```

Open `http://127.0.0.1:3000`. `npm start` reads `.env`, binds to `127.0.0.1`, and uses port 3000 unless you set `HOST` or `PORT`.

For development, `npm run dev` starts the Vite server on `127.0.0.1` with hot reload.

## Use PocketCheck

This section follows the order you use the app in during an NFL week. Each part names the page and the controls you will see.

The app has these pages.

| Page                   | Address              | What you do there                                                                                          |
| ---------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| New analysis           | `/`                  | Research one offer and freeze an analysis.                                                                 |
| Analysis report        | `/analysis/<id>`     | Read a frozen report, refresh it at a new price, or start a new attempt.                                   |
| Game board             | `/board`             | Enter both sides of a game's markets and freeze model picks.                                               |
| Board report           | `/board/<id>`        | Read model picks, settle the game, refresh the board, or withdraw it.                                      |
| Model-pick performance | `/board/performance` | Read results of primary model picks, grouped by forecasting artifact.                                      |
| Journal                | `/journal`           | List analyses, record bets, settlements, and closing prices, register evaluations, and back up or restore. |
| Settings               | `/settings`          | Check and download source data, choose who writes the explanation text, and manage AI model catalogs.      |
| Handbook               | `/handbook`          | Read short definitions of the odds and model terms the app uses.                                           |

### A typical week

1. Before you research, refresh the data. On **Settings**, under **Source data**, choose **Download** for the schedule and the injury report. Download the depth chart when depth charts change. The npm commands do the same thing from a terminal.
2. For an offer you are considering, freeze an analysis on the **New analysis** page.
3. For the model's side on a whole game, freeze a game board on the **Game board** page.
4. If you place a bet, record it on the **Journal** page under **Record an actual bet**.
5. Shortly before kickoff, record the closing prices under **Two-sided closing markets**.
6. After the game, record the final score. Use **Settle this game** on the board report, or **Settlement** on the Journal page.
7. After the week's games finish, run `npm run data:play-by-play` so the next forecasts use the new efficiency data.
8. Download a journal backup from the Journal page.

### Research one offer

Open the **New analysis** page at `/`. The form has five stages. Your typed values stay in place if a stage fails validation.

1. **Game.** Pick the game from the list. Only games that have not kicked off appear. If the list is empty, run `npm run data:schedule`.
2. **Offer.** Enter the price exactly as the sportsbook shows it.
   - Type the **Sportsbook** name, such as FanDuel.
   - Choose the **Market**.
   - Choose the **Selection**. A moneyline or a spread offers home or away. A total offers over or under.
   - For a spread, enter the **Selected-side line**. Home -3.5 and away +3.5 are different contracts. For a total, enter the **Total line**, which over and under share. The minus and plus buttons move the line by half a point.
   - Enter the **American odds**, such as -110 or +130. The buttons move the odds by 5.
   - Set **When you saw this price**.
   - For a moneyline, choose the **Moneyline tie rule** your sportsbook uses: push, loss, win, or void.
3. **Your evidence (optional).** Add notes from sources you trust, such as a club injury report or a beat reporter. Each note has a link, a publication time, and an optional team. Use **Stands in for** to let a note replace a missing source.
   - A note stands in for a missing injury report only when it names that team and was published within 24 hours before the decision cutoff.
   - A note stands in for a missing kickoff forecast only when it was published within 12 hours before the cutoff.
   - Leave the time blank if the source does not say when it was published. Such a note stays visible but clears no gap.
   - A note dated after the cutoff is left out of the report.
   - Choose **Add another source** for another note.
4. **Private lean.** Optional. Write which side you lean toward and why. PocketCheck stores it apart from the evidence and the explanation text. The model and the drafter never see it.
5. **Review.** Check the summary, then choose **Freeze & analyze**.

Freezing writes one permanent analysis. It saves the game as scheduled now, the research offer, the decision cutoff, every evidence item and gap, the model's identity, and the policy result. A later schedule update does not change it.

During the run, PocketCheck collects two sources on its own.

- **Injuries.** It reads the nflverse injury file for both teams. nflverse does not publish a report time, so the app knows only when you downloaded the file. Coverage older than 24 hours is a material gap, so download the injury report the same day you research. **Settings** marks the file stale once it is older than 24 hours. A team with no rows has unknown coverage, not a clean report.
- **Weather.** It fetches the National Weather Service forecast for kickoff at U.S. outdoor venues. International venues have no NWS forecast, and the report lists that as a gap. A closed roof makes weather irrelevant.

### Read an analysis report

The report at `/analysis/<id>` has these sections.

- **Conclusion, run in code.** This is the policy conclusion and the reason for it. See [Policy conclusions](#policy-conclusions) for what each one means.
- **Research offer.** The frozen contract you researched.
- **Model.** The artifact's checksum, version, and training cutoff, its probabilities for the offer, the starting quarterbacks it assumed, and whether the forecast was frozen for prospective evaluation.
- **Your lean, recorded before this report.**
- **Evidence gaps.** Every missing or stale source. A material gap blocks a value conclusion.
- **Thesis.** The drafter's explanation, with **Cited evidence**, **Assumptions**, **Uncertainty**, and **What would change this conclusion**.
- **All evidence in this run.** Every item collected, including stale and unused items.
- **Provider usage.** Each AI request, its outcome, and the token counts and cost the provider reported.

Provider usage adds the original request and every repair request. If the provider did not report a field, the field says unknown and the total is marked partial. Unknown cost is never shown as zero.

### Refresh an analysis at a new price

Use **Refresh at a new price** at the bottom of a completed report when the line or the odds move. A refresh can change the sportsbook, the point line, the odds, and the time you saw the price. It keeps the market and the selection. Choose **Refresh**.

The refresh is a new analysis that links to its parent. The earlier report does not change. A different market or selection is a new analysis, so start it from the **New analysis** page instead.

### Recover a failed or ambiguous attempt

If drafting fails or the process stops partway, the report shows **Attempt recovery**. The attempt and its finished stages stay saved. PocketCheck does not resend any request on its own, because the provider may have finished a request before its response was saved.

Sometimes the app cannot tell whether a provider finished a request. The report then says the outcome is ambiguous. To try again, choose **Start new attempt**. That is a deliberate new request, and the provider may charge for it. If finalization fails after a response was saved, PocketCheck reuses that response and sends no new request.

### Get the model's side with a game board

A game board asks the forecasting model which side it prefers in each market of one game. Open **Game board** at `/board`.

1. Pick the **Game**, type the **Sportsbook**, and set **When you saw these prices**.
2. For **Prospective evaluation**, leave **Do not include this board** unless you have registered the current artifact. See [Evaluate the model on new games](#evaluate-the-model-on-new-games).
3. Enter both sides of each market you want a pick for. Leave a market blank to skip it.
   - **Moneyline.** Enter the home and away American odds and the tie rule.
   - **Spread.** Enter the home line once. The away line fills in as its mirror, so home -3.5 pairs with away +3.5. Then enter the odds for each side.
   - **Total.** Enter the total line and the over and under odds.
4. Optional. Under **Other sportsbooks**, add the same side's price from other books. The model pick uses the best price on the same point line. A price on a different line appears as a separate contract and is not compared.
5. Optional. Add evidence notes and a private lean, as on the analysis form.
6. Choose **Freeze board**.

A market needs both sides from one sportsbook to get a forecast. The forecast starts from that sportsbook's line, called the anchor line, and the model learns only how far to move from it.

A board and an analysis are separate records. Freezing a board does not create an analysis, and an analysis never becomes a board.

### Read a model pick

The board report at `/board/<id>` has one section per market. Each model pick shows these items.

- The side the forecasting model picked and its strength grade.
- The model's win, loss, and push probabilities, the no-vig probability, the sportsbook margin, the expected value per unit, and the conservative expected value at the best price on that line.
- How far the model moved from the anchor line, broken down by input group.
- The starting quarterbacks it assumed, and whether each one is known, assumed from history, or unknown.
- The evidence gaps. If material evidence is missing, the pick cannot be graded `strong`.
- The drafter's explanation, including the strongest case for the other side.

Code chooses the side and the grade. The drafter only explains the frozen pick and cannot change the side, the grade, or any number. If its explanation contradicts the pick, the explanation fails, and the report says "No explanation". The pick itself stays.

The strength grades mean the following.

| Grade     | Meaning                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `strong`  | The conservative expected value is above the frozen threshold, and no material evidence is missing.          |
| `lean`    | The point estimate of expected value is positive, but the conservative estimate does not pass the threshold. |
| `no edge` | Neither side has positive expected value, or the two sides tie.                                              |

**Who wrote what** lists which parts of the page came from code and which came from the drafter.

### Refresh or withdraw a board

To enter new prices for the same game, choose **Refresh with new prices** on the board report. The form opens with the earlier values. You can change the sportsbook, the lines, the odds, and the time, and add or drop markets. Choose **Freeze refreshed board**. The earlier board stays exactly as it was, and the new one links to it. A refresh never becomes the primary model pick.

Use **Withdraw from performance** for a test board or a mistaken entry. Give a reason and choose **Withdraw this board**. The board and its picks stay saved but stop counting in model-pick performance. A withdrawn primary pick is not replaced by a later board. Withdrawal cannot be undone.

### Record an actual bet

Open the **Journal** page and go to **Record an actual bet**. You can start from a model pick by choosing **Record an actual bet from this model pick** on the board report. The form then opens with that pick's contract as starting values.

1. Choose the **Analysis** the bet belongs to. When you start from a model pick, the form links the bet to that pick instead and hides this field.
2. Enter a **submission identifier**. Any unique text works, such as `fd-2026-11-01-phi`.
3. Enter the contract you actually placed. That means the sportsbook, the market, the selection, the point line, the tie rule for a moneyline, and the American odds.
4. Enter the stake in units. It must be positive.
5. Choose **Record bet**.

The bet stores its own contract, so it can differ from the researched offer. Saving it does not change the research. Sending the same submission identifier again returns the same bet. Reusing that identifier with different terms is rejected, and the first bet stays as it was.

Bets saved before contracts were recorded have no market, line, or rules of their own. The journal says those terms were not recorded. It does not copy in the researched line.

### Record closing prices

There are two forms on the Journal page, and they serve different purposes.

**Two-sided closing markets** records both prices for one market from one sportsbook at one moment. Prospective evaluation compares each model pick against this market.

1. Choose the game, type the sportsbook, and choose the market.
2. For a spread, enter the home line. For a total, enter the total.
3. Enter the home or over odds and the away or under odds.
4. For a moneyline, choose the tie rule.
5. Set **Observed at** and name the **Source**. Then choose **Record closing market**.

Record it as close to kickoff as you can. The evaluation uses the latest matching market observed after the decision cutoff and before kickoff, however old that is. The prospective report now shows how many minutes before kickoff each close was observed, so a stale close is visible.

**Closing observations** records one later price for one record, either a researched offer, an actual bet, or a model pick. The journal uses it for the closing comparison on that record.

A closing comparison counts only when the market, side, point line, sportsbook, and rules all match the original contract. It then reports the change in decimal odds. A different point line is shown as line movement, not as an odds change. A missing close stays unavailable and is never shown as zero.

### Settle a game

After the game, record the result in one of two places.

- **Settle this game** on a board report records the result for the game. A final score grades every model pick on every board of that game.
- **Settlement** on the Journal page grades a research analysis. You can also pick one of its actual bets.

Both forms take the same fields.

1. Enter an **Event identifier**, such as `final-2026-11-01-dal-phi`. Sending the same event again is ignored.
2. Choose the kind: final score, postponed, void, or unresolved.
3. For a final score, enter both teams' scores as whole numbers.
4. To correct an earlier notice, enter its identifier in **Corrects notice** and give a **Reason**.

Each contract is graded from its own rules. A home spread of -3 pushes when the home team wins by 3, and the same score loses a home spread of -3.5. A postponed or unresolved notice stays unresolved and is not a loss. Notices are never edited or deleted. A correction is a new notice, and the journal shows the full history and the latest effective result.

### Read performance

The Journal page has a **Performance** section with two views.

- **Frozen primary assessments** counts one analysis per game, the primary. Its return assumes one unit on the frozen researched contract.
- **Actual bets** counts the contracts you placed, at your recorded stakes.

The **Model-pick performance** page at `/board/performance` counts frozen primary model picks only. It shows **All primary model picks** and then the same picks grouped by forecasting artifact.

Every view states how many records are settled, unresolved, push, void, or missing a comparable close. It also states the denominator for return and for closing comparisons. A push or a void returns the stake and is left out of the return denominator. A refresh is never counted as another observation.

### Check and download source data

Open **Settings** at `/settings`. The **Source data** section lists the four files the app reads for the current season.

- Each file shows its path, when it was retrieved, how many hours ago that was, and its row count. A file with no retrieval record shows "Rows unknown". A file that does not exist shows "Not downloaded".
- The injury report shows "◷ Stale" once it is older than 24 hours. An analysis records a material injury gap until you download it again.
- The schedule, the injury report, and the depth chart each have a **Download** button. It runs the same download as the matching npm command.
- Play-by-play has no button. Each season file is about 100 MB, so run `npm run data:play-by-play` in a terminal after each week's games.

A download writes the new file under a temporary name and renames it into place only after it arrives and passes its column checks. If the download fails, the page shows the reason, and the existing file stays as it was. A second download of the same file while one is running is refused. Frozen analyses and boards keep their own snapshots, so a new schedule never changes an existing record.

The buttons are off under `npm run verify`, because verification reads checked-in fixture files.

### Choose who writes the explanation text

Open **Settings** at `/settings`. Under **Thesis drafter**, choose one option and then **Use this drafter**.

- The **fixture drafter** makes no AI call. It restates the policy result and cites the schedule.
- **DeepSeek** and **TheClawBay** models appear once their key is set and you choose **Refresh catalog**. The catalog shows when it was retrieved.

A DeepSeek model can draft when its catalog says it produces text. TheClawBay's catalog does not say, so a TheClawBay model can draft only after it passes **Test (one small request)**, which sends one small JSON request. There is no automatic fallback. If the chosen model disappears or its key is missing, the analysis stops and says why.

The drafter writes explanation text only. It cannot choose eligibility, change a number, or switch providers.

### Back up and restore the journal

On the Journal page, choose **Download journal backup** to save `pocketcheck-journal-v1.json`. The file includes analyses, boards, model picks, bets, settlements, closing prices, registrations, and provider attempts. It leaves out API keys, settings, and the bulk files under `data/sources/`.

To restore, choose the file under **Restore a version 1 backup** and choose **Restore journal**. PocketCheck checks the whole file before writing anything. A damaged file or a conflicting identifier changes nothing. Restoring the same file twice keeps one copy of each record. A restored pending attempt stays readable and is not replayed.

### Evaluate the model on new games

The prospective evaluation is the only way a market can be released. It scores model picks that were frozen before their games, against closing markets recorded later. Protocol `prospective-2026-10-26` sets these requirements for each market.

- At least 500 priced games.
- Brier score and log loss no worse than the no-vig close.
- A slate-clustered 90% interval for the log-loss difference whose upper end is at most zero.

An NFL season has about 285 games, and each game and market counts once. Release therefore takes about two full seasons of boards, even if you capture every game.

To collect the evidence, follow these steps.

1. Register the artifact. On the Journal page under **Prospective evaluation**, paste the 64-character artifact checksum and choose **Register evaluation**. Registration applies only to forecasts recorded after it.
2. On each game board, choose that registration under **Prospective evaluation**. The registration must match the artifact the board uses.
3. Before kickoff, record a two-sided closing market for each market you entered.
4. After the game, settle it from the board report.
5. Keep the same artifact for the whole sample. A refit produces a new checksum, which needs its own registration and starts a new sample.

To score the evidence, follow these steps.

1. Download the journal backup.
2. Copy the registration record from the backup's `protocolRegistrations` list into its own file, `protocol.json`. The command checks it against the backup, so it cannot create a registration by itself.
3. Run the report. The last argument must be a new file.

   ```sh
   npm run model:prospective -- pocketcheck-journal-v1.json protocol.json prospective-report.json
   ```

4. Read the report.
   - `denominators` shows how many picks qualified and how many were excluded.
   - `excluded` gives the reason for each exclusion, such as `not-primary` or `quote-after-decision-cutoff`.
   - `closeAge` shows, per market, how many closes were found, how many are missing, and the median, 90th-percentile, and oldest minutes before kickoff.
   - `evaluation.markets.<market>.release` says whether the market passed and why.

If a market passes, `model:release` writes a new artifact that marks that market released.

```sh
npm run model:release -- data/artifacts/baseline.json pocketcheck-journal-v1.json protocol.json released-artifact.json
```

It refuses when the registration, the artifact, or the protocol settings do not match, or when no market passes.

### Refit and evaluate the model

To fit a candidate on the latest data without touching the artifact in use, run the command below.

```sh
npm run model:refit -- data/sources/games.csv data/artifacts/baseline.json data/artifacts/baseline-next.json
```

It writes `baseline-next.json` and leaves `baseline.json` alone. If the new fit has the same checksum as the artifact in use, it writes nothing and prints `"unchanged": true`. With `--replace`, it overwrites the artifact in use and keeps the old one as `baseline.json.replaced`.

To score an artifact on historical games, run the command below.

```sh
npm run model:evaluate -- data/artifacts/baseline.json data/sources/games.csv data/artifacts/baseline-evaluation.json
```

The report compares the model with the no-vig close by log loss and Brier score, with slate-clustered intervals. These are development scores, not evidence for release.

To fit without some input groups, list them in `MODEL_EXCLUDE_GROUPS`, separated by commas.

### Open PocketCheck on your phone

> **Warning.** PocketCheck has no login. When it listens on an address other than `127.0.0.1`, anyone who can reach your computer on the network can read the journal, change settings, record analyses and bets, and start source downloads. Use it only on a home network you trust, and stop the server when you are done.

1. Find your computer's address on the home network. On Linux, run `hostname -I`. On macOS, run `ipconfig getifaddr en0`. On Windows, run `ipconfig` and read the IPv4 address. It usually looks like `192.168.1.20`.
2. Start the server on that one address. That is narrower than `0.0.0.0`, which listens on every network interface.

   ```sh
   HOST=192.168.1.20 PORT=3000 npm start
   ```

3. On the phone, on the same Wi-Fi network, open `http://192.168.1.20:3000`. Your firewall may need to allow incoming connections on that port.

The startup log repeats the no-login warning whenever `HOST` is not a loopback address. `npm run dev` and `npm run preview` always stay on `127.0.0.1`.

`npm start` checks the `Host` header of every request. It accepts `localhost`, `127.0.0.1`, `[::1]`, and this computer's own IP addresses, on any port. Any other name gets status `421`. This blocks DNS rebinding, where a web page points its own domain at your computer and reads the journal through your browser. To open PocketCheck by a name such as `desk.local`, list the name. Only list names you control.

```sh
HOST=192.168.1.20 ALLOWED_HOSTS=desk.local npm start
```

## Rules the journal enforces

These rules hold on every page. They decide what a record means after kickoff.

### Records stay frozen

- An analysis freezes the game, the research offer, the decision cutoff, the evidence, the gaps, the model identity, and the policy result. Reloading the schedule changes only which games you can pick.
- A frozen forecast is never regenerated from a newer schedule, starter list, artifact, or score. Later evidence evaluates it.
- Legacy records saved before snapshots existed are marked `legacy-unknown`. Their original kickoff and venue cannot be confirmed, and PocketCheck does not fill in facts the saved record cannot establish.

### One primary per game

- The primary analysis is the earliest completed analysis whose decision cutoff is strictly before kickoff. Later pregame analyses are refreshes.
- The primary model pick is the earliest completed model pick for a game and market whose cutoff is strictly before kickoff.
- The app decides the primary when the attempt finishes and stores the reason. Later refreshes, bets, and scores do not change it. A completion tie keeps a single primary.
- An analysis that did not complete, or whose cutoff was not before kickoff, is ineligible. Rows without a recorded completion time stay unclassified.
- The journal lists every completed analysis, including passes. That full history is not the performance sample. Only primaries count.

### Contracts are exact

- A contract is the market, the selection, the point line, the sportsbook, and the settlement rules.
- A different point line is a different contract. Home -3.5 and away +3.5 are different contracts.
- The best available price is the highest decimal odds on the same point line.
- Settlement grades each record from its own contract. A model pick uses the picked side's contract. A bet uses the contract you placed.

### Unknown stays unknown

- A missing close, an unresolved result, and an unknown cost stay unavailable. None of them is shown as zero.
- A push or a void returns the stake. It is not a win or a loss, and it is left out of the return denominator.
- An archived price with no observation time is not an executable offer and not a timestamped observation.

### Code decides, the drafter explains

- Code does all the mathematics and applies the policy.
- The drafter writes only from the evidence it receives. It cannot invent a probability, choose eligibility, or switch providers.
- A drafter explanation that contradicts the pick fails visibly, and the pick stays.

### Policy conclusions

The policy runs these checks in order and stops at the first one that applies.

| Check                                                                                     | Conclusion                     |
| ----------------------------------------------------------------------------------------- | ------------------------------ |
| The offer is not valid.                                                                   | `pass`                         |
| The game has already started.                                                             | `pass`                         |
| Material evidence is missing.                                                             | `insufficient evidence`        |
| The model artifact is not released.                                                       | `insufficient evidence`        |
| Probabilities or expected value are unavailable.                                          | `insufficient evidence`        |
| The released model shows no positive expected value at the price.                         | `pass`                         |
| The uncertainty assessment is unavailable.                                                | `insufficient evidence`        |
| The point estimate is positive, but the conservative estimate is not above the threshold. | `experimental lean`            |
| The conservative estimate is above the threshold.                                         | `experimental value candidate` |

The threshold is `threshold-2026-10-25`, a conservative expected value above 0 units. It was frozen in code before any holdout outcome was examined. Every conclusion is labeled experimental. The policy version is `policy-2026-10-25.2`.

## Command reference

| Command                                                                | What it does                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`                                                          | Starts the development server on `127.0.0.1`.                                           |
| `npm run build`                                                        | Builds the production server into `build/`.                                             |
| `npm start`                                                            | Runs the production server with `.env`, on `HOST` and `PORT`.                           |
| `npm run preview`                                                      | Serves the production build on `127.0.0.1`.                                             |
| `npm run db:migrate`                                                   | Applies pending migrations to `DATABASE_URL`.                                           |
| `npm run data:schedule [output]`                                       | Downloads the nflverse schedule.                                                        |
| `npm run data:injuries [season] [output]`                              | Downloads the nflverse injury report.                                                   |
| `npm run data:depth-charts [season] [output]`                          | Downloads nflverse depth charts.                                                        |
| `npm run data:play-by-play [season] [output]`                          | Downloads one season of nflverse play-by-play data.                                     |
| `npm run data:snap-counts [season] [output]`                           | Downloads nflverse snap counts. The app does not read them yet.                         |
| `npm run data:import [schedule] [game-id]`                             | Prints an evidence packet for one game from a local schedule. It makes no network call. |
| `npm run model:fit [games] [output] [cutoff]`                          | Fits a new unreleased artifact.                                                         |
| `npm run model:refit [games] [in-use] [output] [--replace]`            | Fits a candidate beside the artifact in use.                                            |
| `npm run model:evaluate [artifact] [games] [output]`                   | Scores an artifact on historical games.                                                 |
| `npm run model:prospective <journal> <protocol> <new-report>`          | Scores registered prospective model picks.                                              |
| `npm run model:release <artifact> <journal> <protocol> <new-artifact>` | Writes a released artifact if a market passes the protocol.                             |
| `npm run check`                                                        | Runs format, lint, and type checks.                                                     |
| `npm test`                                                             | Runs the unit tests.                                                                    |
| `npm run test:e2e`                                                     | Runs the Playwright browser tests against `build/`. Run `npm run build` first.          |
| `npm run verify`                                                       | Runs format, lint, types, unit tests, the build, and the browser tests.                 |
| `npm run verify:database`                                              | Runs the storage tests against `TEST_DATABASE_URL`.                                     |

Pass arguments after `--`, as in `npm run data:injuries -- 2025`.

## Environment variables

| Variable                     | Required              | Purpose                                                                                                |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`               | Yes                   | The Neon connection string for your journal.                                                           |
| `NWS_USER_AGENT`             | No                    | Identifies you to api.weather.gov. Include an email address.                                           |
| `THECLAWBAY_API_KEY`         | No                    | Enables TheClawBay models in Settings.                                                                 |
| `DEEPSEEK_API_KEY`           | No                    | Enables DeepSeek models in Settings.                                                                   |
| `HOST`                       | No                    | The address `npm start` listens on. The default is `127.0.0.1`.                                        |
| `PORT`                       | No                    | The port `npm start` listens on. The default is 3000.                                                  |
| `ALLOWED_HOSTS`              | No                    | Extra host names `npm start` accepts, separated by commas.                                             |
| `POCKETCHECK_SCHEDULE_CSV`   | No                    | Another schedule file. The default is `data/sources/games.csv`.                                        |
| `POCKETCHECK_INJURY_CSV`     | No                    | Another injury file. The default is `data/sources/injuries_<season>.csv`.                              |
| `POCKETCHECK_MODEL_ARTIFACT` | No                    | Another artifact path, or `off` to run without a model. The default is `data/artifacts/baseline.json`. |
| `POCKETCHECK_WEATHER`        | No                    | Set to `off` to skip NWS forecasts.                                                                    |
| `MODEL_EXCLUDE_GROUPS`       | No                    | Input groups `model:fit` leaves out, separated by commas.                                              |
| `TEST_DATABASE_URL`          | For `verify:database` | A disposable database for storage tests. It is never read from `.env`.                                 |

`POCKETCHECK_TEST_MODE`, `POCKETCHECK_JOURNAL`, `POCKETCHECK_NOW`, and `POCKETCHECK_TEST_JOURNAL_ID` exist for the browser test suite. Leave them unset in normal use.

## Verify a change

```sh
npm run verify
TEST_DATABASE_URL='postgresql://user:password@localhost/test_db?sslmode=disable' npm run verify:database
```

`npm run verify` runs offline. It uses a memory journal, a fixed clock, checked-in fixtures, and no provider keys, and it blocks every outbound request. `npm run verify:database` creates a random `it_` schema for each test, applies every migration there, and drops only that schema. Never point `TEST_DATABASE_URL` at your journal. Continuous integration runs both commands as the `application` and `database` jobs. [Verify a change](docs/testing.md) has the details.

## How the project is organized

| Path                        | Contents                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `src/routes/`               | The pages and form actions.                                                               |
| `src/lib/domain/`           | Odds, offers, settlement, and performance mathematics shared by server and pages.         |
| `src/lib/server/analysis/`  | Analysis and board runs, the policy, primaries, model picks, and the journal stores.      |
| `src/lib/server/models/`    | Training, forecasting, the anchor line, uncertainty, prospective evaluation, and release. |
| `src/lib/server/sources/`   | nflverse and NWS readers.                                                                 |
| `src/lib/server/providers/` | The DeepSeek and TheClawBay drafters.                                                     |
| `scripts/`                  | Data download, model, start, and verification commands.                                   |
| `migrations/`               | SQL migrations for the journal.                                                           |
| `data/`                     | Local source files and model artifacts. Large files are not committed.                    |
| `tests/`                    | Unit, model, integration, and browser tests.                                              |

The stack is SvelteKit 3.1.0 with Svelte 5.57.2, Vite+ 1.4.0 with Vitest 5.0.5, `@sveltejs/adapter-node` 6.0.0, TypeScript 6.0.3, and svelte-check 4.7.7. SvelteKit 3 keeps its configuration in `vite.config.ts`, and there is no `svelte.config.js`. The `#lib` import is the library alias. Server-only code lives under `src/lib/server`, and its imports include the `.ts` extension.

Development does not enforce the production cross-site form check, but preview and the Node server do. `npm start` declares `http` as the request protocol, so a form posted from the address the browser used succeeds, and a form from any other origin returns 403. To put a TLS proxy in front of PocketCheck, run `build/index.js` with the adapter's own settings. `build/index.js` listens on every interface unless `HOST` is set, so prefer `npm start`.

## Further reading

- [Glossary](GLOSSARY.md) defines each journal term.
- [Model evaluation](docs/research/model-evaluation.md) explains how the model is fit and scored, with historical results.
- [Handicapping handbook](docs/research/2026-10-25-handicapping-fundamentals.md) covers odds, expected value, uncertainty, and evaluation.
- [Free NFL data audit](docs/research/2026-10-25-free-nfl-data-audit.md) lists the data sources and their limits.
- [Stack and AI feasibility](docs/research/2026-10-25-stack-and-ai-feasibility.md) explains the choice of SvelteKit, Vite+, Neon, TheClawBay, and DeepSeek.
- [Architecture decisions](docs/adr/) record why picks are shown before validation, why forecasts are anchored on the market, and why artifacts are registered.
- [Design system](DESIGN.md) covers pages, components, and styles.

## Known limits

- Historical forecasts start from closing prices, which contain information a bettor would not have had earlier in the week.
- Spread and total forecasts start from the point line only. The two prices affect expected value but not the starting probabilities. A moneyline anchor uses both prices.
- Weather forecasts are saved as evidence, but the model does not adjust for weather.
- Non-quarterback injuries are shown as evidence, but the model does not use them.
- After shrinkage, the artifact keeps 6.6% of its learned margin adjustment and 7.9% of its learned total adjustment, so most of each forecast comes from the market line.
- PocketCheck covers NFL pregame moneylines, spreads, and totals only. Other sports, live betting, automatic bet placement, bankroll advice, and multiple users are out of scope.
