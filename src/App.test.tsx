import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { CUSTOMIZATION_STORAGE_KEY, TUTORIAL_STORAGE_KEY } from "./preferences";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("runs idea-improver behaviors as usable actions", () => {
    render(<App />);

    expect(screen.getAllByText("Autopilot-AI").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
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

  it("adds productivity controls for capture, planning modes, focus sprints, and API planning", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Productivity" }));
    fireEvent.change(screen.getByLabelText("Quick capture task"), {
      target: { value: "Draft investor update" },
    });
    fireEvent.change(screen.getByLabelText("Estimated minutes"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByText("Add captured task"));

    expect(screen.getByText(/added to today's plan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Daily plan" }));
    expect(screen.getAllByText("Draft investor update").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Productivity" }));

    fireEvent.click(screen.getByRole("button", { name: "Quick wins" }));
    expect(screen.getByText("Action list is sorted for quick wins.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Start focus sprint"));
    expect(screen.getByText(/Focus sprint started/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Finish sprint"));
    expect(screen.getByText(/marked done from the focus sprint/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Run AI planning API"));
    expect(await screen.findByText(/AI planning API failed: Add Supabase env vars/)).toBeInTheDocument();
  });

  it("renders a calendar-style day grid with events", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByLabelText("Daily calendar")).toBeInTheDocument();
    expect(screen.getAllByText("Thursday, April 16").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Team standup").length).toBeGreaterThan(0);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calendar" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("customizes theme, density, visible sections, and calendar hours", () => {
    const { container } = render(<App />);
    const shell = container.querySelector(".app-shell");

    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    fireEvent.change(screen.getByLabelText("Visual theme"), {
      target: { value: "blue" },
    });
    fireEvent.change(screen.getByLabelText("Workspace density"), {
      target: { value: "compact" },
    });
    expect(shell).toHaveClass("theme-blue");
    expect(shell).toHaveClass("density-compact");

    fireEvent.click(screen.getByLabelText("Show integrations"));
    fireEvent.click(screen.getByRole("button", { name: "Sources" }));
    expect(screen.queryByRole("heading", { name: "Connect the work sources" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    fireEvent.click(screen.getByLabelText("Show focus windows"));
    fireEvent.click(screen.getByRole("button", { name: "Productivity" }));
    expect(screen.queryByRole("heading", { name: "Focus windows" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    fireEvent.change(screen.getByLabelText("Calendar start hour"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText("Calendar end hour"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByText("8 AM")).toBeInTheDocument();
    expect(screen.getByText("7 PM")).toBeInTheDocument();
  });

  it("persists settings locally and falls back from invalid saved settings", () => {
    const firstRender = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    fireEvent.change(screen.getByLabelText("Visual theme"), {
      target: { value: "contrast" },
    });
    firstRender.unmount();

    const secondRender = render(<App />);
    expect(secondRender.container.querySelector(".app-shell")).toHaveClass("theme-contrast");
    secondRender.unmount();

    window.localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, "{not valid json");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    expect(screen.getByLabelText("Visual theme")).toHaveValue("clean");
  });

  it("supports tutorial skip, completion, and replay", () => {
    const firstRender = render(<App />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Start with the daily summary")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Next"));
    expect(within(screen.getByRole("dialog")).getByText("Plan the next hour")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Skip tutorial"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(TUTORIAL_STORAGE_KEY) ?? "{}")).toMatchObject({
      skipped: true,
    });

    firstRender.unmount();
    render(<App />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    fireEvent.click(screen.getByText("Replay tutorial"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    for (let index = 0; index < 6; index += 1) {
      fireEvent.click(screen.getByText("Next"));
    }
    fireEvent.click(screen.getByText("Start using Autopilot-AI"));
    expect(JSON.parse(window.localStorage.getItem(TUTORIAL_STORAGE_KEY) ?? "{}")).toMatchObject({
      completed: true,
    });
  });

  it("keeps every major surface on its own sidebar page", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Sources" }));
    expect(screen.getByRole("heading", { name: "Connect the work sources" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("heading", { name: "Action lab" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect the work sources" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Privacy" }));
    expect(screen.getByRole("heading", { name: "Data guardrails" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "$200 plan" }));
    expect(screen.getByRole("heading", { name: "Premium capabilities to justify the price" })).toBeInTheDocument();
    expect(screen.getByText("Operator ROI dashboard")).toBeInTheDocument();
  });
});
