import {
  capabilityLabels,
  capabilityOrder,
  themeLabels,
  type ImprovementCapability,
  type ImprovementMode,
  type ImprovementTheme,
} from "./improvements";

export type UserRole = "operator" | "manager" | "founder";

export interface SurfaceFlow {
  theme: ImprovementTheme;
  source: string;
  recommendedByRole: Record<UserRole, string>;
  guidedStep: string;
  steps: string[];
  sampleQuery: string;
  presetName: string;
  reminder: string;
}

export interface BehaviorAction {
  id: string;
  capability: ImprovementCapability;
  label: string;
  detail: string;
}

export interface ShareState {
  theme: ImprovementTheme;
  mode: ImprovementMode;
  role: UserRole;
  presetName: string;
  appliedCount: number;
}

export const roleLabels: Record<UserRole, string> = {
  operator: "Operator",
  manager: "Manager",
  founder: "Founder",
};

export const surfaceOrder: ImprovementTheme[] = [
  "templates",
  "onboarding",
  "workspace",
  "checklist",
  "dashboard",
  "assistant",
  "history",
  "reminders",
  "search",
  "feed",
];

export const surfaceFlows: Record<ImprovementTheme, SurfaceFlow> = {
  templates: {
    theme: "templates",
    source: "Recurring Gmail and Slack asks",
    recommendedByRole: {
      operator: "Apply the customer reply template to the next urgent inbox item.",
      manager: "Apply the weekly follow-up template to every owner without a next step.",
      founder: "Apply the investor-update template to open stakeholder threads.",
    },
    guidedStep: "Pick a template, preview the generated action, then confirm before it touches the plan.",
    steps: ["Choose template", "Preview action", "Confirm task", "Save as preset"],
    sampleQuery: "label:urgent has:question needs-template",
    presetName: "Customer reply sprint",
    reminder: "Review saved templates before tomorrow's first focus block.",
  },
  onboarding: {
    theme: "onboarding",
    source: "First-run integration setup",
    recommendedByRole: {
      operator: "Walk through Google and Slack readiness before live OAuth starts.",
      manager: "Assign each source connection to an owner before the workspace launch.",
      founder: "Review the privacy boundary before asking users to connect inboxes.",
    },
    guidedStep: "Show only the next required setup action and hide advanced options until needed.",
    steps: ["Confirm role", "Pick first source", "Review scope", "Start mock trial"],
    sampleQuery: "setup incomplete source:google OR source:slack",
    presetName: "First workspace launch",
    reminder: "Nudge the user if onboarding is still incomplete after one day.",
  },
  workspace: {
    theme: "workspace",
    source: "Connected account and team context",
    recommendedByRole: {
      operator: "Route urgent work into the active personal workspace.",
      manager: "Route tasks by team owner and blocked status.",
      founder: "Route high-impact customer and investor work above internal noise.",
    },
    guidedStep: "Select a workspace rule, inspect affected tasks, then apply routing.",
    steps: ["Pick workspace", "Inspect owners", "Apply route", "Sync queue"],
    sampleQuery: "workspace:current status:open priority:high",
    presetName: "Priority workspace routing",
    reminder: "Rebalance workspace routing after new integrations connect.",
  },
  checklist: {
    theme: "checklist",
    source: "Extracted action items",
    recommendedByRole: {
      operator: "Break the top task into a checklist that can be finished in one focus block.",
      manager: "Create owner checklists for tasks waiting on multiple people.",
      founder: "Convert strategic asks into a two-step decide-and-send checklist.",
    },
    guidedStep: "Turn one recommendation into concrete steps and keep undo available.",
    steps: ["Split task", "Assign first step", "Batch related items", "Undo if wrong"],
    sampleQuery: "needs:steps effort:<60m",
    presetName: "Focus-block checklist",
    reminder: "Snooze unfinished checklist items to the next open focus window.",
  },
  dashboard: {
    theme: "dashboard",
    source: "Daily plan metrics",
    recommendedByRole: {
      operator: "Pin open, waiting, and done counts above the action list.",
      manager: "Pin owner risk, blocked work, and overdue follow-ups.",
      founder: "Pin customer risk, launch impact, and investor-facing work.",
    },
    guidedStep: "Choose the dashboard lens and preserve the state as a shareable snapshot.",
    steps: ["Pick lens", "Review metrics", "Share snapshot", "Restore preset"],
    sampleQuery: "dashboard:risk OR dashboard:impact",
    presetName: "Morning command view",
    reminder: "Send a dashboard reminder before the afternoon review window.",
  },
  assistant: {
    theme: "assistant",
    source: "AI recommendation engine",
    recommendedByRole: {
      operator: "Ask the assistant to explain why the next task is ranked first.",
      manager: "Ask the assistant to identify blocked owners and recommended nudges.",
      founder: "Ask the assistant to compress the day into one executive decision.",
    },
    guidedStep: "Show the assistant's reasoning, allow inline edits, then confirm changes.",
    steps: ["Ask", "Inspect source", "Edit response", "Confirm update"],
    sampleQuery: "why:this-rank confidence:>70",
    presetName: "Explain the plan",
    reminder: "Re-run assistant reasoning after new source events arrive.",
  },
  history: {
    theme: "history",
    source: "Plan change log",
    recommendedByRole: {
      operator: "Review the last plan change before undoing a batch action.",
      manager: "Review who changed owner routing and when.",
      founder: "Review major AI plan changes before sharing externally.",
    },
    guidedStep: "Expose plan history, preserve state, and let the user restore safely.",
    steps: ["Open history", "Compare change", "Restore state", "Save preset"],
    sampleQuery: "history:today changed-by:assistant",
    presetName: "Recover last plan",
    reminder: "Remind the user when a plan has changed three times in one day.",
  },
  reminders: {
    theme: "reminders",
    source: "Calendar and task timing",
    recommendedByRole: {
      operator: "Snooze low-risk nudges and keep urgent reminders visible.",
      manager: "Snooze team reminders until owner check-in windows.",
      founder: "Snooze internal reminders behind customer-facing decisions.",
    },
    guidedStep: "Create reminder triggers with snooze controls and no automatic sends.",
    steps: ["Pick trigger", "Set snooze", "Preview nudge", "Confirm reminder"],
    sampleQuery: "reminder:due-before-4pm status:open",
    presetName: "Afternoon rescue reminders",
    reminder: "Nudge again 30 minutes before the next open calendar window.",
  },
  search: {
    theme: "search",
    source: "Source-aware query builder",
    recommendedByRole: {
      operator: "Save the current urgent-work query for daily reuse.",
      manager: "Save a query for waiting-on-owner follow-ups.",
      founder: "Save a query for customer, investor, and launch-critical asks.",
    },
    guidedStep: "Build the query, show matching sources, and preserve it as a shareable state.",
    steps: ["Build query", "Preview matches", "Share query", "Save preset"],
    sampleQuery: "(from:customer OR from:investor) has:commitment",
    presetName: "High-signal search",
    reminder: "Refresh saved searches when new sources connect.",
  },
  feed: {
    theme: "feed",
    source: "Realtime source events",
    recommendedByRole: {
      operator: "Show only feed events that change today's plan.",
      manager: "Show owner changes and blocked-state feed events.",
      founder: "Show customer, launch, and investor events first.",
    },
    guidedStep: "Filter the feed, explain the trigger, and queue updates if offline.",
    steps: ["Filter feed", "Inspect trigger", "Apply update", "Sync when online"],
    sampleQuery: "feed:changed-plan since:today",
    presetName: "Plan-changing feed",
    reminder: "Notify when a new feed event changes the top task.",
  },
};

export function getRoleRecommendation(
  theme: ImprovementTheme,
  role: UserRole,
): string {
  return surfaceFlows[theme].recommendedByRole[role];
}

export function buildBehaviorActions(
  theme: ImprovementTheme,
  mode: ImprovementMode,
  role: UserRole,
): BehaviorAction[] {
  const flow = surfaceFlows[theme];

  return capabilityOrder.map((capability) => ({
    id: `${mode}-${theme}-${capability}-${role}`,
    capability,
    label: `${capabilityLabels[capability]} for ${themeLabels[theme]}`,
    detail: getCapabilityDetail(capability, flow, mode, role),
  }));
}

export function buildShareStateUrl(
  baseUrl: string,
  state: ShareState,
): string {
  const payload = window.btoa(JSON.stringify(state));
  const url = new URL(baseUrl);
  url.hash = `state=${payload}`;
  return url.toString();
}

function getCapabilityDetail(
  capability: ImprovementCapability,
  flow: SurfaceFlow,
  mode: ImprovementMode,
  role: UserRole,
): string {
  switch (capability) {
    case "recommendation":
      return `${modeLabels(mode)} recommendation: ${flow.recommendedByRole[role]}`;
    case "cross-device":
      return `Queue "${flow.presetName}" for laptop, mobile, and offline recovery.`;
    case "event-driven":
      return `${flow.reminder} Snooze controls stay local until a backend exists.`;
    case "shareable":
      return `Preserve ${themeLabels[flow.theme]} state with query "${flow.sampleQuery}".`;
    case "accessibility":
      return `Keyboard path: open ${themeLabels[flow.theme]}, apply, undo, and restore without pointer input.`;
    case "multi-select":
      return `Batch ${flow.steps.length} actions with undo: ${flow.steps.join(", ")}.`;
    case "contextual":
      return flow.guidedStep;
    case "role-aware":
      return `${roleLabels[role]} default: ${flow.recommendedByRole[role]}`;
    case "inline":
      return `Edit "${flow.presetName}" inline, review the diff, then confirm.`;
    case "saved":
      return `Save and restore the "${flow.presetName}" preset.`;
  }
}

function modeLabels(mode: ImprovementMode) {
  return mode === "personalized" ? "Personalized" : "Guided";
}
