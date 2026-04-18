export type VisualTheme = "clean" | "contrast" | "green" | "blue";
export type Density = "comfortable" | "compact" | "spacious";
export type PlanMode = "impact" | "quickWins" | "deepWork";
export type EventBlockSize = "compact" | "comfortable" | "large";
export type SidebarStyle = "full" | "compact" | "minimal";
export type WorkspacePageKey =
  | "daily"
  | "inbox"
  | "productivity"
  | "sources"
  | "drafts"
  | "actions"
  | "customize"
  | "calendar"
  | "privacy"
  | "premium";

export interface WorkspaceSections {
  integrations: boolean;
  actionLab: boolean;
  focusWindows: boolean;
  safeguards: boolean;
}

export interface ProductivityDefaults {
  defaultPlanMode: PlanMode;
  quickCaptureMinutes: number;
}

export interface CalendarPreferences {
  startHour: number;
  endHour: number;
  showAgenda: boolean;
  eventSize: EventBlockSize;
}

export interface WorkspaceLayout {
  sidebarStyle: SidebarStyle;
  pageOrder: WorkspacePageKey[];
  pinnedPages: WorkspacePageKey[];
}

export interface CustomizationSettings {
  visualTheme: VisualTheme;
  density: Density;
  sections: WorkspaceSections;
  productivity: ProductivityDefaults;
  calendar: CalendarPreferences;
  layout: WorkspaceLayout;
}

export interface TutorialState {
  completed: boolean;
  skipped: boolean;
  lastStep: number;
}

export const CUSTOMIZATION_STORAGE_KEY = "autopilot-ai-customization";
export const TUTORIAL_STORAGE_KEY = "autopilot-ai-tutorial";

export const defaultPageOrder: WorkspacePageKey[] = [
  "daily",
  "inbox",
  "productivity",
  "sources",
  "drafts",
  "actions",
  "customize",
  "calendar",
  "privacy",
  "premium",
];

export const defaultCustomizationSettings: CustomizationSettings = {
  visualTheme: "clean",
  density: "comfortable",
  sections: {
    integrations: true,
    actionLab: true,
    focusWindows: true,
    safeguards: true,
  },
  productivity: {
    defaultPlanMode: "impact",
    quickCaptureMinutes: 15,
  },
  calendar: {
    startHour: 9,
    endHour: 18,
    showAgenda: true,
    eventSize: "comfortable",
  },
  layout: {
    sidebarStyle: "full",
    pageOrder: defaultPageOrder,
    pinnedPages: ["daily", "productivity"],
  },
};

export const defaultTutorialState: TutorialState = {
  completed: false,
  skipped: false,
  lastStep: 0,
};

export function loadCustomizationSettings(): CustomizationSettings {
  return readStorage(CUSTOMIZATION_STORAGE_KEY, sanitizeCustomizationSettings);
}

export function saveCustomizationSettings(settings: CustomizationSettings): void {
  writeStorage(CUSTOMIZATION_STORAGE_KEY, sanitizeCustomizationSettings(settings));
}

export function loadTutorialState(): TutorialState {
  return readStorage(TUTORIAL_STORAGE_KEY, sanitizeTutorialState);
}

export function saveTutorialState(state: TutorialState): void {
  writeStorage(TUTORIAL_STORAGE_KEY, sanitizeTutorialState(state));
}

export function sanitizeCustomizationSettings(value: unknown): CustomizationSettings {
  const candidate = isRecord(value) ? value : {};
  const sections = isRecord(candidate.sections) ? candidate.sections : {};
  const productivity = isRecord(candidate.productivity) ? candidate.productivity : {};
  const calendar = isRecord(candidate.calendar) ? candidate.calendar : {};
  const layout = isRecord(candidate.layout) ? candidate.layout : {};
  const startHour = clampNumber(calendar.startHour, 5, 22, defaultCustomizationSettings.calendar.startHour);
  const endHour = Math.max(
    startHour + 1,
    clampNumber(calendar.endHour, 6, 23, defaultCustomizationSettings.calendar.endHour),
  );

  return {
    visualTheme: pickString(
      candidate.visualTheme,
      ["clean", "contrast", "green", "blue"],
      defaultCustomizationSettings.visualTheme,
    ),
    density: pickString(
      candidate.density,
      ["comfortable", "compact", "spacious"],
      defaultCustomizationSettings.density,
    ),
    sections: {
      integrations: pickBoolean(sections.integrations, defaultCustomizationSettings.sections.integrations),
      actionLab: pickBoolean(sections.actionLab, defaultCustomizationSettings.sections.actionLab),
      focusWindows: pickBoolean(sections.focusWindows, defaultCustomizationSettings.sections.focusWindows),
      safeguards: pickBoolean(sections.safeguards, defaultCustomizationSettings.sections.safeguards),
    },
    productivity: {
      defaultPlanMode: pickString(
        productivity.defaultPlanMode,
        ["impact", "quickWins", "deepWork"],
        defaultCustomizationSettings.productivity.defaultPlanMode,
      ),
      quickCaptureMinutes: clampNumber(
        productivity.quickCaptureMinutes,
        5,
        180,
        defaultCustomizationSettings.productivity.quickCaptureMinutes,
      ),
    },
    calendar: {
      startHour,
      endHour,
      showAgenda: pickBoolean(calendar.showAgenda, defaultCustomizationSettings.calendar.showAgenda),
      eventSize: pickString(
        calendar.eventSize,
        ["compact", "comfortable", "large"],
        defaultCustomizationSettings.calendar.eventSize,
      ),
    },
    layout: {
      sidebarStyle: pickString(
        layout.sidebarStyle,
        ["full", "compact", "minimal"],
        defaultCustomizationSettings.layout.sidebarStyle,
      ),
      pageOrder: sanitizePageOrder(layout.pageOrder),
      pinnedPages: sanitizePinnedPages(layout.pinnedPages),
    },
  };
}

export function sanitizeTutorialState(value: unknown): TutorialState {
  const candidate = isRecord(value) ? value : {};
  return {
    completed: pickBoolean(candidate.completed, defaultTutorialState.completed),
    skipped: pickBoolean(candidate.skipped, defaultTutorialState.skipped),
    lastStep: clampNumber(candidate.lastStep, 0, 6, defaultTutorialState.lastStep),
  };
}

function readStorage<T>(key: string, sanitize: (value: unknown) => T): T {
  if (typeof window === "undefined") {
    return sanitize(undefined);
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return sanitize(undefined);
    return sanitize(JSON.parse(raw));
  } catch {
    return sanitize(undefined);
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are nice-to-have in the mock app; failed storage should not break the UI.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizePageOrder(value: unknown): WorkspacePageKey[] {
  const order = Array.isArray(value) ? Array.from(new Set(value.filter(isWorkspacePageKey))) : [];
  return [...order, ...defaultPageOrder.filter((page) => !order.includes(page))];
}

function sanitizePinnedPages(value: unknown): WorkspacePageKey[] {
  const pinned = Array.isArray(value) ? value.filter(isWorkspacePageKey) : [];
  return Array.from(new Set(pinned)).slice(0, 4);
}

function isWorkspacePageKey(value: unknown): value is WorkspacePageKey {
  return typeof value === "string" && defaultPageOrder.includes(value as WorkspacePageKey);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}
