/**
 * Order rows so each row comes after the row it references, such as a refresh after its
 * parent or a settlement correction after the settlement it corrects. A reference outside the
 * set is left for the database's foreign key to resolve.
 */
export function parentsFirst<T extends { id: string }>(
  rows: T[],
  parentOf: (row: T) => string | null,
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const placed = new Set<string>();
  const ordered: T[] = [];
  const place = (row: T, path: Set<string>) => {
    if (placed.has(row.id)) return;
    if (path.has(row.id)) throw new Error(`Reference cycle at ${row.id}`);
    path.add(row.id);
    const parentId = parentOf(row);
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) place(parent, path);
    placed.add(row.id);
    ordered.push(row);
  };
  for (const row of rows) place(row, new Set());
  return ordered;
}
