import type { EvidenceItem } from "../sources/contracts.ts";

export type ManualEvidenceInput = {
  text: string;
  url: string;
  sourceTime: string;
  covers?: "injury-report" | "weather";
};

export type RequestInputs = {
  scheduleRetrievedAt: string;
  manualEvidence: {
    text: string;
    url: string;
    sourceTime: string;
    covers: "injury-report" | "weather" | null;
  }[];
  carriedEvidence: EvidenceItem[];
  drafter: { provider: string; modelId: string };
};

export type AttemptRequest = {
  id: string;
  hash: string;
  inputs: RequestInputs;
};
