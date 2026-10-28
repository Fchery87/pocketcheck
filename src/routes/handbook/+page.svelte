<script lang="ts">
  import { americanToDecimal, breakEven, expectedValue, proportionalMargin, unitReturn } from "#lib/domain/odds.ts";

  const american = -110;
  const decimal = americanToDecimal(american);
  const decisive = breakEven(decimal).decisive;
  const margin = proportionalMargin([
    { side: "favorite", american: -110 },
    { side: "underdog", american: -110 },
  ]);
  const illustrativeEv = expectedValue({
    decimalOdds: decimal,
    probabilities: { win: 0.55, loss: 0.45, push: 0 },
    illustrative: true,
  });
  const pushReturn = unitReturn({ result: "push", stake: 1, decimalOdds: decimal });
</script>

<main class="pc-page pc-handbook">
  <h1>Handbook</h1>
  <section class="pc-section">
    <h2>Decimal odds</h2>
    <p>
      American price {american} converts to decimal odds {decimal.toFixed(7)}. A positive price adds the
      price divided by 100. A negative price adds 100 divided by the absolute price.
    </p>
    <p class="pc-figure pc-example" data-testid="decimal-example">{decimal.toFixed(7)}</p>
  </section>
  <section class="pc-section">
    <h2>Break-even</h2>
    <p>
      Without a push, the decisive break-even win fraction is 1 divided by the decimal odds. For {american}
      that is {(decisive * 100).toFixed(5)}%.
    </p>
    <p class="pc-figure pc-example" data-testid="breakeven-example">{(decisive * 100).toFixed(5)}%</p>
  </section>
  <section class="pc-section">
    <h2>Margin</h2>
    <p>
      When both sides are priced at the same line and time, the simple margin is the sum of implied
      probabilities minus one. Two {american} prices imply an overround of
      {margin.available ? margin.overround.toFixed(5) : "unavailable"}.
    </p>
  </section>
  <section class="pc-section">
    <h2>Expected value</h2>
    <p>
      Per unit, expected value is the win probability times net decimal odds, minus the loss probability.
      A hypothetical 55% win and 45% loss at {american} is {illustrativeEv.perUnit?.toFixed(2)} units. That
      probability is illustrative, not a model estimate.
    </p>
  </section>
  <section class="pc-section">
    <h2>Pushes</h2>
    <p>
      A push returns the stake, so the unit return is {pushReturn}. The decisive break-even above is the
      required win rate among games that do not push.
    </p>
  </section>
  <section class="pc-section">
    <h2>Forecasting model and drafter</h2>
    <p>
      The forecasting model is the fitted statistical artifact. It produces outcome probabilities from game
      history and chooses the side of a model pick. The drafter is the AI provider model or the fixture that
      writes the explanation from those frozen facts. The drafter cannot change the side, the strength
      grade, or any number. If its explanation contradicts the frozen model pick, the explanation fails and
      the model pick is kept.
    </p>
  </section>
  <section class="pc-section">
    <h2>No-vig probability</h2>
    <p>
      Each American price implies a probability of 1 divided by its decimal odds. Those implied
      probabilities sum to more than one. The extra is the margin. The no-vig probability removes that
      margin in proportion, so the two sides sum to one. It is the market's price with the sportsbook's cut
      taken out, not the forecasting model's probability.
    </p>
  </section>
  <section class="pc-section">
    <h2>Strength grades</h2>
    <p>
      A game board freezes both sides of a market. The model pick names the side with the higher expected
      value at those prices. The strength grade is strong, lean, or no edge. Strong means the conservative
      expected value clears the versioned threshold and no material evidence is missing. Lean means the
      expected value is positive but short of strong. No edge means neither side clears the margin. The
      grade comes from the numbers, never from the drafter.
    </p>
    <p>
      An unreleased market labels the result "Unvalidated model pick" and says the forecasting model has
      not beaten the closing market. That label is not evidence of an edge. A released market says
      "Released model pick". Release is not a profitability claim. No market is released until protocol
      prospective-2026-10-26 is met.
    </p>
  </section>
  <section class="pc-section">
    <h2>Calibration and leakage</h2>
    <p>
      A probability is useful only if the stated chance matches later results in similar cases. Count the
      samples in each bin. Do not trust a win rate by itself.
    </p>
    <p>
      Leakage is using information that was not available before kickoff, including the final score, a
      later injury update, or a revised season total. Feature rows may use only earlier games.
    </p>
  </section>
  <section class="pc-section">
    <h2>Kelly, as context only</h2>
    <p>
      Kelly stake sizing is a lesson about how sensitive a bet size is to a probability error. PocketCheck
      does not recommend a personal stake.
    </p>
  </section>
</main>
