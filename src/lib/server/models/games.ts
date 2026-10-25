export type CompletedGame = {
  id: string;
  kickoff: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  neutral?: boolean;
};

export type PriceSide = {
  american: number;
};

export type HistoricalPrices = {
  moneyline?: { home: PriceSide; away: PriceSide };
  spread?: { line: number; home: PriceSide; away: PriceSide };
  total?: { line: number; over: PriceSide; under: PriceSide };
};

export type PricedGame = CompletedGame & {
  prices?: HistoricalPrices | null;
};

export function kickoffMs(game: { kickoff: string }): number {
  const ms = Date.parse(game.kickoff);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid kickoff: ${game.kickoff}`);
  }
  return ms;
}

export function marginHome(game: CompletedGame): number {
  return game.homeScore - game.awayScore;
}

export function totalPoints(game: CompletedGame): number {
  return game.homeScore + game.awayScore;
}
