import type { EvidenceItem } from "../sources/contracts.ts";
import type { PacketPolicy, ThesisPacket } from "../providers/contracts.ts";

/** The user's lean is not a parameter: the packet cannot carry it. */
export function buildThesisPacket(input: {
  items: EvidenceItem[];
  decimalOdds: number;
  decisiveBreakEven: number;
  policy: PacketPolicy;
}): ThesisPacket {
  return {
    items: input.items.map((item) => ({ ...item, facts: { ...item.facts } })),
    decimalOdds: input.decimalOdds,
    decisiveBreakEven: input.decisiveBreakEven,
    policy: { ...input.policy },
  };
}

const THESIS_RULES = [
  "Draft a sourced thesis as a JSON object. No markdown.",
  "Cite only evidence ids from the packet. Every claim cites at least one id.",
  "Include at least one opposing claim: the strongest evidence against the thesis.",
  "Copy decimalOdds and decisiveBreakEven exactly.",
  "Set conclusion to policy.conclusion exactly and explain the policy result. Do not choose a different conclusion.",
  "Do not add win, loss, push, or probability fields, and do not state percentages other than the supplied break-even.",
  "Fields: conclusion, summary, claims[{text,stance,evidenceIds}], assumptions, uncertainty, missingInputs, changeConditions, decimalOdds, decisiveBreakEven.",
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
    messages: [
      { role: "system", content: instruction },
      {
        role: "user",
        content: JSON.stringify({
          evidence,
          decimalOdds: input.packet.decimalOdds,
          decisiveBreakEven: input.packet.decisiveBreakEven,
          policy: input.packet.policy,
        }),
      },
    ],
  });
}
