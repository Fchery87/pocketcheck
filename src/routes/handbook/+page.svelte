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

<main>
  <h1>Handbook</h1>
  <section>
    <h2>Decimal odds</h2>
    <p>
      American price {american} converts to decimal odds {decimal.toFixed(7)}. A positive price adds the
      price divided by 100. A negative price adds 100 divided by the absolute price.
    </p>
    <p data-testid="decimal-example">{decimal.toFixed(7)}</p>
  </section>
  <section>
    <h2>Break-even</h2>
    <p>
      Without a push, the decisive break-even win fraction is 1 divided by the decimal odds. For {american}
      that is {(decisive * 100).toFixed(5)}%.
    </p>
    <p data-testid="breakeven-example">{(decisive * 100).toFixed(5)}%</p>
  </section>
  <section>
    <h2>Margin</h2>
    <p>
      When both sides are priced at the same line and time, the simple margin is the sum of implied
      probabilities minus one. Two {american} prices imply an overround of
      {margin.available ? margin.overround.toFixed(5) : "unavailable"}.
    </p>
  </section>
  <section>
    <h2>Expected value</h2>
    <p>
      Per unit, expected value is the win probability times net decimal odds, minus the loss probability.
      A hypothetical 55% win and 45% loss at {american} is {illustrativeEv.perUnit?.toFixed(2)} units. That
      probability is illustrative, not a model estimate.
    </p>
  </section>
  <section>
    <h2>Pushes</h2>
    <p>
      A push returns the stake, so the unit return is {pushReturn}. The decisive break-even above is the
      required win rate among games that do not push.
    </p>
  </section>
</main>
