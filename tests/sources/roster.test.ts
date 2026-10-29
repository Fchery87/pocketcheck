import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { depthChartFromCsv, readSeasonFiles } from "../../src/lib/server/sources/roster.ts";

const CURRENT = [
  "dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank",
  "2025-11-02T07:13:47Z,PHI,Jalen Hurts,4040715,00-0036389,21,3WR 1TE,8,Quarterback,QB,9,1",
  "2026-03-14T07:32:09Z,PHI,Tanner McKee,4685201,00-0038400,21,3WR 1TE,8,Quarterback,QB,9,2",
].join("\n");

describe("depth chart parser", () => {
  it("reads the timestamped snapshot schema and takes the season from the snapshot date", () => {
    const read = depthChartFromCsv(CURRENT);
    expect(read.gaps).toEqual([]);
    expect(read.rows[0]).toEqual({
      season: 2025,
      week: 0,
      team: "PHI",
      position: "QB",
      depth: 1,
      playerId: "00-0036389",
      player: "Jalen Hurts",
      updatedAt: "2025-11-02T07:13:47Z",
    });
    // March 2026 still belongs to the 2025 season.
    expect(read.rows[1]?.season).toBe(2025);
  });

  it("reads the older season and week schema", () => {
    const read = depthChartFromCsv(
      "season,week,club_code,position,depth_team,gsis_id,full_name\n2024,3,PHI,QB,1,00-0036389,Jalen Hurts",
    );
    expect(read.rows[0]).toMatchObject({ season: 2024, week: 3, team: "PHI", updatedAt: null });
  });

  it("reports an empty or unusable file as a gap", () => {
    expect(depthChartFromCsv("").gaps[0]).toMatch(/empty/);
    expect(depthChartFromCsv("a,b\n1,2").gaps[0]).toMatch(/no usable rows/);
  });

  it("reads a full season file of daily snapshots", { timeout: 30_000 }, () => {
    const [header, row] = CURRENT.split("\n");
    const path = join(mkdtempSync(join(tmpdir(), "pocketcheck-roster-")), "depth.csv");
    writeFileSync(path, [header, ...Array.from({ length: 300_000 }, () => row)].join("\n"));
    const read = readSeasonFiles([{ season: 2025, path }], depthChartFromCsv, "Depth chart");
    expect(read.rows).toHaveLength(300_000);
  });
});
