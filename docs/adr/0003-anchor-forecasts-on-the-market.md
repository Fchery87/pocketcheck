# Anchor forecasts on the market line

The from-scratch forecasting model scores worse than the no-vig close in every market, so the next artifact starts from the anchor line and learns only an adjustment to it from team efficiency, quarterback, injury, and weather inputs. The alternative, adding those inputs to the from-scratch model, keeps the model independent of the market but leaves it competing with the market's full information.

## Consequences

- Historical training and evaluation can only anchor on the recorded close, which already contains late news. Close-anchored holdout scores are development evidence and overstate what a decision-time anchor achieves; only prospective forecasts anchored on the user's entered line can satisfy the release protocol.
- A forecast without an anchor line is unavailable, not a from-scratch fallback.
- The forecasting model and the market are no longer independent, so agreement between them is not corroboration.
