import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("runs idea-improver behaviors as usable actions", () => {
    render(<App />);

    expect(screen.getAllByText("Autopilot-AI").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Action lab" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("Apply recommendation"));
    expect(screen.getByText(/Recommendations for Templates applied/)).toBeInTheDocument();
    expect(screen.getAllByText("Recommendations for Templates").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText("Work offline and queue changes"));
    fireEvent.click(screen.getAllByText("Cross-device")[0]);
    fireEvent.click(screen.getAllByText("Use this")[0]);
    expect(screen.getAllByText(/queued/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Sync queued actions"));
    expect(screen.getByText(/Queued actions synced across devices/)).toBeInTheDocument();
  });

  it("supports batch apply, undo, inline edit confirmation, share links, and presets", () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText("Recommendations for Templates"));
    fireEvent.click(screen.getByLabelText("Event-driven for Templates"));
    fireEvent.click(screen.getByText("Apply selected"));
    expect(screen.getByText(/2 actions applied with undo available/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Undo last batch"));
    expect(screen.getByText("2 actions undone.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Inline instruction editor"), {
      target: { value: "Preview, verify, and confirm the user's next best action." },
    });
    fireEvent.click(screen.getByText("Review edit"));
    fireEvent.click(screen.getByText("Confirm update"));
    expect(screen.getByText("Inline edit confirmed with safeguard review.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Create state link"));
    expect((screen.getByLabelText("Shareable state link") as HTMLInputElement).value).toContain(
      "#state=",
    );

    fireEvent.click(screen.getByText("Save current preset"));
    expect(screen.getAllByText(/Customer reply sprint/).length).toBeGreaterThan(0);
  });

  it("adds productivity controls for capture, planning modes, and focus sprints", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Quick capture task"), {
      target: { value: "Draft investor update" },
    });
    fireEvent.change(screen.getByLabelText("Estimated minutes"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByText("Add captured task"));

    expect(screen.getAllByText("Draft investor update").length).toBeGreaterThan(0);
    expect(screen.getByText(/added to today's plan/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Quick wins" }));
    expect(screen.getByText("Action list is sorted for quick wins.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Start focus sprint"));
    expect(screen.getByText(/Focus sprint started/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Finish sprint"));
    expect(screen.getByText(/marked done from the focus sprint/)).toBeInTheDocument();
  });

  it("renders a calendar-style day grid with events", () => {
    render(<App />);

    expect(screen.getByLabelText("Daily calendar")).toBeInTheDocument();
    expect(screen.getAllByText("Thursday, April 16").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Team standup").length).toBeGreaterThan(0);
    expect(screen.getByText("Today")).toBeInTheDocument();
  });
});
