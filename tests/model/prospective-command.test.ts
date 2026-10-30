import { afterEach, describe, expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOffer } from "../../src/lib/domain/offer.ts";
import { PROSPECTIVE_PROTOCOL } from "../../src/lib/server/models/release.ts";

const artifactBytes = readFileSync("tests/fixtures/models/browser-forecasting-model.json", "utf8");
const artifact = JSON.parse(artifactBytes);
const registration = {
  id: "command-registration",
  registeredAt: "2026-10-27T00:00:00.000Z",
  cohort: "primary-model-picks",
  protocol: { ...PROSPECTIVE_PROTOCOL, artifactChecksum: artifact.checksum },
};
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(count: number) {
  const gameBoards = [],
    gameSettlementNotices = [],
    closingMarketSnapshots = [];
  for (let i = 0; i < count; i++) {
    const gameId = `game-${i}`;
    const kickoff = new Date(
      Date.parse("2026-11-01T18:00:00Z") + (i % 20) * 7 * 86400000,
    ).toISOString();
    const cutoff = new Date(Date.parse(kickoff) - 7200000).toISOString();
    const observedAt = new Date(Date.parse(kickoff) - 3600000).toISOString();
    const quote = (selection: "home" | "away", time: string) =>
      parseOffer({
        gameId,
        sportsbook: "book",
        market: "moneyline",
        selection,
        americanOdds: -110,
        observedAt: time,
        kickoffAt: kickoff,
        rules: { period: "full-game", overtime: "included", tie: "push" },
      });
    gameBoards.push({
      id: `board-${i}`,
      game: { id: gameId, kickoff },
      parentId: null,
      withdrawal: null,
      request: { protocolRegistrationId: registration.id },
      status: "completed",
      cutoffAt: cutoff,
      completedAt: new Date(Date.parse(cutoff) + 60000).toISOString(),
      markets: [
        {
          market: "moneyline",
          offers: [quote("home", cutoff), quote("away", cutoff)],
          pick: {
            id: `pick-${i}`,
            boardId: `board-${i}`,
            market: "moneyline",
            role: { role: "primary", reason: "frozen", protocolId: PROSPECTIVE_PROTOCOL.id },
            forecastingModel: { checksum: artifact.checksum },
            calculation: { pickedSelection: "home" },
            forecast: {
              provenance: "captured",
              decisionCutoff: cutoff,
              artifact: { checksum: artifact.checksum },
              protocolRegistrationId: registration.id,
              inputAvailability: { version: PROSPECTIVE_PROTOCOL.inputAvailability },
              marketEligibility: { market: "moneyline" },
              probabilities: { win: 0.7, loss: 0.3, push: 0 },
            },
          },
        },
      ],
    });
    gameSettlementNotices.push({
      id: randomUUID(),
      eventId: `event-${i}`,
      gameId,
      analysisId: null,
      betId: null,
      kind: "final",
      homeScore: 24,
      awayScore: 14,
      source: "score",
      reason: null,
      correctsId: null,
      recordedAt: new Date(Date.parse(kickoff) + 14400000).toISOString(),
      payloadKey: `score-${i}`,
    });
    closingMarketSnapshots.push({
      id: randomUUID(),
      gameId,
      market: "moneyline",
      observedAt,
      recordedAt: new Date(Date.parse(kickoff) - 1800000).toISOString(),
      source: "book",
      offers: [quote("home", observedAt), quote("away", observedAt)],
    });
  }
  return {
    version: 1,
    games: [],
    offers: [],
    evidence: [],
    analyses: [],
    reports: [],
    userResearch: [],
    bets: [],
    settlements: [],
    closings: [],
    protocolRegistrations: [structuredClone(registration)],
    gameBoards,
    gameSettlementNotices,
    closingMarketSnapshots,
  };
}
function setup(count = 1) {
  const directory = mkdtempSync(join(tmpdir(), "pocketcheck-command-"));
  directories.push(directory);
  const paths = {
    journal: join(directory, "journal.json"),
    protocol: join(directory, "protocol.json"),
    artifact: join(directory, "artifact.json"),
    output: join(directory, "output.json"),
  };
  const journal = fixture(count);
  writeFileSync(paths.journal, JSON.stringify(journal));
  writeFileSync(paths.protocol, JSON.stringify(registration));
  writeFileSync(paths.artifact, artifactBytes);
  return { directory, paths, journal };
}
function run(command: "prospective" | "release", paths: ReturnType<typeof setup>["paths"]) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      `scripts/model/${command}.ts`,
      ...(command === "release" ? [paths.artifact] : []),
      paths.journal,
      paths.protocol,
      paths.output,
    ],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DATABASE_URL: "",
        TEST_DATABASE_URL: "",
      },
    },
  );
}
function unchangedFailure(command: "prospective" | "release", context: ReturnType<typeof setup>) {
  const before = Object.fromEntries(
    Object.entries(context.paths)
      .filter(([, path]) => existsSync(path))
      .map(([key, path]) => [key, readFileSync(path, "utf8")]),
  );
  const result = run(command, context.paths);
  expect(result.status, result.stderr).toBe(1);
  for (const [key, bytes] of Object.entries(before))
    expect(readFileSync(context.paths[key as keyof typeof context.paths], "utf8")).toBe(bytes);
  if (!("output" in before)) expect(existsSync(context.paths.output)).toBe(false);
  expect(readdirSync(context.directory).some((name) => name.endsWith(".tmp"))).toBe(false);
  return result;
}

describe("prospective command boundary", { timeout: 120000 }, () => {
  it("writes failed-sample diagnostics with provenance and explicit denominators", () => {
    const context = setup();
    const result = run("prospective", context.paths);
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(readFileSync(context.paths.output, "utf8"));
    expect(report.version).toBe(1);
    expect(report.protocol).toEqual(registration);
    expect(report.artifactChecksum).toBe(artifact.checksum);
    expect(report.denominators.markets.moneyline.pricedGames).toBe(1);
    expect(report.sourceIdentities.boards[0]).toEqual({
      boardId: "board-0",
      gameId: "game-0",
      picks: ["pick-0"],
    });
    expect(report.sources.journal.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evaluation.markets.moneyline.release.released).toBe(false);
    context.paths.output = join(context.directory, "release.json");
    unchangedFailure("release", context);
  });
  it("reports excluded missing provenance and refuses release", () => {
    const context = setup();
    context.journal.gameBoards[0]!.completedAt = "";
    writeFileSync(context.paths.journal, JSON.stringify(context.journal));
    const result = run("prospective", context.paths);
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(readFileSync(context.paths.output, "utf8"));
    expect(report.denominators.qualified).toBe(0);
    expect(report.excluded).toEqual([{ id: "pick-0", reason: "missing-completion-provenance" }]);
    context.paths.output = join(context.directory, "release.json");
    unchangedFailure("release", context);
  });
  it("rejects malformed JSON and malformed versioned journals without writes", () => {
    for (const field of ["journal", "protocol", "artifact"] as const) {
      const context = setup();
      writeFileSync(context.paths[field], "{");
      if (field !== "artifact") unchangedFailure("prospective", context);
      unchangedFailure("release", context);
    }
    const context = setup();
    writeFileSync(context.paths.journal, JSON.stringify({ version: 1, gameBoards: "bad" }));
    unchangedFailure("prospective", context);
    unchangedFailure("release", context);
  });
  it("rejects standalone proof, edited verdicts, changed registration and changed periods", () => {
    for (const mutation of [
      "missing",
      "verdict",
      "registration",
      "period",
      "both-periods",
    ] as const) {
      const context = setup();
      const reference = structuredClone(registration);
      if (mutation === "missing") context.journal.protocolRegistrations = [];
      if (mutation === "registration") reference.registeredAt = "2026-10-28T00:00:00Z";
      if (mutation === "period" || mutation === "both-periods")
        reference.protocol.period.start = "2026-10-28T00:00:00Z";
      if (mutation === "both-periods") context.journal.protocolRegistrations[0] = reference;
      writeFileSync(context.paths.journal, JSON.stringify(context.journal));
      writeFileSync(
        context.paths.protocol,
        JSON.stringify(mutation === "verdict" ? { ...reference, released: true } : reference),
      );
      unchangedFailure("prospective", context);
      unchangedFailure("release", context);
    }
  });
  it("passes synthetic evidence only and protects existing outputs and input aliases", () => {
    const context = setup(500);
    const prospectiveResult = run("prospective", context.paths);
    expect(prospectiveResult.status, prospectiveResult.stderr).toBe(0);
    const report = JSON.parse(readFileSync(context.paths.output, "utf8"));
    expect(report.evaluation.markets.moneyline.release.released).toBe(true);
    expect(report.denominators.markets.moneyline.pricedGames).toBe(500);
    unchangedFailure("prospective", context);
    unchangedFailure("release", context);
    context.paths.output = join(context.directory, "released.json");
    const result = run("release", context.paths);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(context.paths.output, "utf8")).releasedMarkets).toEqual([
      "moneyline",
    ]);
    for (const input of [context.paths.journal, context.paths.protocol, context.paths.artifact]) {
      context.paths.output = input;
      unchangedFailure("prospective", context);
      unchangedFailure("release", context);
      for (const kind of ["symlink", "hardlink"] as const) {
        context.paths.output = join(context.directory, `${kind}-${input.split("/").at(-1)}`);
        (kind === "symlink" ? symlinkSync : linkSync)(input, context.paths.output);
        unchangedFailure("prospective", context);
        unchangedFailure("release", context);
      }
    }
    expect(readFileSync(context.paths.artifact, "utf8")).toBe(artifactBytes);
  }, 240000);
});
