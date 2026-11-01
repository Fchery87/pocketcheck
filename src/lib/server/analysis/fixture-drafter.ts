import type {
  DraftPickExplanationResult,
  DraftThesisResult,
  PickExplanationPacket,
  ThesisDrafter,
  ThesisPacket,
  ProviderRequestHooks,
  ProviderRequestRecord,
} from "../providers/contracts.ts";
import { pickExplanationRequestBody, validatePickExplanation } from "./pick-explanation.ts";

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
          uncertainty:
            input.packet.gaps.length > 0
              ? "Evidence is incomplete; the gaps are listed with this report."
              : "The fixture drafter does not weigh the evidence.",
          missingInputs: [...input.packet.gaps],
          changeConditions: ["A different American price requires a new report."],
          decimalOdds: input.packet.decimalOdds,
          decisiveBreakEven: input.packet.decisiveBreakEven,
        },
      };
    },
    async draftPickExplanation(
      input: ProviderRequestHooks & {
        modelId: string;
        packet: PickExplanationPacket;
      },
    ): Promise<DraftPickExplanationResult> {
      const cited = input.packet.items[0]?.id;
      const reserved = await input.beforeRequest?.({
        role: "draft",
        body: pickExplanationRequestBody(input),
      });
      const result: DraftPickExplanationResult = {
        draftingFailed: false,
        repairAttempted: false,
        refusal: null,
        error: null,
        usage: null,
        usageCost: null,
        modelId: input.modelId,
        packet: input.packet,
        report: {
          formatVersion: 2,
          picks: input.packet.picks.map((pick) => ({
            market: pick.market,
            side: pick.picked.selection,
            grade: pick.grade,
            americanOdds: pick.picked.americanOdds,
            pointLine: pick.picked.pointLine,
            summary: `The forecasting model chose {{picked.label}} in the ${pick.market} market. The fixture drafter only explains this model pick and cites the supplied schedule evidence.`,
            otherSideCase: `{{other.label}} is the opposing side, and the schedule evidence says nothing that shows the forecasting model is right about this game.`,
            claims: cited
              ? [
                  {
                    text: "The schedule evidence identifies the matchup and kickoff the forecasting model priced.",
                    stance: "supporting" as const,
                    evidenceIds: [cited],
                  },
                  {
                    text: "The schedule evidence says nothing about injuries, form, or weather, so it cannot show the entered price is wrong.",
                    stance: "opposing" as const,
                    evidenceIds: [cited],
                  },
                ]
              : [],
            missingInputs: [],
          })),
        },
      };
      const record: ProviderRequestRecord = reserved
        ? reserved.response
        : {
            requestId: "fixture-draft",
            role: "draft",
            outcome: "completed",
            response: JSON.stringify(result.report),
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
            costUsd: null,
            costKnown: false,
          };
      if (record.role !== "draft")
        throw new Error("Saved fixture response role does not match reservation");
      if (!reserved) await input.afterResponse?.(record);
      let report: unknown = null;
      try {
        report = typeof record.response === "string" ? JSON.parse(record.response) : null;
      } catch {
        report = null;
      }
      const validated = validatePickExplanation(report, input.packet);
      return {
        ...result,
        ...(input.beforeRequest || input.afterResponse ? { providerRequests: [record] } : {}),
        draftingFailed: !validated.ok,
        report: validated.ok ? validated.report : null,
        error: validated.ok
          ? null
          : { kind: "invalid_report", status: null, message: validated.reasons.join("; ") },
      };
    },
  };
}
