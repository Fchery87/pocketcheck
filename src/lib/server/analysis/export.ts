import type { DraftThesisResult } from "../providers/contracts.ts";

export function renderThesisExport(result: DraftThesisResult): string {
  const lines = [
    `model: ${result.modelId}`,
    `draftingFailed: ${result.draftingFailed}`,
    `decimalOdds: ${result.packet.decimalOdds}`,
    `decisiveBreakEven: ${result.packet.decisiveBreakEven}`,
    `usageCost: ${result.usageCost === null ? "unknown" : String(result.usageCost)}`,
  ];
  if (result.report) {
    lines.push(result.report.summary);
    for (const claim of result.report.claims) {
      lines.push(`- ${claim.stance}: ${claim.text} [${claim.evidenceIds.join(", ")}]`);
    }
  }
  for (const item of result.packet.items) {
    lines.push(`evidence ${item.id}: ${item.excerpt ?? ""}`);
  }
  return lines.join("\n");
}
