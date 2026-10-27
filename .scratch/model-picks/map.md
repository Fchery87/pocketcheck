# Game board and model picks map

Spec: [spec.md](spec.md). Integration branch: `feature/model-picks`.

## Notes

- Database checks run against a disposable local cluster, never `DATABASE_URL`.

## Decisions-so-far

- [01](issues/01-browser-fixture-forecasting-model.md): browser verification runs a checked-in, unreleased fixture model (`tests/fixtures/models/browser-forecasting-model.json`) whose checksum is pinned; startup rejects any other model.
- [02](issues/02-opt-in-phone-access.md): phone access is opt-in via `HOST=<lan-ip> npm start`; default stays `127.0.0.1`, with a no-login warning (`build/index.js` alone binds all interfaces).

## Fog

- Settlement keying for model picks (game vs. board) is decided in ticket 08.
- Whether boards need export version 2 is decided in ticket 11.

## Tickets

| Ticket                                                                                  | Blocked by         |
| --------------------------------------------------------------------------------------- | ------------------ |
| [01: Browser fixture forecasting model](issues/01-browser-fixture-forecasting-model.md) | None               |
| [02: Opt-in phone access](issues/02-opt-in-phone-access.md)                             | None               |
| [03: Moneyline game board to model pick](issues/03-moneyline-game-board-tracer.md)      | 01                 |
| [04: Spread, total, and board validation](issues/04-spread-total-board-validation.md)   | 03                 |
| [05: Model pick reasons](issues/05-model-pick-reasons.md)                               | 03                 |
| [06: Drafter explanation](issues/06-drafter-pick-explanation.md)                        | 05                 |
| [07: Game board refresh](issues/07-game-board-refresh.md)                               | 04                 |
| [08: Settlement grades model picks](issues/08-settlement-grades-model-picks.md)         | 04                 |
| [09: Primary model picks and performance](issues/09-primary-model-picks-performance.md) | 07, 08             |
| [10: Actual bet from a model pick](issues/10-actual-bet-from-model-pick.md)             | 04                 |
| [11: Export and restore include boards](issues/11-export-restore-boards.md)             | 06, 07, 08, 09, 10 |
| [12: Docs and handbook](issues/12-docs-and-handbook.md)                                 | 06, 09, 11         |
