import type {
  PlayByPlayRead,
  QuarterbackGameSummary,
  TeamGameSummary,
} from "../sources/play-by-play.ts";
import type { CompletedGame, UnitRates } from "./games.ts";

const negate = (value: number | null): number | null => (value === null ? null : -value);

/** What a unit gained on offense. */
function offenseOf(summary: TeamGameSummary): UnitRates {
  return {
    passEpa: summary.passEpaPerPlay,
    rushEpa: summary.rushEpaPerPlay,
    success: summary.successRate,
    earlyDownEpa: summary.earlyDownEpaPerPlay,
    explosive: summary.explosiveRate,
  };
}

/** What a defense prevented: the opponent's offense with the sign turned, so higher is better. */
function preventedBy(opponent: TeamGameSummary): UnitRates {
  return {
    passEpa: negate(opponent.passEpaPerPlay),
    rushEpa: negate(opponent.rushEpaPerPlay),
    success: negate(opponent.successRate),
    earlyDownEpa: negate(opponent.earlyDownEpaPerPlay),
    explosive: negate(opponent.explosiveRate),
  };
}

/** The starter's line: the named starter if he threw, else the passer with the most dropbacks. */
function starterLine(
  passers: readonly QuarterbackGameSummary[],
  team: string,
  named: string | undefined,
): QuarterbackGameSummary | null {
  const own = passers.filter((passer) => passer.team === team);
  return (
    own.find((passer) => passer.playerId === named) ??
    own.sort((a, b) => b.dropbacks - a.dropbacks)[0] ??
    null
  );
}

/**
 * Attaches each finished game's play-by-play numbers. A game with plays for only one side, or no
 * EPA for either offense, is left without efficiency and contributes nothing to the ratings.
 */
export function attachEfficiency<T extends CompletedGame>(
  games: readonly T[],
  read: PlayByPlayRead,
): T[] {
  const teams = new Map<string, TeamGameSummary>();
  for (const summary of read.summaries) teams.set(`${summary.gameId}|${summary.team}`, summary);
  const passers = new Map<string, QuarterbackGameSummary[]>();
  for (const passer of read.quarterbacks) {
    const list = passers.get(passer.gameId) ?? [];
    list.push(passer);
    passers.set(passer.gameId, list);
  }
  return games.map((game) => {
    const home = teams.get(`${game.id}|${game.home}`);
    const away = teams.get(`${game.id}|${game.away}`);
    if (
      !home ||
      !away ||
      home.offenseEpaPerPlay === null ||
      away.offenseEpaPerPlay === null ||
      home.defenseEpaPerPlay === null ||
      away.defenseEpaPerPlay === null
    ) {
      return game;
    }
    const lines = passers.get(game.id) ?? [];
    const homeQb = starterLine(lines, game.home, game.homeQb);
    const awayQb = starterLine(lines, game.away, game.awayQb);
    return {
      ...game,
      efficiency: {
        homeOffenseEpa: home.offenseEpaPerPlay,
        awayOffenseEpa: away.offenseEpaPerPlay,
        homeDefenseEpa: home.defenseEpaPerPlay,
        awayDefenseEpa: away.defenseEpaPerPlay,
        homeSecondsPerPlay: home.secondsPerPlay,
        awaySecondsPerPlay: away.secondsPerPlay,
        homePassOverExpected: home.passRateOverExpected,
        awayPassOverExpected: away.passRateOverExpected,
        homeQbEpa: homeQb?.epaPerDropback ?? null,
        awayQbEpa: awayQb?.epaPerDropback ?? null,
        homeQbCpoe: homeQb?.cpoe ?? null,
        awayQbCpoe: awayQb?.cpoe ?? null,
        homeQbDropbacks: homeQb?.dropbacks ?? 0,
        awayQbDropbacks: awayQb?.dropbacks ?? 0,
        home: {
          offense: offenseOf(home),
          defense: preventedBy(away),
          giveaways: home.turnovers,
          fumblesRecovered: home.fumbleRecoveries,
        },
        away: {
          offense: offenseOf(away),
          defense: preventedBy(home),
          giveaways: away.turnovers,
          fumblesRecovered: away.fumbleRecoveries,
        },
      },
    };
  });
}
