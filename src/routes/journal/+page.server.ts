import { randomUUID } from "node:crypto";
import { error, fail } from "@sveltejs/kit";
import {
  parseOffer,
  type Market,
  type OfferRules,
  type SideSelection,
  type TieRule,
} from "#lib/domain/offer.ts";
import { ConfigError, now, researchStore } from "#lib/server/config.ts";
import { journalSummaries } from "#lib/server/analysis/summary.ts";
import type { SettlementNoticeKind } from "#lib/server/analysis/store.ts";
import type { JournalExport } from "#lib/server/db/repository.ts";
import type { Actions, PageServerLoad } from "./$types";

function store() {
  try {
    return researchStore();
  } catch (cause) {
    if (cause instanceof ConfigError) error(503, cause.message);
    throw cause;
  }
}

const markets = new Set<Market>(["moneyline", "spread", "total"]);
const selections = new Set<SideSelection>(["home", "away", "over", "under"]);
const ties = new Set<TieRule>(["push", "loss", "win", "void"]);
const kinds = new Set<SettlementNoticeKind>(["final", "postponed", "void", "unresolved"]);

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The picked contract as editable starting values for the actual-bet form. */
async function pickStart(journal: ReturnType<typeof store>, pickId: string) {
  const board = uuid.test(pickId) ? await journal.getBoardForPick(pickId) : null;
  const market = board?.markets.find((item) => item.pick?.id === pickId);
  const pick = market?.pick;
  if (!board || !market || !pick) return null;
  const offer = market.offers.find((item) => item.selection === pick.calculation.pickedSelection);
  if (!offer) return null;
  return {
    modelPickId: pick.id,
    boardId: board.id,
    game: `${board.game.away} at ${board.game.home}`,
    sportsbook: offer.sportsbook,
    market: market.market,
    selection: offer.selection,
    pointLine: offer.pointLine,
    americanOdds: offer.americanOdds,
    tie: offer.rules.tie ?? "",
    submissionId: randomUUID(),
  };
}

export const load: PageServerLoad = async ({ url }) => {
  const journal = store();
  const pickId = url.searchParams.get("pick");
  const pickBet = pickId ? await pickStart(journal, pickId) : null;
  const [assessments, bets, closings, modelPicks] = await Promise.all([
    journal.listCompleted(),
    journal.listBets(),
    journal.listClosings(),
    journal.listModelPicks(),
  ]);
  const settlements = await Promise.all(
    assessments.map(async (assessment) => {
      const related = bets.filter((bet) => bet.analysisId === assessment.id);
      const rows = [];
      for (const bet of related) {
        const read = await journal.readSettlement({
          analysisId: assessment.id,
          betId: bet.id,
        });
        rows.push({ betId: bet.id, grade: read.bet });
      }
      const read = await journal.readSettlement({ analysisId: assessment.id });
      if (!read.assessment) throw new Error(`Analysis not found: ${assessment.id}`);
      return {
        analysisId: assessment.id,
        assessment: read.assessment,
        bets: rows,
      };
    }),
  );
  const pickBetGrades = await Promise.all(
    bets
      .filter((bet) => bet.modelPickId && !bet.analysisId)
      .map(async (bet) => {
        const read = await journal.readSettlement({ betId: bet.id });
        return { betId: bet.id, grade: read.bet };
      }),
  );
  const betGrades = [...settlements.flatMap((row) => row.bets), ...pickBetGrades];
  const performance = journalSummaries({
    assessments: assessments.map((assessment) => ({
      ...assessment,
      americanOdds: assessment.offer.americanOdds,
      grade: settlements.find((row) => row.analysisId === assessment.id)?.assessment ?? {
        result: "unresolved",
        effective: "unresolved",
        history: [],
      },
    })),
    bets: bets.map((bet) => ({
      ...bet,
      grade: betGrades.find((row) => row.betId === bet.id)?.grade ?? null,
    })),
    closings,
  });
  return {
    assessments,
    bets,
    settlements,
    pickBetGrades,
    closings,
    performance,
    pickBet,
    modelPicks,
  };
};

export const actions = {
  bet: async ({ request }) => {
    const data = await request.formData();
    const analysisId = String(data.get("analysisId") ?? "").trim();
    const modelPickId = String(data.get("modelPickId") ?? "").trim();
    const sportsbook = String(data.get("sportsbook") ?? "").trim();
    const market = String(data.get("market") ?? "").trim();
    const selection = String(data.get("selection") ?? "").trim();
    const pointLineText = String(data.get("pointLine") ?? "").trim();
    const americanOdds = Number(data.get("americanOdds"));
    const stakeUnits = Number(data.get("stakeUnits"));
    const tie = String(data.get("tie") ?? "").trim();
    const submissionId = String(data.get("submissionId") ?? "").trim();
    if (!analysisId && !modelPickId)
      return fail(400, {
        recorded: false,
        error: "Choose the analysis this bet belongs to",
      });
    if (!submissionId) {
      return fail(400, {
        recorded: false,
        error: "Enter a submission identifier for this placement",
      });
    }
    if (!markets.has(market as Market)) {
      return fail(400, {
        recorded: false,
        error: "Choose the market you placed",
      });
    }
    if (!selections.has(selection as SideSelection)) {
      return fail(400, {
        recorded: false,
        error: "Choose the selection you placed",
      });
    }
    const pointLine = pointLineText === "" ? undefined : Number(pointLineText);
    if (pointLine !== undefined && !Number.isFinite(pointLine)) {
      return fail(400, { recorded: false, error: "Enter the line you placed" });
    }
    if (market === "moneyline" && !ties.has(tie as TieRule)) {
      return fail(400, {
        recorded: false,
        error: "A moneyline requires a tie rule",
      });
    }
    if (!Number.isFinite(stakeUnits) || stakeUnits <= 0) {
      return fail(400, {
        recorded: false,
        error: "Stake must be a positive number of units",
      });
    }
    const journal = store();
    let contractGame: { id: string; kickoff: string };
    if (modelPickId) {
      const board = uuid.test(modelPickId) ? await journal.getBoardForPick(modelPickId) : null;
      if (!board)
        return fail(400, {
          recorded: false,
          error: `Model pick not found: ${modelPickId}`,
        });
      contractGame = board.game;
    } else {
      const analysis = await journal.getRun(analysisId);
      if (!analysis)
        return fail(400, {
          recorded: false,
          error: `Analysis not found: ${analysisId}`,
        });
      contractGame = analysis.game;
    }
    const rules: OfferRules = {
      period: "full-game",
      overtime: "included",
      ...(market === "moneyline" ? { tie: tie as TieRule } : {}),
    };
    try {
      parseOffer({
        gameId: contractGame.id,
        sportsbook,
        market: market as Market,
        selection: selection as SideSelection,
        pointLine,
        americanOdds,
        observedAt: now(),
        kickoffAt: contractGame.kickoff,
        rules,
      });
    } catch (cause) {
      return fail(400, {
        recorded: false,
        error: cause instanceof Error ? cause.message : "The placed contract is not valid",
      });
    }
    try {
      const result = await journal.recordBet({
        ...(modelPickId ? { modelPickId } : { analysisId }),
        submissionId,
        sportsbook,
        market: market as Market,
        selection: selection as SideSelection,
        pointLine,
        rules,
        americanOdds,
        stakeUnits,
        placedAt: now(),
      });
      if (result.kind === "conflict") return fail(409, { recorded: false, error: result.error });
    } catch (cause) {
      return fail(400, {
        recorded: false,
        error: cause instanceof Error ? cause.message : "Bet was not saved",
      });
    }
    return { recorded: true, settled: false, error: null };
  },
  settle: async ({ request }) => {
    const data = await request.formData();
    const analysisId = String(data.get("analysisId") ?? "").trim();
    const betId = String(data.get("betId") ?? "").trim();
    const eventId = String(data.get("eventId") ?? "").trim();
    const kind = String(data.get("kind") ?? "").trim();
    const homeText = String(data.get("homeScore") ?? "").trim();
    const awayText = String(data.get("awayScore") ?? "").trim();
    const reason = String(data.get("reason") ?? "").trim();
    const correctsNoticeId = String(data.get("correctsNoticeId") ?? "").trim();
    if (!analysisId && !betId) {
      return fail(400, {
        settled: false,
        error: "Choose the analysis or the bet to settle",
      });
    }
    if (!eventId)
      return fail(400, {
        settled: false,
        error: "Enter a settlement event identifier",
      });
    if (!kinds.has(kind as SettlementNoticeKind)) {
      return fail(400, { settled: false, error: "Choose a settlement kind" });
    }
    const homeScore = homeText === "" ? null : Number(homeText);
    const awayScore = awayText === "" ? null : Number(awayText);
    if (kind === "final" && (!Number.isInteger(homeScore) || !Number.isInteger(awayScore))) {
      return fail(400, {
        settled: false,
        error: "A final result needs whole-number scores",
      });
    }
    const journal = store();
    try {
      const result = await journal.recordSettlement({
        eventId,
        analysisId: analysisId || null,
        betId: betId || null,
        kind: kind as SettlementNoticeKind,
        homeScore,
        awayScore,
        recordedAt: now(),
        source: "journal",
        reason: reason || null,
        correctsNoticeId: correctsNoticeId || null,
      });
      if (result.kind === "conflict") return fail(409, { settled: false, error: result.error });
      return {
        recorded: false,
        settled: true,
        duplicate: result.kind === "duplicate",
        error: null,
      };
    } catch (cause) {
      return fail(400, {
        settled: false,
        error: cause instanceof Error ? cause.message : "Settlement was not saved",
      });
    }
  },
  closing: async ({ request }) => {
    const data = await request.formData();
    const subjectKind = String(data.get("subjectKind") ?? "").trim();
    const subjectId = String(data.get("subjectId") ?? "").trim();
    const sportsbook = String(data.get("sportsbook") ?? "").trim();
    const market = String(data.get("market") ?? "").trim();
    const selection = String(data.get("selection") ?? "").trim();
    const pointLineText = String(data.get("pointLine") ?? "").trim();
    const americanOdds = Number(data.get("americanOdds"));
    const observedAt = String(data.get("observedAt") ?? "").trim();
    const source = String(data.get("source") ?? "").trim();
    const tie = String(data.get("tie") ?? "").trim();
    if (subjectKind !== "analysis" && subjectKind !== "bet" && subjectKind !== "model-pick") {
      return fail(400, {
        recorded: false,
        error: "Choose the research, bet, or model pick this close belongs to",
      });
    }
    if (!subjectId) {
      return fail(400, {
        recorded: false,
        error: "Choose the research or bet this close belongs to",
      });
    }
    if (!source)
      return fail(400, {
        recorded: false,
        error: "Name the source of this closing observation",
      });
    if (!observedAt) {
      return fail(400, {
        recorded: false,
        error: "Enter when you observed this closing offer",
      });
    }
    if (!markets.has(market as Market) || !selections.has(selection as SideSelection)) {
      return fail(400, {
        recorded: false,
        error: "Choose the closing market and selection",
      });
    }
    const pointLine = pointLineText === "" ? undefined : Number(pointLineText);
    if (pointLine !== undefined && !Number.isFinite(pointLine)) {
      return fail(400, { recorded: false, error: "Enter the closing line" });
    }
    if (market === "moneyline" && !ties.has(tie as TieRule)) {
      return fail(400, {
        recorded: false,
        error: "A moneyline requires a tie rule",
      });
    }
    const journal = store();
    const rules: OfferRules = {
      period: "full-game",
      overtime: "included",
      ...(market === "moneyline" ? { tie: tie as TieRule } : {}),
    };
    try {
      const result = await journal.recordClosing({
        subject: { kind: subjectKind, id: subjectId },
        sportsbook,
        market: market as Market,
        selection: selection as SideSelection,
        pointLine,
        rules,
        americanOdds,
        observedAt: new Date(observedAt).toISOString(),
        source,
      });
      return { recorded: true, error: null, closingId: result.closing.id };
    } catch (cause) {
      return fail(400, {
        recorded: false,
        error: cause instanceof Error ? cause.message : "Closing observation was not saved",
      });
    }
  },
  restore: async ({ request }) => {
    const data = await request.formData();
    const file = data.get("backup");
    if (!(file instanceof File) || file.size === 0) {
      return fail(400, {
        restored: false,
        error: "Choose a version 1 journal backup to restore.",
      });
    }
    let backup: JournalExport;
    try {
      backup = JSON.parse(await file.text()) as JournalExport;
    } catch {
      return fail(400, {
        restored: false,
        error: "That file is not a journal backup.",
      });
    }
    const journal = store();
    const before = await journal.listCompleted();
    try {
      await journal.restoreJournal(backup);
    } catch (cause) {
      const after = await journal.listCompleted();
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        throw new Error("A rejected journal restore changed the destination.");
      }
      return fail(400, {
        restored: false,
        error: cause instanceof Error ? cause.message : "Journal restore failed.",
      });
    }
    return { restored: true, error: null };
  },
} satisfies Actions;
