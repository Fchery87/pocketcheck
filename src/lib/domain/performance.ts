export type StakeResult = {
  profit: number;
  stake: number;
  status: "settled" | "unresolved";
};

export function returnOnSettledStakes(
  rows: StakeResult[],
): { available: true; roi: number } | { available: false; reason: "empty-denominator" } {
  const settled = rows.filter((row) => row.status === "settled");
  const denominator = settled.reduce((total, row) => total + row.stake, 0);
  if (denominator === 0) {
    return { available: false, reason: "empty-denominator" };
  }
  const profit = settled.reduce((total, row) => total + row.profit, 0);
  return { available: true, roi: profit / denominator };
}
