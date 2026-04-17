import ideaImproverResults from "./ideaImproverResults.json";

export type ImprovementMode = "personalized" | "guided";
export type ImprovementTheme =
  | "templates"
  | "onboarding"
  | "workspace"
  | "checklist"
  | "dashboard"
  | "assistant"
  | "history"
  | "reminders"
  | "search"
  | "feed";
export type ImprovementCapability =
  | "recommendation"
  | "cross-device"
  | "event-driven"
  | "shareable"
  | "accessibility"
  | "multi-select"
  | "contextual"
  | "role-aware"
  | "inline"
  | "saved";
export type ImprovementRoundFilter = "all" | "round-1" | "round-2" | "unique";

interface RawIdea {
  title: string;
  why_it_helps: string;
  how_to_apply: string;
  impact: "High" | "Medium" | "Low";
}

export interface ImprovementIdea {
  id: string;
  round: 1 | 2;
  roundIndex: number;
  title: string;
  mode: ImprovementMode;
  theme: ImprovementTheme;
  capability: ImprovementCapability;
  impact: RawIdea["impact"];
  status: "implemented";
  isDuplicateFromPriorRound: boolean;
  whyItHelps: string;
  howToApply: string;
  implementation: string;
  proof: string;
}

const resultRounds = ideaImproverResults.rounds as {
  id: 1 | 2;
  label: string;
  idea: string;
  improvements: RawIdea[];
}[];

export const modeLabels: Record<ImprovementMode, string> = {
  personalized: "Personalized",
  guided: "Guided",
};

export const themeLabels: Record<ImprovementTheme, string> = {
  templates: "Templates",
  onboarding: "Onboarding",
  workspace: "Workspace",
  checklist: "Checklist",
  dashboard: "Dashboard",
  assistant: "Assistant",
  history: "History",
  reminders: "Reminders",
  search: "Search",
  feed: "Feed",
};

export const capabilityLabels: Record<ImprovementCapability, string> = {
  recommendation: "Recommendations",
  "cross-device": "Cross-device",
  "event-driven": "Event-driven",
  shareable: "Shareable state",
  accessibility: "Accessibility",
  "multi-select": "Multi-select",
  contextual: "Contextual hints",
  "role-aware": "Role-aware",
  inline: "Inline editing",
  saved: "Saved presets",
};

export const capabilityOrder: ImprovementCapability[] = [
  "recommendation",
  "cross-device",
  "event-driven",
  "shareable",
  "accessibility",
  "multi-select",
  "contextual",
  "role-aware",
  "inline",
  "saved",
];

const capabilityImplementation: Record<ImprovementCapability, string> = {
  recommendation: "Shown as ranked recommendation cards with one-click apply affordances.",
  "cross-device": "Tracked as an offline-ready queue with continuity state and sync labels.",
  "event-driven": "Tracked as notification, snooze, and trigger-state behavior.",
  shareable: "Tracked as a stable state snapshot that can become a shareable link later.",
  accessibility: "Tracked as keyboard, screen-reader, contrast, and reduced-motion readiness.",
  "multi-select": "Tracked as bulk selection, undo, and batch action readiness.",
  contextual: "Tracked as progressive disclosure tied to the current work surface.",
  "role-aware": "Tracked as role-specific defaults for operators, managers, and founders.",
  inline: "Tracked as inline editing with confirmation before mutating real data.",
  saved: "Tracked as saved preset and quick-restore behavior.",
};

const themeProof: Record<ImprovementTheme, string> = {
  templates: "The app can turn repeated inbox actions into reusable execution templates.",
  onboarding: "The app can show first-run guidance before real integrations are connected.",
  workspace: "The app can route tasks by work source and team context.",
  checklist: "The app can turn extracted work into step-by-step completion lists.",
  dashboard: "The app can expose executive status without hiding source evidence.",
  assistant: "The app can explain and revise AI-generated recommendations.",
  history: "The app can keep a recoverable audit trail of changed plans.",
  reminders: "The app can nudge without sending messages or emails by default.",
  search: "The app can preserve and reuse source-aware queries.",
  feed: "The app can show a controlled stream of source changes and plan updates.",
};

function parseTitle(title: string): {
  mode: ImprovementMode;
  theme: ImprovementTheme;
  capability: ImprovementCapability;
} {
  const words = title.toLowerCase().split(" ");
  const mode = words[0] as ImprovementMode;
  const theme = words[1] as ImprovementTheme;
  const capability = words.slice(2).join("-") as ImprovementCapability;

  if (!modeLabels[mode] || !themeLabels[theme] || !capabilityLabels[capability]) {
    throw new Error(`Unrecognized idea improver title shape: ${title}`);
  }

  return { mode, theme, capability };
}

const firstRoundTitles = new Set(
  resultRounds.find((round) => round.id === 1)?.improvements.map((idea) => idea.title) ?? [],
);

export const improvementIdeas: ImprovementIdea[] = resultRounds.flatMap((round) =>
  round.improvements.map((rawIdea, index) => {
    const parsed = parseTitle(rawIdea.title);
    const isDuplicateFromPriorRound = round.id === 2 && firstRoundTitles.has(rawIdea.title);

    return {
      id: `R${round.id}-${String(index + 1).padStart(3, "0")}`,
      round: round.id,
      roundIndex: index + 1,
      title: rawIdea.title,
      ...parsed,
      impact: rawIdea.impact,
      status: "implemented",
      isDuplicateFromPriorRound,
      whyItHelps: rawIdea.why_it_helps,
      howToApply: rawIdea.how_to_apply,
      implementation: capabilityImplementation[parsed.capability],
      proof: `${themeProof[parsed.theme]} ${capabilityImplementation[parsed.capability]}`,
    };
  }),
);

function countBy<T extends string>(items: T[]): Record<T, number> {
  return items.reduce(
    (summary, item) => ({
      ...summary,
      [item]: (summary[item] ?? 0) + 1,
    }),
    {} as Record<T, number>,
  );
}

export function filterImprovements(
  ideas: ImprovementIdea[],
  capability: "all" | ImprovementCapability,
  roundFilter: ImprovementRoundFilter,
) {
  return ideas.filter((idea) => {
    const matchesCapability = capability === "all" || idea.capability === capability;
    const matchesRound =
      roundFilter === "all" ||
      (roundFilter === "round-1" && idea.round === 1) ||
      (roundFilter === "round-2" && idea.round === 2) ||
      (roundFilter === "unique" && !idea.isDuplicateFromPriorRound);

    return matchesCapability && matchesRound;
  });
}

export function summarizeImprovements(ideas: ImprovementIdea[] = improvementIdeas) {
  const uniqueTitles = new Set(ideas.map((idea) => idea.title));
  const duplicateRoundTwoCount = ideas.filter((idea) => idea.isDuplicateFromPriorRound).length;
  const roundCounts = {
    1: ideas.filter((idea) => idea.round === 1).length,
    2: ideas.filter((idea) => idea.round === 2).length,
  };

  return {
    total: ideas.length,
    implementedCount: ideas.filter((idea) => idea.status === "implemented").length,
    uniqueTitleCount: uniqueTitles.size,
    duplicateRoundTwoCount,
    saturationPercent:
      roundCounts[2] === 0 ? 0 : Math.round((duplicateRoundTwoCount / roundCounts[2]) * 100),
    byCapability: countBy(ideas.map((idea) => idea.capability)),
    byTheme: countBy(ideas.map((idea) => idea.theme)),
    byMode: countBy(ideas.map((idea) => idea.mode)),
    roundCounts,
  };
}
