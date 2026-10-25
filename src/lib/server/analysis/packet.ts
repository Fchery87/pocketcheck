import type { EvidenceItem } from "../sources/contracts.ts";
import type { PacketPolicy, ThesisPacket } from "../providers/contracts.ts";

/** The user's lean is not a parameter: the packet cannot carry it. */
export function buildThesisPacket(input: {
  items: EvidenceItem[];
  decimalOdds: number;
  decisiveBreakEven: number;
  policy: PacketPolicy;
  gaps?: string[];
}): ThesisPacket {
  return {
    items: input.items.map((item) => ({ ...item, facts: { ...item.facts } })),
    gaps: [...(input.gaps ?? [])],
    decimalOdds: input.decimalOdds,
    decisiveBreakEven: input.decisiveBreakEven,
    policy: { ...input.policy },
  };
}

const THESIS_RULES = [
  "Draft a sourced thesis as a JSON object. No markdown.",
  "Cite only evidence ids from the packet. Every claim cites at least one id.",
  "Include at least one opposing claim: the strongest evidence against the thesis.",
  "List every packet gap in missingInputs.",
  "Copy decimalOdds and decisiveBreakEven exactly.",
  "Set conclusion to policy.conclusion exactly and explain the policy result. Do not choose a different conclusion.",
  "Do not add win, loss, push, or probability fields, and do not state percentages other than the supplied break-even or one given in the evidence.",
  'Fields: conclusion: string; summary: string; claims[{text,stance,evidenceIds}]: array of {text: string, stance, evidenceIds: array of strings}, where stance is exactly "supporting" or "opposing"; assumptions: array of strings; uncertainty: string; missingInputs: array of strings; changeConditions: array of strings; decimalOdds: number; decisiveBreakEven: number.',
].join(" ");

/** `rejected` holds the reasons the previous draft failed; when present, this is the repair request. */
export function thesisRequestBody(input: {
  modelId: string;
  packet: ThesisPacket;
  rejected?: string[];
}): string {
  const evidence = input.packet.items.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    retrievedAt: item.retrievedAt,
    publishedAt: item.publishedAt,
    origin: item.origin,
    facts: item.facts,
    excerpt: item.excerpt,
  }));
  const instruction = input.rejected
    ? `${THESIS_RULES} Your previous draft was rejected: ${input.rejected.join("; ")}. Return a corrected JSON object.`
    : THESIS_RULES;
  return JSON.stringify({
    model: input.modelId,
    temperature: 0,
    // Reasoning models spend hidden tokens before answering; a tight cap truncates the JSON.
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: instruction },
      {
        role: "user",
        content: JSON.stringify({
          evidence,
          gaps: input.packet.gaps,
          decimalOdds: input.packet.decimalOdds,
          decisiveBreakEven: input.packet.decisiveBreakEven,
          policy: input.packet.policy,
        }),
      },
    ],
  });
}
