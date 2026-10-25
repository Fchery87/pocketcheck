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

export function thesisRequestBody(input: {
  modelId: string;
  packet: ThesisPacket;
  repair: boolean;
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
  const instruction = input.repair
    ? "Return only a JSON object. No markdown."
    : [
        "Draft a sourced thesis as JSON.",
        "Cite only evidence ids from the packet.",
        "Copy decimalOdds and decisiveBreakEven exactly.",
        "Set conclusion to policy.conclusion exactly and explain the policy result. Do not choose a different conclusion.",
        "Do not add win, loss, or push fields.",
        "Fields: conclusion, summary, claims[{text,stance,evidenceIds}], assumptions, uncertainty, missingInputs, changeConditions, decimalOdds, decisiveBreakEven.",
      ].join(" ");
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
