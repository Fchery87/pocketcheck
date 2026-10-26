/**
 * The value threshold applied to the conservative expected value. Frozen in code before any
 * holdout outcome was examined; evaluation reports how it would have behaved and never tunes it.
 * Changing it requires a new version, which changes the policy version.
 */
export const VALUE_THRESHOLD = {
  version: "threshold-2026-10-25",
  conservativeExpectedValue: 0,
} as const;
