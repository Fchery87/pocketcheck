import { describe, expect, it } from "vite-plus/test";
import { createMemoryJournal } from "#lib/server/analysis/memory-journal.ts";
import type { Offer } from "#lib/domain/offer.ts";
import type { ScheduledGame } from "#lib/server/sources/contracts.ts";

const game: ScheduledGame = {
  id: "2026_07_DAL_PHI",
  season: 2026,
  week: 7,
  home: "PHI",
  away: "DAL",
  kickoff: "2026-10-27T00:15:00.000Z",
  venue: { name: "Lincoln Financial Field", stadiumId: "PHI00", roof: "outdoors" },
  finalScore: null,
  scheduleSpread: null,
};

const offer: Offer = {
  gameId: game.id,
  sportsbook: "Example",
  market: "moneyline",
  selection: "home",
  pointLine: null,
  americanOdds: -110,
  decimalOdds: 1.909090909,
  observedAt: "2026-10-25T16:00:00.000Z",
  kickoffAt: game.kickoff,
  rules: { period: "full-game", overtime: "included", tie: "push" },
  opposing: null,
};

describe("interrupted research runs", () => {
  it("leaves an unfinished run interrupted until a new retry is saved", () => {
    const journal = createMemoryJournal();
    const running = journal.saveRun({
      parentId: null,
      status: "failed",
      stages: ["checking inputs"],
      game,
      offer,
      lean: null,
      evidencePacketSent: "{}",
      report: null,
      renderedText: "",
      failureReason: "stopped",
      policy: null,
    });
    const interrupted = journal.markInterrupted(running.id);
    expect(interrupted?.status).toBe("interrupted");
    const retry = journal.saveRun({
      parentId: running.id,
      status: "completed",
      stages: ["checking inputs"],
      game,
      offer,
      lean: null,
      evidencePacketSent: "{}",
      report: null,
      renderedText: "pass",
      failureReason: null,
      policy: null,
    });
    expect(journal.get(running.id)?.status).toBe("interrupted");
    expect(retry.parentId).toBe(running.id);
    expect(journal.markInterrupted(retry.id)?.status).toBe("completed");
  });
});
