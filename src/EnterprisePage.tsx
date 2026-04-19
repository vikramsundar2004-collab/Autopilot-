import type { FormEvent } from "react";
import type {
  EnterpriseAssignment,
  EnterpriseChatMessage,
  EnterpriseMember,
  EnterpriseOrganization,
} from "./integrations/enterpriseApi";

export interface EnterpriseFeatureCard {
  title: string;
  outcome: string;
  surface: string;
}

interface EnterprisePageProps {
  activeOrganizationId: string | null;
  assignments: EnterpriseAssignment[];
  createEnterpriseName: string;
  currentUserId?: string | null;
  featureCards: readonly EnterpriseFeatureCard[];
  isBusy: boolean;
  joinKeyInput: string;
  members: EnterpriseMember[];
  messages: EnterpriseChatMessage[];
  messageDraft: string;
  notice: string;
  organizations: EnterpriseOrganization[];
  onCopyJoinKey: (joinKey: string) => void;
  onCreateEnterprise: (event: FormEvent<HTMLFormElement>) => void;
  onCreateEnterpriseNameChange: (value: string) => void;
  onJoinEnterprise: (event: FormEvent<HTMLFormElement>) => void;
  onJoinKeyChange: (value: string) => void;
  onMarkAssignmentDone: (assignmentId: string) => void;
  onMessageDraftChange: (value: string) => void;
  onOpenCalendar: () => void;
  onOpenDrafts: () => void;
  onOpenProductivity: () => void;
  onOpenSources: () => void;
  onSelectOrganization: (organizationId: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
}

export function EnterprisePage({
  activeOrganizationId,
  assignments,
  createEnterpriseName,
  currentUserId,
  featureCards,
  isBusy,
  joinKeyInput,
  members,
  messages,
  messageDraft,
  notice,
  organizations,
  onCopyJoinKey,
  onCreateEnterprise,
  onCreateEnterpriseNameChange,
  onJoinEnterprise,
  onJoinKeyChange,
  onMarkAssignmentDone,
  onMessageDraftChange,
  onOpenCalendar,
  onOpenDrafts,
  onOpenProductivity,
  onOpenSources,
  onSelectOrganization,
  onSendMessage,
}: EnterprisePageProps) {
  const activeOrganization =
    organizations.find((organization) => organization.id === activeOrganizationId) ??
    organizations[0] ??
    null;
  const activeMembers = members.filter((member) => member.organizationId === activeOrganization?.id);
  const activeMessages = messages.filter((message) => message.organizationId === activeOrganization?.id);
  const activeAssignments = assignments.filter(
    (assignment) => assignment.organizationId === activeOrganization?.id,
  );

  return (
    <>
      <header className="page-header">
        <div className="page-header-copy">
          <span className="eyebrow">Enterprise</span>
          <h1 id="page-title">Shared enterprise workspace</h1>
          <p>
            Build one workspace, invite teammates with a join key, work inside a Slack-style chat
            shell, and let the AI assistant capture assignments with named owners.
          </p>
        </div>
      </header>

      <section className="enterprise-summary" aria-label="Enterprise status">
        <p>{notice}</p>
      </section>

      <div className="enterprise-command-grid">
        <section className="enterprise-panel enterprise-command-card" aria-labelledby="enterprise-create-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Create</span>
              <h2 id="enterprise-create-title">Launch a workspace</h2>
            </div>
            <div className="status-pill ready">Owner flow</div>
          </div>
          <p className="section-note">
            Creating an enterprise generates a reusable key so teammates can join the same command
            center without a manual database step.
          </p>
          <form className="enterprise-form" onSubmit={onCreateEnterprise}>
            <label>
              Enterprise name
              <input
                aria-label="Enterprise name"
                onChange={(event) => onCreateEnterpriseNameChange(event.target.value)}
                placeholder="Autopilot Dad Team"
                type="text"
                value={createEnterpriseName}
              />
            </label>
            <button className="primary-action" disabled={isBusy} type="submit">
              Create enterprise
            </button>
          </form>
        </section>

        <section className="enterprise-panel enterprise-command-card" aria-labelledby="enterprise-join-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Join</span>
              <h2 id="enterprise-join-title">Enter with a team key</h2>
            </div>
            <div className="status-pill">Invite only</div>
          </div>
          <p className="section-note">
            Anyone with the enterprise key can enter the same workspace, read the chat, and act on
            the shared schedule.
          </p>
          <form className="enterprise-form" onSubmit={onJoinEnterprise}>
            <label>
              Enterprise key
              <input
                aria-label="Enterprise key"
                onChange={(event) => onJoinKeyChange(event.target.value.toUpperCase())}
                placeholder="AB12CD34EF"
                type="text"
                value={joinKeyInput}
              />
            </label>
            <button className="secondary-action" disabled={isBusy} type="submit">
              Join enterprise
            </button>
          </form>
        </section>
      </div>

      <section className="enterprise-shell" aria-labelledby="enterprise-workspace-title">
        <aside className="enterprise-rail enterprise-left-rail">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Workspace</span>
              <h2 id="enterprise-workspace-title">Command center</h2>
            </div>
            <div className="status-pill ready">
              {organizations.length} workspace{organizations.length === 1 ? "" : "s"}
            </div>
          </div>

          {organizations.length > 0 ? (
            <>
              <div className="enterprise-selector" aria-label="Enterprise switcher">
                {organizations.map((organization) => (
                  <button
                    className={
                      organization.id === activeOrganization?.id
                        ? "enterprise-selector-chip active"
                        : "enterprise-selector-chip"
                    }
                    key={organization.id}
                    onClick={() => onSelectOrganization(organization.id)}
                    type="button"
                  >
                    <span className="enterprise-selector-name">{organization.name}</span>
                    <small>{organization.plan}</small>
                  </button>
                ))}
              </div>

              {activeOrganization ? (
                <article className="enterprise-current-card">
                  <div className="enterprise-current-head">
                    <div>
                      <strong>{activeOrganization.name}</strong>
                      <p>Plan: {activeOrganization.plan}</p>
                    </div>
                    <span className="status-pill ready">Live</span>
                  </div>
                  <div className="enterprise-key-card">
                    <span>Join key</span>
                    <code>{activeOrganization.joinKey}</code>
                    <button
                      className="secondary-action"
                      onClick={() => onCopyJoinKey(activeOrganization.joinKey)}
                      type="button"
                    >
                      Copy key
                    </button>
                  </div>
                  <div className="enterprise-stat-grid">
                    <article>
                      <strong>{activeMembers.length}</strong>
                      <span>members</span>
                    </article>
                    <article>
                      <strong>{activeMessages.length}</strong>
                      <span>messages</span>
                    </article>
                    <article>
                      <strong>{activeAssignments.length}</strong>
                      <span>assignments</span>
                    </article>
                  </div>
                </article>
              ) : null}

              <div className="enterprise-member-section">
                <div className="enterprise-section-line">
                  <strong>People in this workspace</strong>
                  <span>{activeMembers.length} visible</span>
                </div>
                <div className="enterprise-member-list" aria-label="Enterprise members">
                  {activeMembers.map((member) => (
                    <article className="enterprise-member-row" key={member.id}>
                      <div className="enterprise-avatar" aria-hidden="true">
                        {initials(member.fullName)}
                      </div>
                      <div className="enterprise-member-copy">
                        <strong>{member.fullName}</strong>
                        <span>{member.email || "Email hidden"}</span>
                      </div>
                      <div className="enterprise-member-role">{member.role}</div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="section-note">
              No enterprise is active yet. Create one or join with a team key to unlock shared chat
              and AI assignment extraction.
            </p>
          )}
        </aside>

        <section className="enterprise-chat-surface" aria-labelledby="enterprise-chat-title">
          <div className="enterprise-chat-header">
            <div>
              <span className="eyebrow">Chat</span>
              <h2 id="enterprise-chat-title">
                {activeOrganization ? `# ${activeOrganization.name.toLowerCase().replace(/\s+/g, "-")}` : "Enterprise chat"}
              </h2>
            </div>
            <div className="status-pill ready">AI watched</div>
          </div>
          <p className="section-note">
            Ask for work in plain English and the assistant can capture owners, deadlines, and next
            actions from the conversation.
          </p>

          <div className="enterprise-chat-log enterprise-chat-feed" aria-live="polite">
            {activeMessages.length > 0 ? (
              activeMessages.map((message) => {
                const isOwn = currentUserId ? message.userId === currentUserId : false;
                return (
                  <article
                    className={isOwn ? "enterprise-chat-message own" : "enterprise-chat-message"}
                    key={message.id}
                  >
                    <div className="enterprise-avatar" aria-hidden="true">
                      {initials(message.senderName)}
                    </div>
                    <div className="enterprise-chat-bubble">
                      <div className="enterprise-chat-meta">
                        <strong>{message.senderName}</strong>
                        <span>{formatChatTimestamp(message.createdAt)}</span>
                      </div>
                      <p>{message.body}</p>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="enterprise-chat-empty">
                <strong>No chat activity yet</strong>
                <p>
                  Send a message like "Maya please draft the investor response by tomorrow at 10
                  AM" and the assistant will stage the resulting work.
                </p>
              </div>
            )}
          </div>

          <form className="enterprise-composer" onSubmit={onSendMessage}>
            <label className="enterprise-composer-label">
              Enterprise chat message
              <textarea
                aria-label="Enterprise chat message"
                onChange={(event) => onMessageDraftChange(event.target.value)}
                placeholder="Maya please review the client renewal and send me the update by 3 PM."
                rows={4}
                value={messageDraft}
              />
            </label>
            <div className="enterprise-composer-actions">
              <button
                className="primary-action"
                disabled={!activeOrganization || isBusy}
                type="submit"
              >
                Send message and run AI
              </button>
              <span className="inline-help">
                {activeOrganization
                  ? "Shared chat updates the assignment rail after each send."
                  : "Create or join a workspace before sending team messages."}
              </span>
            </div>
          </form>
        </section>

        <aside className="enterprise-rail enterprise-right-rail">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Assignments</span>
              <h2 id="enterprise-assignment-title">AI-captured team work</h2>
            </div>
            <div className="status-pill ready">
              {activeAssignments.length} scheduled
            </div>
          </div>
          <p className="section-note">
            Captured assignments can be sent to the calendar with the owner named directly in the
            event title.
          </p>
          <div className="enterprise-assignment-list">
            {activeAssignments.length > 0 ? (
              activeAssignments.map((assignment) => (
                <article className="enterprise-assignment-card" key={assignment.id}>
                  <div className="enterprise-assignment-meta">
                    <span>{assignment.assignedToLabel}</span>
                    <small>
                      {new Date(assignment.startAt).toLocaleString()} to{" "}
                      {new Date(assignment.endAt).toLocaleTimeString()}
                    </small>
                  </div>
                  <h3>{assignment.title}</h3>
                  <p>{assignment.detail}</p>
                  <div className="button-row">
                    <button className="secondary-action" onClick={onOpenCalendar} type="button">
                      Open shared calendar
                    </button>
                    {assignment.status !== "done" ? (
                      <button
                        className="primary-action"
                        onClick={() => onMarkAssignmentDone(assignment.id)}
                        type="button"
                      >
                        Mark done
                      </button>
                    ) : (
                      <span className="status-pill ready">Done</span>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="enterprise-chat-empty">
                <strong>No assignments yet</strong>
                <p>
                  The assistant needs a concrete owner plus a deliverable before it stages work
                  here.
                </p>
              </div>
            )}
          </div>

          <div className="enterprise-shortcuts">
            <div className="enterprise-section-line">
              <strong>Workspace shortcuts</strong>
              <span>Move fast</span>
            </div>
            <div className="premium-actions" aria-label="Enterprise shortcuts">
              <button className="primary-action" onClick={onOpenSources} type="button">
                Configure sources
              </button>
              <button className="secondary-action" onClick={onOpenDrafts} type="button">
                Open drafts
              </button>
              <button className="secondary-action" onClick={onOpenProductivity} type="button">
                Open productivity
              </button>
              <button className="secondary-action" onClick={onOpenCalendar} type="button">
                Open calendar
              </button>
            </div>
          </div>
        </aside>
      </section>

      <section className="premium-panel" aria-labelledby="premium-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Feature map</span>
            <h2 id="premium-title">Everything already shipping in this app</h2>
          </div>
          <div className="status-pill ready">Current build</div>
        </div>
        <div className="premium-grid">
          {featureCards.map((feature) => (
            <article className="premium-card" key={feature.title}>
              <span>{feature.surface}</span>
              <h3>{feature.title}</h3>
              <p>{feature.outcome}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "A";
}

function formatChatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
