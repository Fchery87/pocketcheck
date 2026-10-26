export type ClosingRules = {
  period: string;
  overtime: string;
  tie: string | null;
};

export type ClosingContract = {
  market: string;
  selection: string;
  pointLine: number | null;
  sportsbook: string;
  rules?: ClosingRules;
};

export type ClosingComparison =
  | { available: true; openDecimal: number; closeDecimal: number; difference: number }
  | {
      available: false;
      reason:
        | "different-contract"
        | "missing-closing-price"
        | "missing-open-price"
        | "incompatible-rules"
        | "archived-untimestamped";
      lineMovement?: { openPointLine: number | null; closePointLine: number | null };
    };

function rulesCompatible(open: ClosingContract, close: ClosingContract): boolean {
  if (!open.rules || !close.rules) return true;
  return (
    open.rules.period === close.rules.period &&
    open.rules.overtime === close.rules.overtime &&
    open.rules.tie === close.rules.tie
  );
}

function sameIdentity(open: ClosingContract, close: ClosingContract): boolean {
  return (
    open.market === close.market &&
    open.selection === close.selection &&
    open.pointLine === close.pointLine &&
    open.sportsbook === close.sportsbook
  );
}

/**
 * A direct comparison is the change in decimal odds for one contract:
 * same market, side, point line, sportsbook, and rules.
 * A different point line is line movement, not a comparable odds change.
 * Missing prices are unavailable, never a zero move.
 */
export function compareClosing(
  open: ClosingContract & { decimalOdds: number | null },
  close: ClosingContract & { decimalOdds: number | null },
): ClosingComparison {
  if (!sameIdentity(open, close)) {
    const lineOnly =
      open.market === close.market &&
      open.selection === close.selection &&
      open.sportsbook === close.sportsbook &&
      open.pointLine !== close.pointLine;
    return {
      available: false,
      reason: "different-contract",
      ...(lineOnly
        ? { lineMovement: { openPointLine: open.pointLine, closePointLine: close.pointLine } }
        : {}),
    };
  }
  if (!rulesCompatible(open, close)) {
    return { available: false, reason: "incompatible-rules" };
  }
  if (close.decimalOdds === null || !Number.isFinite(close.decimalOdds)) {
    return { available: false, reason: "missing-closing-price" };
  }
  if (open.decimalOdds === null || !Number.isFinite(open.decimalOdds)) {
    return { available: false, reason: "missing-open-price" };
  }
  return {
    available: true,
    openDecimal: open.decimalOdds,
    closeDecimal: close.decimalOdds,
    difference: close.decimalOdds - open.decimalOdds,
  };
}
