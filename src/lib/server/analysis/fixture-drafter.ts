import type { DraftThesisResult, ThesisDrafter, ThesisPacket } from "../providers/contracts.ts";

/** Deterministic drafter for tests and the local research walkthrough. No network, no AI. */
export function createFixtureDrafter(): ThesisDrafter {
  return {
    id: "fixture",
    modelId: "fixture-drafter",
    async draftThesis(input: {
      modelId: string;
      packet: ThesisPacket;
    }): Promise<DraftThesisResult> {
      const cited = input.packet.items[0]?.id;
      const reason = input.packet.policy.blockingReason;
      return {
        draftingFailed: false,
        repairAttempted: false,
        refusal: null,
        error: null,
        usage: null,
        usageCost: null,
        modelId: input.modelId,
        packet: input.packet,
        report: {
          conclusion: input.packet.policy.conclusion,
          summary: `The policy result is ${input.packet.policy.conclusion}.${reason ? ` ${reason}` : ""} The fixture drafter cites only the supplied schedule evidence.`,
          claims: cited
            ? [
                {
                  text: "The schedule evidence identifies the matchup used for this offer.",
                  stance: "supporting",
                  evidenceIds: [cited],
                },
                {
                  text: "The schedule evidence says nothing about either side's chances, so it cannot show the price is wrong.",
                  stance: "opposing",
                  evidenceIds: [cited],
                },
              ]
            : [],
          assumptions: ["Full-game rules, including overtime, match the entered offer."],
          uncertainty: "No injury or weather evidence was available to the drafter.",
          missingInputs: [
            "Injury report is not in the fixture packet.",
            "Weather is not in the fixture packet.",
          ],
          changeConditions: ["A different American price requires a new report."],
          decimalOdds: input.packet.decimalOdds,
          decisiveBreakEven: input.packet.decisiveBreakEven,
        },
      };
    },
  };
}
