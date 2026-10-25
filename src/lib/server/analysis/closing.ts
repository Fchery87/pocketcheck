export type ClosingContract = {
  market: string;
  selection: string;
  pointLine: number | null;
  sportsbook: string;
};

export type ClosingComparison =
  | { available: true; openDecimal: number; closeDecimal: number; difference: number }
  | {
      available: false;
      reason: "different-contract" | "missing-closing-price" | "missing-open-price";
    };

function sameContract(open: ClosingContract, close: ClosingContract): boolean {
  return (
    open.market === close.market &&
    open.selection === close.selection &&
    open.pointLine === close.pointLine &&
    open.sportsbook === close.sportsbook
  );
}

/** A different point line is unavailable, not a zero move. Missing prices are unavailable. */
export function compareClosing(
  open: ClosingContract & { decimalOdds: number | null },
  close: ClosingContract & { decimalOdds: number | null },
): ClosingComparison {
  if (!sameContract(open, close)) {
    return { available: false, reason: "different-contract" };
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
