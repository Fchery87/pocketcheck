import type { OutcomeProbabilities } from "#lib/domain/odds.ts";
import type { UncertaintyAssessment } from "../models/uncertainty.ts";
import type { StarterAssumption } from "../models/forecast.ts";
import type { MeanContributions } from "../models/fit.ts";

export const FORECAST_PROVENANCE = {
  captured: "captured",
  legacyMissing: "legacy-missing-inputs",
} as const;

export type ForecastProvenance = (typeof FORECAST_PROVENANCE)[keyof typeof FORECAST_PROVENANCE];

/** Forecast facts saved with an analysis. Legacy rows omit the captured record. */
export type SavedForecast = {
  version: 1;
  provenance: ForecastProvenance;
  decisionCutoff: string;
  inputAvailability: {
    version: string;
    results: string;
    starters: string;
  };
  artifact: { checksum: string; version: number };
  features: Record<string, number>;
  starters: { home: StarterAssumption; away: StarterAssumption };
  marketEligibility: { market: "moneyline" | "spread" | "total"; eligible: boolean };
  probabilities: OutcomeProbabilities;
  uncertainty: UncertaintyAssessment;
  policyVersion: string;
  /**
   * What moved the predicted margin (moneyline, spread) and total, in points. Absent on
   * forecasts frozen before drivers were recorded.
   */
  drivers?: { margin: MeanContributions; total: MeanContributions };
};
