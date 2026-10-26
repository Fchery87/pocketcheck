import type { EvidenceItem } from "../sources/contracts.ts";

export type ManualEvidenceInput = {
  text: string;
  url: string;
  sourceTime: string;
  covers?: "injury-report" | "weather";
  team?: string;
};

export type RequestInputs = {
  scheduleRetrievedAt: string;
  manualEvidence: {
    text: string;
    url: string;
    sourceTime: string;
    covers: "injury-report" | "weather" | null;
    team: string | null;
  }[];
  carriedEvidence: EvidenceItem[];
  drafter: { provider: string; modelId: string };
};

export type AttemptRequest = {
  id: string;
  hash: string;
  inputs: RequestInputs;
};
