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
  onOpenActions: () => void;
  onOpenCalendar: () => void;
  onOpenDrafts: () => void;
  onOpenSources: () => void;
  onSelectOrganization: (organizationId: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
}

export function EnterprisePage({
  activeOrganizationId,
  assignments,
  createEnterpriseName,
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
  onOpenActions,
  onOpenCalendar,
  onOpenDrafts,
  onOpenSources,
  onSelectOrganization,
  onSendMessage,
}: EnterprisePageProps) {
  const activeOrganization =
    organizations.find((organization) => organization.id === activeOrganizationId) ?? organizations[0] ?? null;
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
            Create an enterprise, invite teammates with a join key, chat in one place, and let the
            AI assistant turn assigned work into shared calendar items with named owners.
          </p>
        </div>
      </header>

      <section className="enterprise-summary" aria-label="Enterprise status">
        <p>{notice}</p>
      </section>

      <div className="enterprise-overview-grid">
        <section className="enterprise-panel" aria-labelledby="enterprise-create-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Create</span>
              <h2 id="enterprise-create-title">Start a shared enterprise</h2>
            </div>
            <div className="status-pill ready">Team setup</div>
          </div>
          <p className="section-note">
            New enterprises generate a reusable join key so teammates can enter the same workspace.
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

        <section className="enterprise-panel" aria-labelledby="enterprise-join-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Join</span>
              <h2 id="enterprise-join-title">Join with a team key</h2>
            </div>
            <div className="status-pill">Invite only</div>
          </div>
          <p className="section-note">
            Teammates can join the same enterprise without a manual database step.
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

      <section className="enterprise-panel" aria-labelledby="enterprise-workspace-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2 id="enterprise-workspace-title">Current enterprise</h2>
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
                  {organization.name}
                </button>
              ))}
            </div>
            {activeOrganization ? (
              <div className="enterprise-meta-grid">
                <article className="enterprise-meta-card">
                  <strong>{activeOrganization.name}</strong>
                  <p>Plan: {activeOrganization.plan}</p>
                </article>
                <article className="enterprise-meta-card">
                  <strong>Join key</strong>
                  <div className="enterprise-key-row">
                    <code>{activeOrganization.joinKey}</code>
                    <button
                      className="secondary-action"
                      onClick={() => onCopyJoinKey(activeOrganization.joinKey)}
                      type="button"
                    >
                      Copy key
                    </button>
                  </div>
                </article>
                <article className="enterprise-meta-card">
                  <strong>{activeMembers.length}</strong>
                  <p>members currently visible in this enterprise</p>
                </article>
              </div>
            ) : null}
            <div className="enterprise-member-list" aria-label="Enterprise members">
              {activeMembers.map((member) => (
                <article className="enterprise-member-card" key={member.id}>
                  <strong>{member.fullName}</strong>
                  <p>{member.email || "Email hidden"}</p>
                  <span>{member.role}</span>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="section-note">
            No enterprise is active yet. Create one or join with a team key to unlock shared chat
            and AI assignment extraction.
          </p>
        )}
      </section>

      <div className="enterprise-workspace-grid">
        <section className="enterprise-panel" aria-labelledby="enterprise-chat-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Chat</span>
              <h2 id="enterprise-chat-title">Enterprise chat</h2>
            </div>
            <div className="status-pill ready">AI watched</div>
          </div>
          <p className="section-note">
            Every new message can trigger the assistant to extract assigned work and schedule it.
          </p>
          <div className="enterprise-chat-log" aria-live="polite">
            {activeMessages.length > 0 ? (
              activeMessages.map((message) => (
                <article className="enterprise-chat-bubble" key={message.id}>
                  <div className="enterprise-chat-meta">
                    <strong>{message.senderName}</strong>
                    <span>{new Date(message.createdAt).toLocaleString()}</span>
                  </div>
                  <p>{message.body}</p>
                </article>
              ))
            ) : (
              <p className="section-note">
                Shared chat is empty. Send a message like &quot;Maya please draft the investor
                response by tomorrow at 10 AM.&quot;
              </p>
            )}
          </div>
          <form className="enterprise-form" onSubmit={onSendMessage}>
            <label>
              Enterprise chat message
              <textarea
                aria-label="Enterprise chat message"
                onChange={(event) => onMessageDraftChange(event.target.value)}
                placeholder="Maya please review the client renewal and send me the update by 3 PM."
                rows={5}
                value={messageDraft}
              />
            </label>
            <button
              className="primary-action"
              disabled={!activeOrganization || isBusy}
              type="submit"
            >
              Send message and run AI
            </button>
          </form>
        </section>

        <section className="enterprise-panel" aria-labelledby="enterprise-assignment-title">
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
            The assistant places assigned work onto the shared calendar with the owner named
            directly in the calendar title.
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
              <p className="section-note">
                No assigned enterprise work has been captured yet. Ask a teammate to do something
                concrete in chat and the assistant will stage it here.
              </p>
            )}
          </div>
        </section>
      </div>

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
        <div className="premium-actions" aria-label="Enterprise shortcuts">
          <button className="primary-action" onClick={onOpenSources} type="button">
            Configure sources
          </button>
          <button className="secondary-action" onClick={onOpenDrafts} type="button">
            Open drafts
          </button>
          <button className="secondary-action" onClick={onOpenActions} type="button">
            Open action lab
          </button>
          <button className="secondary-action" onClick={onOpenCalendar} type="button">
            Open calendar
          </button>
        </div>
      </section>
    </>
  );
}
