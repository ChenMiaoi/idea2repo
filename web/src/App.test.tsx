import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App, canCancelRuntimeStatus, runtimeStatusFromEvent } from "./App";

describe("Idea2Repo app", () => {
  it("renders the operational dashboard instead of a landing page", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /Local research agent workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Idea form/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Route and score/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Runtime runs/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Artifact viewer/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Literature matrix/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Execution board/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Provider settings/i })).toBeInTheDocument();
  });

  it("supports the local generate and validate loop", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Generate$/i }));
    expect(screen.getByText(/Generated local plan preview without backend/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Validate/i }));
    expect(screen.getByText(/Evidence gate ready for local validation/i)).toBeInTheDocument();
  });

  it("keeps publish disabled until the explicit permission toggle is enabled", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: /^Publish$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Toggle publish permission/i }));
    expect(screen.getByRole("button", { name: /^Publish$/i })).not.toBeDisabled();
  });

  it("keeps blocked runtime runs cancellable and restores running on stage restart", () => {
    expect(canCancelRuntimeStatus("blocked")).toBe(true);
    expect(canCancelRuntimeStatus("completed")).toBe(false);
    const blocked = runtimeStatusFromEvent("running", {
      type: "stage.blocked",
      run_id: "run-1",
      stage_id: "pdf_acquisition",
      reason: "Pending PDF approval",
      timestamp: "2026-01-01T00:00:00Z"
    });
    expect(blocked).toBe("blocked");
    expect(runtimeStatusFromEvent(blocked, {
      type: "stage.started",
      run_id: "run-1",
      stage_id: "pdf_acquisition",
      label: "PDF acquisition",
      timestamp: "2026-01-01T00:00:01Z"
    })).toBe("running");
  });
});
