# Game board and model picks map

Spec: [spec.md](spec.md). Integration branch: `feature/model-picks`.

## Notes

- Database checks run against a disposable local cluster, never `DATABASE_URL`.

## Decisions-so-far

- [01](issues/01-browser-fixture-forecasting-model.md): browser verification runs a checked-in, unreleased fixture model (`tests/fixtures/models/browser-forecasting-model.json`) whose checksum is pinned; startup rejects any other model.
- [02](issues/02-opt-in-phone-access.md): phone access is opt-in via `HOST=<lan-ip> npm start`; default stays `127.0.0.1`, with a no-login warning (`build/index.js` alone binds all interfaces).
- Browser port: `POCKETCHECK_BROWSER_PORT` sets the browser server port and the `npm start` launcher uses that port plus one; the runner probes for a free pair when it is unset, so worktrees can verify at the same time.
- Host allowlist: the `npm start` launcher answers 421 to any `Host` that is not loopback, one of this machine's interface addresses, or listed in `ALLOWED_HOSTS`, which closes the DNS-rebinding hole.
- [03](issues/03-moneyline-game-board-tracer.md): a moneyline game board freezes with its own submission identifier and yields a versioned model pick (`model-pick-2026-10-27.1`) on `/board` and `/board/[id]`; migration 012 adds the records, and boards reject odds from -100 to +100.

- [05](issues/05-model-pick-reasons.md): model pick cards show forecast drivers and gaps; manual evidence and the private lean are saved apart from the pick (migration 013), and a refresh carries both from its parent.
- [07](issues/07-game-board-refresh.md): a refresh is a linked child board whose pick links to the parent pick are trigger-enforced (migration 015); the parent never changes.
- [08](issues/08-settlement-grades-model-picks.md): settlement notices for model picks are keyed to the game (migration 014); grades are derived on read and corrections name the earlier notice.
- [10](issues/10-actual-bet-from-model-pick.md): an actual bet stores an optional `model_pick_id` (migration 016); settlement of pick bets is left to ticket 13.

- 04: American odds under 100 in absolute value are rejected in every flow (analyses used to accept -50).

## Fog

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
