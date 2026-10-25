export type RecoveryState = "interrupted" | "provider-unavailable" | "failed-write" | "schema-change";

export type RecoveryNote = {
  state: RecoveryState;
  existingCompletedReportsReadable: true;
  message: string;
};

const MESSAGES: Record<RecoveryState, string> = {
  interrupted:
    "The run was interrupted. Existing completed reports stay readable. This run is not a new primary sample.",
  "provider-unavailable":
    "The provider is unavailable. Existing completed reports stay readable. Missing output is not a zero result.",
  "failed-write":
    "The database write failed. Existing completed reports stay readable. The failed write is not part of the journal.",
  "schema-change":
    "The schema changed before this run finished. Existing completed reports stay readable and are not rewritten.",
};

export function describeRecovery(state: RecoveryState): RecoveryNote {
  return {
    state,
    existingCompletedReportsReadable: true,
    message: MESSAGES[state],
  };
}
