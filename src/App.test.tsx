import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { CUSTOMIZATION_STORAGE_KEY, TUTORIAL_STORAGE_KEY } from "./preferences";

describe("App", () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
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
    expect(await screen.findByText(/OpenAI planner unavailable\./)).toBeInTheDocument();
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

  it("shows a daily digest with a today call action list and interest controls", () => {
    render(<App />);

    const summary = screen.getByLabelText("Daily command summary");
    expect(within(summary).getAllByRole("listitem").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole("heading", { name: "Main things today" })).toBeInTheDocument();
    expect(screen.getByLabelText("Custom digest interest")).toBeInTheDocument();
  });

  it("keeps the digest queue full after a top action is completed", () => {
    render(<App />);

    const summary = screen.getByLabelText("Daily command summary");
    const beforeTitles = within(summary)
      .getAllByRole("listitem")
      .map((item) => item.textContent?.replace(/^\s*\d+\.\s*/, "").trim() ?? "");
    const firstTitle = beforeTitles[0];

    fireEvent.click(screen.getByRole("button", { name: `Mark ${firstTitle} done` }));

    const afterTitles = within(summary)
      .getAllByRole("listitem")
      .map((item) => item.textContent?.replace(/^\s*\d+\.\s*/, "").trim() ?? "");

    expect(afterTitles).toHaveLength(beforeTitles.length);
    expect(afterTitles).not.toContain(firstTitle);
  });

  it("gives the daily digest its own page", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Daily digest" }));

    expect(screen.getByRole("heading", { name: "Read the ranked brief before you work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Daily digest" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the digest narrative to one or two paragraphs", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Daily digest" }));

    const narrative = screen.getByLabelText("Digest narrative");
    const paragraphs = narrative.querySelectorAll("p");
    expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    expect(paragraphs.length).toBeLessThanOrEqual(2);
  });

  it("creates handoffs that move work into waiting with a reusable share link", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Productivity" }));
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
    expect(screen.getByText("12 AM")).toBeInTheDocument();
    expect(screen.getByText("11 PM")).toBeInTheDocument();
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

  it("opens a late-night draft from the visible full-day calendar", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Add event at 11 PM" }));

    expect(screen.getByLabelText("Calendar event start time")).toHaveValue("23:00");
    expect(screen.getByLabelText("Calendar event end time")).toHaveValue("23:59");
  });

  it("opens a visible calendar draft from the new-event button", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "New event" }));

    expect(screen.getByRole("heading", { name: "Add a calendar item" })).toBeInTheDocument();
    expect(screen.getByLabelText("Calendar event title")).toBeInTheDocument();
  });

  it("shows a dedicated calendar AI panel on the calendar page", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));

    expect(screen.getByRole("heading", { name: "Calendar AI" })).toBeInTheDocument();
    expect(screen.getByLabelText("Calendar assistant request")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run calendar AI" })).toBeInTheDocument();
  });

  it("shows editable themed reply drafts for important synced email", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    expect(
      screen.getByRole("heading", { name: "Edit reply drafts before they go back into Gmail" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Escalation from Northstar Health")).toBeInTheDocument();

    const draftBody = screen.getByLabelText(
      "Draft body for Escalation from Northstar Health",
    ) as HTMLTextAreaElement;
    expect(draftBody.value).toContain("I am preparing the direct reply now");

    fireEvent.change(screen.getByLabelText("Draft theme"), {
      target: { value: "executive" },
    });
    expect(
      (screen.getByLabelText("Draft body for Escalation from Northstar Health") as HTMLTextAreaElement)
        .value,
    ).toContain("I am preparing the response now");

    fireEvent.change(screen.getByLabelText("Draft body for Escalation from Northstar Health"), {
      target: { value: "Custom reply body" },
    });
    expect(
      (screen.getByLabelText("Draft body for Escalation from Northstar Health") as HTMLTextAreaElement)
        .value,
    ).toBe("Custom reply body");
  });

  it("renders a dedicated inbox page with a readable message view and Gmail compose handoff", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
    expect(
      screen.getByText("Scroll the inbox list, skim sender, subject, snippet, and date in one row, then open any thread in the right pane."),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Escalation from Northstar Health/i,
      }),
    );

    expect(screen.getByRole("heading", { name: "Inbox command center" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Escalation from Northstar Health" })).toBeInTheDocument();
    expect(screen.getByLabelText("Inbox reply subject")).toHaveValue("Re: Escalation from Northstar Health");
    expect(screen.getByRole("link", { name: "Open in Gmail to send" })).toHaveAttribute(
      "href",
      expect.stringContaining("view=cm"),
    );
  });

  it("removes a blocked sender from the inbox list and advances to another message", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /Escalation from Northstar Health/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Block sender from AI" }));

    const messageList = screen.getByRole("list", { name: "Inbox message list" });
    await waitFor(() => {
      expect(within(messageList).queryByText("Escalation from Northstar Health")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Board packet edits before tomorrow morning" })).toBeInTheDocument();
  });

  it("uses the assistant to collect blocked senders before planning", async () => {
    render(<App />);

    expect(screen.getByLabelText("Private sender emails")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Private sender emails"), {
      target: { value: "payroll@example.com" },
    });
    fireEvent.click(screen.getByText("Save blocked senders"));

    expect(await screen.findByText("Privacy setup saved")).toBeInTheDocument();
    expect(screen.getByText(/1 sender blocked from AI before planning starts/)).toBeInTheDocument();
  });

  it("uses the assistant to add a calendar block and open the calendar", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Assistant request"), {
      target: { value: "Add calendar Deep work tomorrow 3pm to 4pm" },
    });
    fireEvent.click(screen.getByText("Run assistant"));

    expect(
      await screen.findByRole("heading", { name: "Work from a larger daily calendar" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Deep work").length).toBeGreaterThan(0);
  });

  it("lets the assistant block senders with plain do-not-read phrasing", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Assistant request"), {
      target: { value: "Do not read messages from payroll@example.com" },
    });
    fireEvent.click(screen.getByText("Run assistant"));

    expect(await screen.findByText("Assistant updated AI privacy")).toBeInTheDocument();
    expect(screen.getByText(/1 sender blocked from AI planning/)).toBeInTheDocument();
  });

  it("uses the assistant to open the drafts page for a requested reply", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Assistant request"), {
      target: { value: "Draft a reply for Northstar" },
    });
    fireEvent.click(screen.getByText("Run assistant"));

    expect(
      await screen.findByRole("heading", { name: "Edit reply drafts before they go back into Gmail" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Escalation from Northstar Health")).toBeInTheDocument();
  });

  it("shows the top three action items from the larger synced inbox sample on Sources", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Sources" }));

    expect(screen.getByText("Top 3 action items from the current synced inbox")).toBeInTheDocument();
    expect(screen.getByText(/Showing 8 of 8 synced emails below/i)).toBeInTheDocument();
    expect(screen.getByText(/Send a direct reply to Northstar Health/i)).toBeInTheDocument();
    expect(screen.getByText(/Approve or decline the analytics renewal/i)).toBeInTheDocument();
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
  }, 10000);

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

    fireEvent.click(screen.getByRole("button", { name: "Daily digest" }));
    expect(screen.getByRole("heading", { name: "Read the ranked brief before you work" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
    expect(screen.getByRole("heading", { name: "Inbox command center" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sources" }));
    expect(screen.getByRole("heading", { name: "Connect the work sources" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    expect(
      screen.getByRole("heading", { name: "Edit reply drafts before they go back into Gmail" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Privacy" }));
    expect(screen.getByRole("heading", { name: "Data guardrails" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enterprise" }));
    expect(screen.getByRole("heading", { name: "Shared enterprise workspace" })).toBeInTheDocument();
    expect(screen.getByText("Editable reply drafts")).toBeInTheDocument();
  });

  it("shows enterprise chat and shared assignments in preview mode", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Enterprise" }));
    expect(screen.getByRole("heading", { name: "Shared enterprise workspace" })).toBeInTheDocument();
    expect(screen.getByText("TEAM42SYNC")).toBeInTheDocument();
    expect(screen.getAllByText(/Maya please draft the renewal response for Northstar/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Draft the Northstar renewal response/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Maya Chen").length).toBeGreaterThan(0);
  });

  it("exposes home, privacy, and terms links for verification pages", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home.html");
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute(
      "href",
      "/privacy.html",
    );
    expect(screen.getByRole("link", { name: "Terms & conditions" })).toHaveAttribute(
      "href",
      "/terms.html",
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
