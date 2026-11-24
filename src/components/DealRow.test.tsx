import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Deal } from "../domain/deal";
import { DealRow } from "./DealRow";

const deal: Deal = {
  id: "deal-1",
  company: "Northstar",
  industry: "Technology",
  value: 100_000,
  owner: "Priya Sharma",
  initials: "PS",
  stage: "Contacted",
  nextStep: "Schedule a call",
  nextStepDueAt: "2026-11-20",
  lastActivityAt: "2026-11-17",
  version: 2,
};

describe("DealRow conflict recovery", () => {
  it("shows the latest stage and provides retry and keep-latest actions", () => {
    const onRetryConflict = vi.fn();
    const onDismissConflict = vi.fn();

    render(
      <table>
        <tbody>
          <DealRow
            deal={deal}
            feedback={{ kind: "conflict", attemptedStage: "Won" }}
            selected={false}
            stagePending={false}
            rowIndex={0}
            onToggleSelection={vi.fn()}
            onStageChange={vi.fn()}
            onRetry={vi.fn()}
            onRetryConflict={onRetryConflict}
            onDismissConflict={onDismissConflict}
            onFocusRow={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Conflict detected. This record was updated by another user.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Latest stage: Contacted");
    fireEvent.click(screen.getByRole("button", { name: "Retry move to Won" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep latest" }));

    expect(onRetryConflict).toHaveBeenCalledWith("deal-1", "Won");
    expect(onDismissConflict).toHaveBeenCalledWith("deal-1");
  });

  it("shows only the current stage and immediate next stage in the dropdown", () => {
    const onStageChange = vi.fn();

    render(
      <table>
        <tbody>
          <DealRow
            deal={deal}
            selected={false}
            stagePending={false}
            rowIndex={0}
            onToggleSelection={vi.fn()}
            onStageChange={onStageChange}
            onRetry={vi.fn()}
            onRetryConflict={vi.fn()}
            onDismissConflict={vi.fn()}
            onFocusRow={vi.fn()}
          />
        </tbody>
      </table>,
    );

    const stage = screen.getByRole("combobox", {
      name: "Stage for Northstar",
    });
    expect(
      Array.from(stage.querySelectorAll("option"), (option) => option.value),
    ).toEqual(["Contacted", "Demo Done", "Lost"]);
    expect(screen.getByRole("option", { name: "Contacted" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Lost" })).toBeEnabled();
    expect(
      screen.getByTestId("deal-row-deal-1").querySelector(".next-step-text"),
    ).toHaveTextContent("Demo Done");

    fireEvent.change(stage, { target: { value: "Demo Done" } });
    expect(onStageChange).toHaveBeenCalledWith(deal, "Demo Done");
  });

  it("allows Won to be marked Lost while excluding terminal rows from bulk selection", () => {
    const finalDeal = { ...deal, stage: "Won" as const };

    render(
      <table>
        <tbody>
          <DealRow
            deal={finalDeal}
            selected={false}
            stagePending={false}
            rowIndex={0}
            onToggleSelection={vi.fn()}
            onStageChange={vi.fn()}
            onRetry={vi.fn()}
            onRetryConflict={vi.fn()}
            onDismissConflict={vi.fn()}
            onFocusRow={vi.fn()}
          />
        </tbody>
      </table>,
    );

    const stage = screen.getByRole("combobox", {
      name: "Stage for Northstar",
    });
    expect(
      Array.from(stage.querySelectorAll("option"), (option) => option.value),
    ).toEqual(["Won", "Lost"]);
    expect(stage).toBeEnabled();
    expect(screen.getByRole("option", { name: "Lost" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Select Northstar" })).toBeDisabled();
    expect(
      screen.getByTestId("deal-row-deal-1").querySelector(".next-step-text"),
    ).toHaveTextContent("No next step");
  });

  it("keeps Lost final and its bulk-selection checkbox disabled", () => {
    const lostDeal = { ...deal, stage: "Lost" as const };

    render(
      <table>
        <tbody>
          <DealRow
            deal={lostDeal}
            selected={false}
            stagePending={false}
            rowIndex={0}
            onToggleSelection={vi.fn()}
            onStageChange={vi.fn()}
            onRetry={vi.fn()}
            onRetryConflict={vi.fn()}
            onDismissConflict={vi.fn()}
            onFocusRow={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(
      screen.getByRole("combobox", { name: "Stage for Northstar" }),
    ).toBeDisabled();
    expect(screen.getByRole("option", { name: "Lost" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select Northstar" })).toBeDisabled();
  });
});
