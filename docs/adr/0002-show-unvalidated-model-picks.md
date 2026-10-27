# Show unvalidated model picks without releasing the market

The user wants a side named for every game board they enter, but no market has passed the release gate and the forecasting model still scores worse than the no-vig close. We show the forecasting model's preferred side as an unvalidated model pick with a code-computed strength grade, and keep the release gate, the research policy conclusion, and the prospective protocol unchanged. Removing the gate was rejected because it would let an unproven model produce "value candidate" conclusions and erase the line between a tracked guess and a released assessment.

## Consequences

- The MVP spec's exclusion of forced picks is narrowed: a model pick always names a side, and the strength grade (including "no edge") carries the honesty the exclusion protected.
- A research analysis still ends in pass, wait, insufficient evidence, or an experimental conclusion from the unchanged policy. A model pick never changes it.
- When a market is released, its picks read "released" instead of "unvalidated". Nothing else about the pick changes.
