import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Deal } from "../domain/deal";
import { NegotiationResolutionDialog } from "./NegotiationResolutionDialog";

const makeNegotiationDeal = (id: string, company: string): Deal => ({
  id,
  company,
  industry: "Technology",
  value: 100_000,
  owner: "Priya Sharma",
  initials: "PS",
  stage: "Negotiation",
  nextStep: "Follow up",
  nextStepDueAt: "2026-11-20",
  lastActivityAt: "2026-11-17",
  version: 1,
});

describe("NegotiationResolutionDialog", () => {
  it("only sends checked deals to the chosen outcome and supports mixed outcomes", () => {
    const onResolve = vi.fn();
    render(
      <NegotiationResolutionDialog
        deals={[
          makeNegotiationDeal("one", "Northstar"),
          makeNegotiationDeal("two", "Orbit"),
        ]}
        busy={false}
        hasOtherMoves={false}
        onResolve={onResolve}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Northstar (one)" }));
    fireEvent.click(screen.getByRole("button", { name: "Won" }));
    expect(onResolve).toHaveBeenLastCalledWith(["one"], "Won");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Orbit (two)" }));
    fireEvent.click(screen.getByRole("button", { name: "Lost" }));
    expect(onResolve).toHaveBeenLastCalledWith(["two"], "Lost");
    expect(onResolve).toHaveBeenCalledTimes(2);
  });
});
