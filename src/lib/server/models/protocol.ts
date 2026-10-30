import { parseOffer, type Market, type Offer } from "#lib/domain/offer.ts";
import { PROSPECTIVE_PROTOCOL, type EvaluationProtocol } from "./release.ts";

export type ProtocolRegistration = {
  id: string;
  registeredAt: string;
  protocol: EvaluationProtocol;
  cohort: "primary-model-picks";
};

export type ClosingMarketSnapshot = {
  id: string;
  gameId: string;
  market: Market;
  offers: [Offer, Offer];
  observedAt: string;
  recordedAt: string;
  source: string;
};

function instant(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("Invalid observation or registration time.");
  return result;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseProtocolRegistration(value: unknown): ProtocolRegistration {
  if (!object(value) || !object(value.protocol) || !object(value.protocol.period)) {
    throw new Error("Invalid protocol registration.");
  }
  const p = value.protocol;
  const period = value.protocol.period;
  const markets = p.markets;
  if (
    typeof value.id !== "string" ||
    typeof value.registeredAt !== "string" ||
    value.cohort !== "primary-model-picks" ||
    typeof p.id !== "string" ||
    typeof p.artifactChecksum !== "string" ||
    p.role !== PROSPECTIVE_PROTOCOL.role ||
    p.inputAvailability !== PROSPECTIVE_PROTOCOL.inputAvailability ||
    p.minimumPricedGames !== PROSPECTIVE_PROTOCOL.minimumPricedGames ||
    p.uncertainty !== PROSPECTIVE_PROTOCOL.uncertainty ||
    p.criteria !== PROSPECTIVE_PROTOCOL.criteria ||
    p.frozenBeforeOutcomes !== true ||
    !Array.isArray(markets) ||
    markets.length !== 3 ||
    new Set(markets).size !== 3 ||
    !PROSPECTIVE_PROTOCOL.markets.every((market) => markets.includes(market)) ||
    typeof period.start !== "string" ||
    (period.end !== null && typeof period.end !== "string")
  ) {
    throw new Error("The protocol does not match the frozen release criteria.");
  }
  const registration: ProtocolRegistration = {
    id: value.id,
    registeredAt: value.registeredAt,
    cohort: value.cohort,
    protocol: {
      ...PROSPECTIVE_PROTOCOL,
      id: p.id,
      artifactChecksum: p.artifactChecksum,
      period: { start: period.start, end: period.end },
    },
  };
  validateProtocolRegistration(registration);
  return registration;
}

export function validateProtocolRegistration(value: ProtocolRegistration): void {
  const p = value.protocol;
  if (!value.id || value.cohort !== "primary-model-picks")
    throw new Error("Invalid protocol registration.");
  if (!p.id || !/^[a-f0-9]{64}$/.test(p.artifactChecksum)) {
    throw new Error("The protocol needs an identity and artifact checksum.");
  }
  if (
    p.role !== "independent" ||
    p.frozenBeforeOutcomes !== true ||
    p.inputAvailability !== PROSPECTIVE_PROTOCOL.inputAvailability ||
    p.minimumPricedGames !== PROSPECTIVE_PROTOCOL.minimumPricedGames ||
    p.criteria !== PROSPECTIVE_PROTOCOL.criteria ||
    p.uncertainty !== PROSPECTIVE_PROTOCOL.uncertainty ||
    p.markets.length !== 3 ||
    new Set(p.markets).size !== 3 ||
    !PROSPECTIVE_PROTOCOL.markets.every((market) => p.markets.includes(market))
  ) {
    throw new Error("The protocol does not match the frozen release criteria.");
  }
  const registered = instant(value.registeredAt);
  const start = instant(p.period.start);
  if (
    p.id === PROSPECTIVE_PROTOCOL.id &&
    (p.period.start !== PROSPECTIVE_PROTOCOL.period.start ||
      p.period.end !== PROSPECTIVE_PROTOCOL.period.end)
  ) {
    throw new Error("The frozen protocol period cannot be changed.");
  }
  if (
    (p.id !== PROSPECTIVE_PROTOCOL.id && start < registered) ||
    (p.period.end !== null && instant(p.period.end) <= start)
  ) {
    throw new Error("The evaluation period must start at or after registration.");
  }
}

export function validateClosingMarketSnapshot(value: ClosingMarketSnapshot): void {
  if (
    !value.id ||
    !value.gameId ||
    !value.source.trim() ||
    !Array.isArray(value.offers) ||
    value.offers.length !== 2
  ) {
    throw new Error("A closing market snapshot needs a game, source, and two sides.");
  }
  const observed = instant(value.observedAt);
  if (instant(value.recordedAt) < observed)
    throw new Error("A closing observation cannot be recorded before it was observed.");
  const [first, second] = value.offers;
  for (const offer of value.offers) {
    const parsed = parseOffer({
      gameId: offer.gameId,
      sportsbook: offer.sportsbook,
      market: offer.market,
      selection: offer.selection,
      pointLine: offer.pointLine ?? undefined,
      americanOdds: offer.americanOdds,
      observedAt: offer.observedAt,
      kickoffAt: offer.kickoffAt,
      rules: offer.rules,
    });
    if (
      parsed.decimalOdds !== offer.decimalOdds ||
      offer.gameId !== value.gameId ||
      offer.market !== value.market ||
      offer.observedAt !== value.observedAt
    ) {
      throw new Error("Closing quote terms do not match the snapshot.");
    }
  }
  const sides = value.market === "total" ? ["over", "under"] : ["home", "away"];
  if (
    !sides.includes(first.selection) ||
    !sides.includes(second.selection) ||
    first.selection === second.selection ||
    first.sportsbook !== second.sportsbook ||
    first.kickoffAt !== second.kickoffAt ||
    JSON.stringify(first.rules) !== JSON.stringify(second.rules) ||
    (value.market === "spread"
      ? first.pointLine !== -(second.pointLine ?? NaN)
      : first.pointLine !== second.pointLine)
  ) {
    throw new Error(
      "Closing quotes must be opposite sides of the same contract at one sportsbook.",
    );
  }
}
