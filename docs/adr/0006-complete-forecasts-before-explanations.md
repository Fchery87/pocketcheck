# Complete forecasts before explanation attempts

Status. Accepted.

This clarifies [0005](0005-compose-frozen-report-facts.md). The drafter still cannot change a frozen pick or its authoritative facts.

New boards identify their lifecycle with `request.lifecycleFormat = forecast-first-v1`. The store atomically freezes every market, evidence, gaps, completion time, and primary classification before any explanation request. A failed explanation does not make that completed forecast fail and does not change its classification. Existing failed boards remain failed and excluded under the existing prospective chronology rules.

Explanation attempts have a separate append-only history. One board has at most one active attempt. Every attempt reserves at most one original request and one repair. Only a newly acquired reservation authorizes transport. A reservation without a durable response is ambiguous and must never be replayed automatically. A deliberate new attempt requires the prior attempt to have an explicit terminal event.

Durable responses remain available for validation without another paid request. Original and repair accounting are combined from all response events, retaining unknown values. Failed and ambiguous outcomes stay visible in the read projection. The board's frozen row and completion time are not updated by those projections.

Legacy boards have no lifecycle discriminator. Their inline explanation and provider history remain as saved. Compatibility completion methods exist only for those records. Backup version 1 optionally carries explanation events and validates the whole event graph before restoration in the existing atomic journal transaction.
