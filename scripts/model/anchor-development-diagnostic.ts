import { readFileSync } from "node:fs";
import { anchorFromQuote } from "../../src/lib/server/models/anchor.ts";
import { integerMass, totalFromDistribution } from "../../src/lib/server/models/distribution.ts";
import { pricedGamesFromNflverseCsv } from "../../src/lib/server/models/history.ts";
import {
  multiclassBrier,
  multiclassLogLoss,
  settleTotal,
} from "../../src/lib/server/models/evaluate.ts";
import type { ModelArtifact } from "../../src/lib/server/models/artifact.ts";

// Diagnostic only. The old predictor is never parsed for live use or registered.
const artifact = JSON.parse(readFileSync("data/artifacts/baseline.json", "utf8")) as ModelArtifact;
const games = pricedGamesFromNflverseCsv(readFileSync("data/sources/games.csv", "utf8")).filter(
  (game) => Date.parse(game.kickoff) > Date.parse(artifact.trainingCutoff) && game.prices?.total,
);
const scores = { lineMean: { brier: 0, logLoss: 0 }, matched: { brier: 0, logLoss: 0 } };
let maximumAnchorGap = 0;
for (const game of games) {
  const price = game.prices!.total!;
  const anchor = anchorFromQuote(
    "total",
    {
      sportsbook: "close",
      line: price.line,
      homeAmerican: price.over.american,
      awayAmerican: price.under.american,
    },
    artifact.total.residuals,
  );
  const expected =
    price.over.american > 0
      ? 100 / (price.over.american + 100)
      : -price.over.american / (-price.over.american + 100);
  const other =
    price.under.american > 0
      ? 100 / (price.under.american + 100)
      : -price.under.american / (-price.under.american + 100);
  const outcome = settleTotal(game.homeScore + game.awayScore, price.line);
  for (const [name, mean] of [
    ["lineMean", price.line],
    ["matched", anchor.mean],
  ] as const) {
    const side = totalFromDistribution(
      integerMass(artifact.total.residuals, mean),
      price.line,
    ).over;
    scores[name].brier += multiclassBrier(side, outcome);
    scores[name].logLoss += multiclassLogLoss(side, outcome);
    if (name === "matched")
      maximumAnchorGap = Math.max(
        maximumAnchorGap,
        Math.abs(side.win / (side.win + side.loss) - expected / (expected + other)),
      );
  }
}
for (const score of Object.values(scores)) {
  score.brier /= games.length;
  score.logLoss /= games.length;
}
console.log(
  JSON.stringify(
    {
      evidence:
        "development, fixed old residuals and zero adjustments, not a refitted predictor comparison",
      checksum: artifact.checksum,
      trainingCutoff: artifact.trainingCutoff,
      count: games.length,
      firstKickoff: games[0]?.kickoff,
      lastKickoff: games.at(-1)?.kickoff,
      scores,
      maximumAnchorGap,
    },
    null,
    2,
  ),
);
