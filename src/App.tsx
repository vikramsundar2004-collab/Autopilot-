import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  Link2,
  LockKeyhole,
  MailOpen,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { demoCalendar, demoDate, demoEmails } from "./data";
import {
  capabilityLabels,
  capabilityOrder,
  filterImprovements,
  improvementIdeas,
  summarizeImprovements,
  themeLabels,
  type ImprovementCapability,
  type ImprovementIdea,
  type ImprovementRoundFilter,
} from "./improvements";
import {
  buildDailyPlan,
  deriveActionItems,
  formatDueLabel,
  formatTime,
  summarizePlan,
} from "./intelligence";
import { completeOAuthRedirect, startIntegrationConnection } from "./integrations/auth";
import {
  getConnectionReadiness,
  integrationProviders,
  type IntegrationKey,
  type IntegrationProvider,
} from "./integrations/providers";
import { hasSupabaseConfig } from "./integrations/supabaseClient";
import type { ActionItem, CalendarEvent, TaskStatus } from "./types";

type TaskFilter = "all" | "urgent" | "waiting" | "done";
type ImprovementFilter = "all" | ImprovementCapability;

const roundFilterLabels: Record<ImprovementRoundFilter, string> = {
  all: "All rounds",
  "round-1": "Round 1",
  "round-2": "Round 2",
  unique: "Unique",
};

const filterLabels: Record<TaskFilter, string> = {
  all: "All",
  urgent: "Urgent",
  waiting: "Waiting",
  done: "Done",
};

function App() {
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [improvementFilter, setImprovementFilter] = useState<ImprovementFilter>("all");
  const [roundFilter, setRoundFilter] = useState<ImprovementRoundFilter>("all");
  const [selectedImprovementId, setSelectedImprovementId] = useState(improvementIdeas[0].id);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [connectionNotice, setConnectionNotice] = useState(
    "Add Supabase env vars when you are ready to test live OAuth.",
  );

  const baseTasks = useMemo(() => deriveActionItems(demoEmails, demoDate), []);
  const tasks = useMemo(
    () =>
      baseTasks.map((task) =>
        completedTasks.has(task.id)
          ? {
              ...task,
              status: "done" as TaskStatus,
            }
          : task,
      ),
    [baseTasks, completedTasks],
  );
  const plan = useMemo(() => buildDailyPlan(tasks, demoCalendar, demoDate), [tasks]);
  const summary = useMemo(() => summarizePlan(plan), [plan]);
  const improvementSummary = useMemo(() => summarizeImprovements(), []);
  const visibleImprovementIdeas = useMemo(
    () => filterImprovements(improvementIdeas, improvementFilter, roundFilter),
    [improvementFilter, roundFilter],
  );
  const selectedImprovement =
    improvementIdeas.find((idea) => idea.id === selectedImprovementId) ?? improvementIdeas[0];

  const filteredTasks = plan.rankedTasks.filter((task) => {
    if (filter === "all") return true;
    if (filter === "urgent") return task.priority === "urgent" && task.status === "open";
    return task.status === filter;
  });

  const filterCounts: Record<TaskFilter, number> = {
    all: plan.rankedTasks.length,
    urgent: plan.rankedTasks.filter(
      (task) => task.priority === "urgent" && task.status === "open",
    ).length,
    waiting: plan.rankedTasks.filter((task) => task.status === "waiting").length,
    done: plan.rankedTasks.filter((task) => task.status === "done").length,
  };

  useEffect(() => {
    completeOAuthRedirect().then((result) => {
      if (result) {
        setConnectionNotice(result.message);
      }
    });
  }, []);

  useEffect(() => {
    if (!window.location.hash) return;
    const targetId = window.location.hash.slice(1);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (visibleImprovementIdeas.length === 0) return;
    if (!visibleImprovementIdeas.some((idea) => idea.id === selectedImprovementId)) {
      setSelectedImprovementId(visibleImprovementIdeas[0].id);
    }
  }, [selectedImprovementId, visibleImprovementIdeas]);

  function toggleTask(taskId: string) {
    setCompletedTasks((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  async function connectProvider(key: IntegrationKey) {
    const result = await startIntegrationConnection(key);
    setConnectionNotice(result.message);
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="workspace" aria-labelledby="page-title">
        <Header summary={summary} />
        <section className="command-band" aria-label="Daily command summary">
          <div>
            <span className="eyebrow">Today&apos;s call</span>
            <h2>Do the customer reply, renewal approval, and launch edit before 4 PM.</h2>
          </div>
          <button className="primary-action" type="button">
            Start next task
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </section>

        <section className="integration-panel" aria-labelledby="integration-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Integrations</span>
              <h2 id="integration-title">Connect the work sources</h2>
            </div>
            <div className={hasSupabaseConfig ? "status-pill ready" : "status-pill"}>
              <LockKeyhole size={15} aria-hidden="true" />
              {hasSupabaseConfig ? "Supabase env ready" : "Supabase env needed"}
            </div>
          </div>
          <p className="section-note">{connectionNotice}</p>
          <div className="integration-grid">
            {integrationProviders.map((provider) => (
              <IntegrationCard
                key={provider.key}
                provider={provider}
                onConnect={connectProvider}
              />
            ))}
          </div>
        </section>

        <ImprovementStudio
          activeFilter={improvementFilter}
          ideas={visibleImprovementIdeas}
          roundFilter={roundFilter}
          selectedIdea={selectedImprovement}
          summary={improvementSummary}
          onFilterChange={setImprovementFilter}
          onRoundFilterChange={setRoundFilter}
          onSelectIdea={setSelectedImprovementId}
        />

        <section className="task-section" aria-labelledby="tasks-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Action list</span>
              <h2 id="tasks-title">What has to be done</h2>
            </div>
            <div className="filter-row" aria-label="Task filters">
              {(Object.keys(filterLabels) as TaskFilter[]).map((key) => (
                <button
                  className={filter === key ? "filter-button active" : "filter-button"}
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                >
                  {filterLabels[key]}
                  <span>{filterCounts[key]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="task-list">
            {filteredTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                todayISO={demoDate}
                index={index}
                onToggle={toggleTask}
              />
            ))}
          </div>
        </section>
      </main>
      <aside className="insight-rail" aria-label="Calendar and insights">
        <CalendarPanel events={demoCalendar} />
        <FocusPanel
          tasks={plan.rankedTasks}
          windows={plan.focusWindows}
          rescuePlan={plan.rescuePlan}
        />
        <SafeguardsPanel />
      </aside>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="brand-block">
        <div className="brand-mark">T</div>
        <div>
          <p>Tempo</p>
          <span>Inbox</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="Workspace navigation">
        <a href="#tasks-title" className="nav-link active">
          <Inbox size={18} aria-hidden="true" />
          Daily plan
        </a>
        <a href="#integration-title" className="nav-link">
          <Link2 size={18} aria-hidden="true" />
          Sources
        </a>
        <a href="#improvements-title" className="nav-link">
          <SlidersHorizontal size={18} aria-hidden="true" />
          Improvements
        </a>
        <a href="#calendar-title" className="nav-link">
          <CalendarDays size={18} aria-hidden="true" />
          Calendar
        </a>
        <a href="#safeguards-title" className="nav-link">
          <ShieldCheck size={18} aria-hidden="true" />
          Privacy
        </a>
      </nav>
      <div className="operator">
        <img
          src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=160&q=80"
          alt="Demo user avatar"
        />
        <div>
          <strong>Mock workspace</strong>
          <span>No live inbox data yet</span>
        </div>
      </div>
    </aside>
  );
}

function ImprovementStudio({
  activeFilter,
  ideas,
  roundFilter,
  selectedIdea,
  summary,
  onFilterChange,
  onRoundFilterChange,
  onSelectIdea,
}: {
  activeFilter: ImprovementFilter;
  ideas: ImprovementIdea[];
  roundFilter: ImprovementRoundFilter;
  selectedIdea: ImprovementIdea;
  summary: ReturnType<typeof summarizeImprovements>;
  onFilterChange: (filter: ImprovementFilter) => void;
  onRoundFilterChange: (filter: ImprovementRoundFilter) => void;
  onSelectIdea: (ideaId: string) => void;
}) {
  const filterOptions: ImprovementFilter[] = ["all", ...capabilityOrder];
  const roundOptions = Object.keys(roundFilterLabels) as ImprovementRoundFilter[];

  return (
    <section className="improvement-section" aria-labelledby="improvements-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Idea improver</span>
          <h2 id="improvements-title">150 generated improvements are tracked in the prototype</h2>
        </div>
        <div className="status-pill ready">
          <CheckCircle2 size={15} aria-hidden="true" />
          {summary.implementedCount}/{summary.total} implemented
        </div>
      </div>

      <div className="improvement-overview" aria-label="Improvement coverage">
        <Metric label="Round 1" value={String(summary.roundCounts[1])} />
        <Metric label="Round 2" value={String(summary.roundCounts[2])} />
        <Metric label="Unique titles" value={String(summary.uniqueTitleCount)} />
        <Metric label="AI saturation" value={`${summary.saturationPercent}%`} />
      </div>

      <div className="improvement-layout">
        <div className="improvement-left">
          <div className="capability-grid">
            {capabilityOrder.map((capability) => (
              <button
                className={
                  activeFilter === capability ? "capability-tile active" : "capability-tile"
                }
                key={capability}
                type="button"
                onClick={() => onFilterChange(capability)}
                aria-pressed={activeFilter === capability}
              >
                <span>{capabilityLabels[capability]}</span>
                <strong>{summary.byCapability[capability]}</strong>
              </button>
            ))}
          </div>

          <article className="idea-detail">
            <div className="idea-kicker">
              <span>{selectedIdea.id}</span>
              <span>{selectedIdea.mode}</span>
              <span>{themeLabels[selectedIdea.theme]}</span>
              <span>{capabilityLabels[selectedIdea.capability]}</span>
              {selectedIdea.isDuplicateFromPriorRound ? <span>Repeated in round 2</span> : null}
            </div>
            <h3>{selectedIdea.title}</h3>
            <p>{selectedIdea.whyItHelps}</p>
            <dl className="detail-grid">
              <div>
                <dt>Generated instruction</dt>
                <dd>{selectedIdea.howToApply}</dd>
              </div>
              <div>
                <dt>Implementation proof</dt>
                <dd>{selectedIdea.proof}</dd>
              </div>
            </dl>
            <div className="version-lane" aria-label="Versioned plan preview">
              <span>Draft rule</span>
              <span>Reviewed</span>
              <span>Live</span>
              <button type="button">Rollback</button>
            </div>
          </article>
        </div>

        <div className="improvement-right">
          <div className="matrix-toolbar">
            <strong>Build matrix</strong>
            <div className="matrix-filters" aria-label="Improvement filters">
              {filterOptions.map((filterOption) => (
                <button
                  className={activeFilter === filterOption ? "mini-filter active" : "mini-filter"}
                  key={filterOption}
                  type="button"
                  onClick={() => onFilterChange(filterOption)}
                  aria-pressed={activeFilter === filterOption}
                >
                  {filterOption === "all" ? "All" : capabilityLabels[filterOption]}
                </button>
              ))}
            </div>
            <div className="matrix-filters" aria-label="Idea improver round filters">
              {roundOptions.map((filterOption) => (
                <button
                  className={roundFilter === filterOption ? "mini-filter active" : "mini-filter"}
                  key={filterOption}
                  type="button"
                  onClick={() => onRoundFilterChange(filterOption)}
                  aria-pressed={roundFilter === filterOption}
                >
                  {roundFilterLabels[filterOption]}
                </button>
              ))}
            </div>
          </div>
          <div className="idea-list" role="list" aria-label="Implemented ideas">
            {ideas.map((idea) => (
              <button
                className={selectedIdea.id === idea.id ? "idea-row active" : "idea-row"}
                key={idea.id}
                type="button"
                onClick={() => onSelectIdea(idea.id)}
                role="listitem"
              >
                <span className="idea-number">{idea.id}</span>
                <span className="idea-row-copy">
                  <strong>{idea.title}</strong>
                  <small>
                    {themeLabels[idea.theme]} - {capabilityLabels[idea.capability]}
                  </small>
                </span>
                <span className="idea-status">
                  {idea.isDuplicateFromPriorRound ? "Saturated" : "Done"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Header({
  summary,
}: {
  summary: ReturnType<typeof summarizePlan>;
}) {
  return (
    <header className="top-header">
      <div>
        <span className="eyebrow">Thursday, April 16</span>
        <h1 id="page-title">
          {summary.openCount} things need action, {summary.urgentCount} are urgent.
        </h1>
        <p>
          Email and calendar signals are ranked into a practical day plan. Live
          integrations stay gated until credentials and scopes are configured.
        </p>
      </div>
      <div className="metric-strip" aria-label="Daily metrics">
        <Metric label="Focus time" value={`${summary.focusMinutes}m`} />
        <Metric label="Waiting" value={String(summary.waitingCount)} />
        <Metric label="Sources" value="5" />
      </div>
    </header>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IntegrationCard({
  provider,
  onConnect,
}: {
  provider: IntegrationProvider;
  onConnect: (key: IntegrationKey) => void;
}) {
  const readiness = getConnectionReadiness(provider, hasSupabaseConfig);
  const canConnect = readiness === "ready";
  const actionLabel =
    readiness === "ready"
      ? `Connect ${provider.shortName}`
      : readiness === "needs-supabase"
        ? "Add Supabase env"
        : "Backend needed";

  return (
    <article className={`integration-card ${provider.accent}`}>
      <div className="integration-topline">
        <span>{provider.shortName}</span>
        <span>{provider.authKind}</span>
      </div>
      <h3>{provider.name}</h3>
      <p>{provider.summary}</p>
      <div className="tag-row">
        {provider.usefulFor.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <button
        type="button"
        className="secondary-action"
        disabled={!canConnect}
        onClick={() => onConnect(provider.key)}
      >
        {actionLabel}
      </button>
    </article>
  );
}

function TaskCard({
  task,
  todayISO,
  index,
  onToggle,
}: {
  task: ActionItem;
  todayISO: string;
  index: number;
  onToggle: (taskId: string) => void;
}) {
  const isDone = task.status === "done";
  const isWaiting = task.status === "waiting";

  return (
    <article className={isDone ? "task-card done" : "task-card"}>
      <div className="task-rank">{String(index + 1).padStart(2, "0")}</div>
      <div className="task-body">
        <div className="task-title-row">
          <div>
            <span className={`priority ${task.priority}`}>{task.priority}</span>
            <h3>{task.title}</h3>
          </div>
          <button
            type="button"
            className="check-button"
            onClick={() => onToggle(task.id)}
            disabled={isWaiting}
            aria-label={isDone ? `Reopen ${task.title}` : `Mark ${task.title} done`}
          >
            <CheckCircle2 size={20} aria-hidden="true" />
          </button>
        </div>
        <p>{task.detail}</p>
        <div className="task-meta-grid">
          <span>
            <Clock3 size={15} aria-hidden="true" />
            {formatDueLabel(task.dueAt, todayISO)}
          </span>
          <span>
            <SlidersHorizontal size={15} aria-hidden="true" />
            {task.effort}m, impact {task.impact}/10
          </span>
          <span>
            <ShieldCheck size={15} aria-hidden="true" />
            {task.confidence}% confidence
          </span>
        </div>
        <div className="source-row">
          <img src={task.sourceAvatar} alt={`${task.source} avatar`} />
          <div>
            <strong>{task.source}</strong>
            <span>{task.sourceSubject}</span>
          </div>
        </div>
        <div className="risk-note">
          <AlertTriangle size={16} aria-hidden="true" />
          {task.risk}
        </div>
      </div>
    </article>
  );
}

function CalendarPanel({ events }: { events: CalendarEvent[] }) {
  return (
    <section className="rail-section" aria-labelledby="calendar-title">
      <div className="rail-heading">
        <CalendarDays size={18} aria-hidden="true" />
        <h2 id="calendar-title">Calendar</h2>
      </div>
      <div className="event-list">
        {events.map((event) => (
          <article className={`event-row ${event.type}`} key={event.id}>
            <span>
              {formatTime(event.start)} - {formatTime(event.end)}
            </span>
            <strong>{event.title}</strong>
            {event.attendees ? <small>{event.attendees.join(", ")}</small> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function FocusPanel({
  tasks,
  windows,
  rescuePlan,
}: {
  tasks: ActionItem[];
  windows: { id: string; start: string; end: string; minutes: number; assignedTaskIds: string[] }[];
  rescuePlan: ActionItem[];
}) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <section className="rail-section">
      <div className="rail-heading">
        <MailOpen size={18} aria-hidden="true" />
        <h2>Focus windows</h2>
      </div>
      <div className="focus-list">
        {windows.slice(0, 3).map((window) => (
          <article key={window.id} className="focus-window">
            <span>
              {formatTime(window.start)} - {formatTime(window.end)} - {window.minutes}m
            </span>
            {window.assignedTaskIds.length > 0 ? (
              <strong>
                {window.assignedTaskIds
                  .map((taskId) => taskById.get(taskId)?.title)
                  .filter(Boolean)
                  .slice(0, 2)
                  .join(" + ")}
              </strong>
            ) : (
              <strong>Hold for overflow</strong>
            )}
          </article>
        ))}
      </div>
      <div className="rescue-plan">
        <span className="eyebrow">If the day slips</span>
        {rescuePlan.length > 0 ? (
          <p>Move {rescuePlan.map((task) => task.source).join(", ")} to tomorrow morning.</p>
        ) : (
          <p>No rescue work needed after the current plan.</p>
        )}
      </div>
    </section>
  );
}

function SafeguardsPanel() {
  return (
    <section className="rail-section" aria-labelledby="safeguards-title">
      <div className="rail-heading">
        <LockKeyhole size={18} aria-hidden="true" />
        <h2 id="safeguards-title">Data guardrails</h2>
      </div>
      <ul className="guardrail-list">
        <li>OAuth tokens stay out of the browser for WhatsApp and message ingestion.</li>
        <li>Google starts read-only. Sending email needs a separate explicit scope.</li>
        <li>Every task keeps a source thread so users can verify the recommendation.</li>
        <li>Provider scopes are visible before the connection starts.</li>
      </ul>
    </section>
  );
}

export default App;
