/** Every distinct sportsbook name across the given records, sorted, for a datalist of previously used names. */
export function sportsbooksOf(
  ...lists: Array<Array<{ sportsbook: string }> | undefined>
): string[] {
  return [
    ...new Set(
      lists
        .flatMap((list) => list ?? [])
        .map((row) => row.sportsbook)
        .filter(Boolean),
    ),
  ].sort();
}
