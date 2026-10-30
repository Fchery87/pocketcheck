# Register prospective artifacts in the journal

Release uses the frozen `prospective-2026-10-26` protocol. An artifact must be registered in the journal before the forecasts that will be evaluated. The journal records the registration and preserves it in version 1 backups. Forecasts without proven registration remain readable and cannot qualify.

The evaluation reads frozen primary model picks and later settlement and two-sided closing observations. It derives the sample and release decision from those records. An imported report's release verdict cannot authorize a release. A later withdrawal does not remove a frozen primary from the prospective sample.

The two closing prices define a proportional no-vig probability among decisive outcomes. Evaluation uses the forecast's frozen push probability for both the model and the closing baseline. This does not independently estimate the market's push probability.

The registration records an artifact binding at the actual registration time. It does not change the frozen protocol's start, thresholds, or criteria. Synthetic passing evidence tests the workflow; it does not release a real market.
