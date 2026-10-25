import { describe, expect, it } from "vite-plus/test";
import { parentsFirst } from "./order.ts";

type Row = { id: string; parentId: string | null };

const parentOf = (row: Row) => row.parentId;

function positions(rows: Row[]) {
  return new Map(rows.map((row, index) => [row.id, index]));
}

describe("parentsFirst", () => {
  it("puts every parent before its children in a shuffled chain and branch", () => {
    // a <- b <- c <- d, and a <- e
    const rows: Row[] = [
      { id: "d", parentId: "c" },
      { id: "x", parentId: null },
      { id: "c", parentId: "b" },
      { id: "e", parentId: "a" },
      { id: "b", parentId: "a" },
      { id: "a", parentId: null },
    ];
    const ordered = parentsFirst(rows, parentOf);
    const at = positions(ordered);
    expect(ordered).toHaveLength(rows.length);
    for (const row of rows) {
      if (row.parentId) expect(at.get(row.parentId)!).toBeLessThan(at.get(row.id)!);
    }
  });

  it("keeps a row whose parent is outside the set, for the database to resolve", () => {
    const ordered = parentsFirst([{ id: "child", parentId: "already-stored" }], parentOf);
    expect(ordered.map((row) => row.id)).toEqual(["child"]);
  });

  it("refuses a cycle", () => {
    expect(() =>
      parentsFirst(
        [
          { id: "a", parentId: "b" },
          { id: "b", parentId: "a" },
        ],
        parentOf,
      ),
    ).toThrow(/cycle/);
  });
});
