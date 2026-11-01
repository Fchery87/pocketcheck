import { describe, expect, it } from "vite-plus/test";
import { encodeJournalBackup, type JournalExport } from "#lib/server/analysis/journal-backup.ts";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runAnalysis } from "#lib/server/analysis/run.ts";
import { createMemoryStore, type MemoryJournal } from "#lib/server/analysis/store.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const DUMMY_KEY = "claw_dummy_4b7e1d09aa";
const game = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW).find(
  (item) => item.id === "2026_07_DAL_PHI",
)!;

async function journalWith(rationale: string): Promise<JournalExport> {
  const store = createMemoryStore({ now: () => NOW });
  const outcome = await runAnalysis(
    {
      game,
      nowIso: NOW,
      scheduleRetrievedAt: "2026-10-25T12:00:00.000Z",
      sportsbook: "Example Book",
      market: "moneyline",
      selection: "home",
      americanOdds: -110,
      observedAt: "2026-10-25T15:30:00.000Z",
      tieRule: "push",
      lean: "PHI",
      rationale,
      requestId: "backup-secret",
    },
    { store },
  );
  if (!outcome.ok) throw new Error(outcome.error);
  return store.exportJournal();
}

describe("journal backup encoding", () => {
  it("rejects a record holding a configured secret and names its path without rewriting it", async () => {
    const journal = await journalWith(`pasted by mistake: ${DUMMY_KEY}`);
    const saved = structuredClone(journal);
    const run = (journal as MemoryJournal).runs[0]!;
    let failure: unknown;
    try {
      encodeJournalBackup(journal, { secrets: [DUMMY_KEY] });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain(`runs[id=${run.id}].lean.rationale`);
    expect(message).not.toContain(DUMMY_KEY);
    expect(journal).toEqual(saved);
  });

  it("rejects a recognizable provider key even when it is not configured", async () => {
    const journal = await journalWith("note sk-abcdefghijklmnop1234 from an old run");
    expect(() => encodeJournalBackup(journal, { secrets: [] })).toThrow(
      /runs\[id=[^\]]+\]\.lean\.rationale/,
    );
  });

  it("rejects a saved credential header whatever its value", async () => {
    const journal = (await journalWith("Home rest edge")) as MemoryJournal;
    const run = journal.runs[0]!;
    const tampered = {
      ...journal,
      runs: [{ ...run, providerRequests: [{ response: { Authorization: "Basic dXNlcjpwdw==" } }] }],
    } as JournalExport;
    expect(() => encodeJournalBackup(tampered, { secrets: [] })).toThrow(
      `runs[id=${run.id}].providerRequests[0].response.Authorization`,
    );
  });

  it("writes only the journal record lists, never settings or credentials", async () => {
    const journal = await journalWith("Home rest edge");
    const leaky = {
      ...journal,
      settings: { drafter: { provider: "deepseek", modelId: "deepseek-flash" } },
      credentials: { deepseek: DUMMY_KEY },
    } as JournalExport;
    const file = JSON.parse(encodeJournalBackup(leaky, { secrets: [] }));
    expect(file).not.toHaveProperty("settings");
    expect(file).not.toHaveProperty("credentials");
    expect(file).toEqual(JSON.parse(JSON.stringify(journal)));
  });
});
