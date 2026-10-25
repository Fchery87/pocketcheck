export type EvidenceOrigin = "manual" | "automatic";

export type SourceTime = string | "unknown";

export type EvidenceFacts = Record<string, string | number | boolean | null>;

export type EvidenceItem = {
  id: string;
  sourceId: string;
  url: string | null;
  retrievedAt: string;
  publishedAt: SourceTime;
  origin: EvidenceOrigin;
  facts: EvidenceFacts;
  excerpt: string | null;
  checksum: string | null;
  factKey: string | null;
};

export type RoofState = "outdoors" | "dome" | "closed" | "open" | "retractable" | "unknown";

export type ScheduleSpread = {
  nflverseSpreadLine: number;
  homeFavored: boolean;
  homeLine: number;
  display: string;
};

export type ScheduledGame = {
  id: string;
  season: number;
  week: number;
  home: string;
  away: string;
  kickoff: string;
  venue: { name: string; stadiumId: string; roof: RoofState };
  finalScore: { home: number; away: number } | null;
  scheduleSpread: ScheduleSpread | null;
};

export type EvidenceConflict = {
  factKey: string;
  itemIds: string[];
  summary: string;
};

export type EvidencePacket = {
  decisionCutoff: string;
  game: ScheduledGame | null;
  items: EvidenceItem[];
  rejectedAfterCutoff: EvidenceItem[];
  conflicts: EvidenceConflict[];
  gaps: string[];
};
