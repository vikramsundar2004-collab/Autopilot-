import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { CUSTOMIZATION_STORAGE_KEY, TUTORIAL_STORAGE_KEY } from "./preferences";

describe("App", () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("runs idea-improver behaviors as usable actions", () => {
    render(<App />);

    expect(screen.getAllByText("Autopilot-AI").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("heading", { name: "Action lab" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("Apply recommendation"));
    expect(screen.getByText(/Recommendations for Templates is now enabled/)).toBeInTheDocument();
    expect(screen.getAllByText("Recommendations for Templates").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText("Work offline and queue changes"));
    fireEvent.click(screen.getAllByText("Cross-device")[0]);
    fireEvent.click(screen.getAllByText("Use this")[0]);
    expect(screen.getByText("Feature enabled")).toBeInTheDocument();
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
    expect(screen.getByText(/2 features enabled with undo available/)).toBeInTheDocument();

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
    expect(await screen.findByText(/AI planning API failed:/)).toBeInTheDocument();
  });

  it("turns idea-improver themes into usable rescue playbooks and momentum", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Time rescue playbooks" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run Inbox reset" }));
    expect(screen.getAllByText(/Inbox reset activated/).length).toBeGreaterThan(0);
    expect(screen.getByText("Used today")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Momentum and milestones" })).toBeInTheDocument();
    expect(screen.getByText("First relief")).toBeInTheDocument();
  });

  it("creates handoffs that move work into waiting with a reusable share link", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    const taskSelect = screen.getByLabelText("Handoff task") as HTMLSelectElement;
    const selectedTaskTitle = taskSelect.options[taskSelect.selectedIndex]?.text ?? "";
    fireEvent.change(screen.getByLabelText("Handoff owner"), {
      target: { value: "Maya" },
    });
    fireEvent.change(screen.getByLabelText("Handoff note"), {
      target: { value: "Please take this and send me the checkpoint by 4 PM." },
    });
    fireEvent.click(screen.getByText("Create handoff"));

    expect(screen.getByText(new RegExp(`handed off to Maya`, "i"))).toBeInTheDocument();
    expect((screen.getByLabelText("Handoff share link") as HTMLInputElement).value).toContain(
      "#handoff=",
    );

    fireEvent.click(screen.getByRole("button", { name: "Daily plan" }));
    fireEvent.click(screen.getByRole("button", { name: /^Waiting/ }));
    expect(screen.getAllByText(selectedTaskTitle).length).toBeGreaterThan(0);
  });

  it("renders a calendar-style day grid with events and usable date navigation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T09:00:00"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByLabelText("Daily calendar")).toBeInTheDocument();
    expect(screen.getAllByText("Thursday, April 16").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Team standup").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Open Wednesday, April 15" }));
    expect(screen.getAllByText("Wednesday, April 15").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getAllByText("Friday, April 17").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Calendar" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("creates and edits user-scheduled calendar items from the day grid", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Add event at 10 AM" }));
    fireEvent.change(screen.getByLabelText("Calendar event title"), {
      target: { value: "Deep work block" },
    });
    fireEvent.change(screen.getByLabelText("Calendar event end time"), {
      target: { value: "11:00" },
    });
    fireEvent.click(screen.getByText("Save calendar item"));

    expect(screen.getAllByText("Deep work block").length).toBeGreaterThan(0);
    expect(screen.getAllByText("10:00 AM - 11:00 AM").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Edit Deep work block" }));
    fireEvent.change(screen.getByLabelText("Calendar event end time"), {
      target: { value: "11:30" },
    });
    fireEvent.click(screen.getByText("Save calendar item"));

    expect(screen.getAllByText("10:00 AM - 11:30 AM").length).toBeGreaterThan(0);
  });

  it("applies workflow templates as usable productivity shortcuts", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Productivity" }));
    const gallery = screen.getByText("Executive brief follow-up").closest(".template-card");
    expect(gallery).not.toBeNull();
    fireEvent.click(within(gallery as HTMLElement).getByRole("button", { name: "Use template" }));

    expect(screen.getByText(/added to the plan and staged as a calendar block/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Daily plan" }));
    expect(screen.getAllByText("Executive brief follow-up").length).toBeGreaterThan(0);
  });

  it("customizes theme, density, visible sections, calendar hours, and sidebar layout", () => {
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
    fireEvent.change(screen.getByLabelText("Sidebar style"), {
      target: { value: "minimal" },
    });
    expect(shell).toHaveClass("sidebar-minimal");
    fireEvent.click(screen.getAllByRole("button", { name: "Down" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Daily plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    expect(screen.getByLabelText("Sidebar page order")).toHaveTextContent("Productivity");

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

  it("exposes home, privacy, and terms links for verification pages", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "./home.html");
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute(
      "href",
      "./privacy.html",
    );
    expect(screen.getByRole("link", { name: "Terms & conditions" })).toHaveAttribute(
      "href",
      "./terms.html",
    );
  });

  it("keeps source setup buttons actionable instead of leaving dead provider cards", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Sources" }));

    const googleCard = screen
      .getByRole("heading", { name: "Google Workspace" })
      .closest(".integration-card");
    expect(googleCard).not.toBeNull();
    expect(within(googleCard as HTMLElement).getByRole("button")).not.toBeDisabled();

    const microsoftCard = screen
      .getByRole("heading", { name: "Microsoft 365" })
      .closest(".integration-card");
    expect(microsoftCard).not.toBeNull();
    fireEvent.click(within(microsoftCard as HTMLElement).getByRole("button", { name: "Open setup" }));
    expect(
      await screen.findByText(/Microsoft needs backend setup before it can connect safely\./i),
    ).toBeInTheDocument();
  });
});
