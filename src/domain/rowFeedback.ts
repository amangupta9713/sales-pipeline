import type { DealStage, StageMutationRequest } from "./deal";

export type RowFeedback =
  | { kind: "saving" }
  | { kind: "saved" }
  | {
      kind: "failed";
      request: StageMutationRequest;
      message: string;
      allowUndo?: boolean;
    }
  | { kind: "conflict"; attemptedStage: DealStage }
  | { kind: "remote" };
