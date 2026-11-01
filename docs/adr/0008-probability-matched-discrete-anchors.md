# Match anchors to the final discrete probability

This supersedes the line-to-mean mapping in ADR 0003. A line is a contract threshold, not necessarily the location parameter of an asymmetric residual distribution.

## Decision

`probability-matched-discrete-v1` maps one sportsbook's proportional no-vig decisive probability to the location of the final integer distribution, including fitted key-number weights. Moneyline matches home wins conditional on a non-tie outcome. Spread matches home covers conditional on a non-push outcome. Total matches over outcomes conditional on a non-push outcome. The distribution retains its independently generated push mass. Contract tie rules are applied afterward, unchanged.

The bounded bisection bracket is the contract threshold plus or minus 128 points. Moneyline uses zero as its threshold. At most 80 iterations are allowed and the absolute decisive-probability tolerance is 1e-8. Invalid targets, missing decisive mass, unbracketed targets and failure to converge return an anchor-unavailable error. No nearest-grid fallback is permitted. Positive key weights do not justify assuming arbitrary multimodal residual mixtures are globally monotone. The solver therefore validates the final probability rather than returning an unchecked location.

Training targets use only distributions from outcomes available strictly before the row cutoff. Walk-forward calibration uses earlier blocks. Historical evaluation and decision-time forecasts use the same mapping with their respective fitted residual distributions. Totals use total residuals, not margin residuals.

## Compatibility and activation

New training semantics require a new fitted identity and artifact format. Existing live artifacts require refitting. Saved forecasts, including their old anchor means and probabilities, remain facts and are replayed without recomputation. The synthetic browser fixture may be refitted explicitly. No production artifact is replaced, registered, activated or released by this decision.

Passing zero-adjustment matching proves consistency with the entered book. It does not prove calibration, profitability or superiority to the closing market. Chronological development comparisons cannot satisfy `prospective-2026-10-26`.
