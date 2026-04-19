# Autopilot-AI Publish Readiness

## Product Position

Autopilot-AI should ship as one product with two clear lanes:

- Consumer: a daily operating plan for people buried in email, calendar, and follow-up work.
- Enterprise: a shared command center for teams that need source-backed work capture, assignment ownership, and audit-safe automation.

The app is strongest when it does one job well: turn work signals into a trusted next move. Anything that feels like a demo lab should either become a real workflow or leave the main navigation.

## Current Fixes

- Removed the standalone Actions page from routing, sidebar navigation, persisted page order, tutorial copy, and enterprise shortcuts.
- Moved team handoffs into Productivity so delegation is part of planning work, not a separate demo surface.
- Removed the action-lab UI from the publishable app shell.
- Updated docs to match the current product structure.
- Fixed Node 25/Vitest localStorage behavior with a test-only storage shim and a cross-platform Vitest launcher.
- Limited Vitest discovery to source tests so browser QA artifacts cannot be picked up as test suites.
- Polished the UI toward a cleaner publishable style: white sidebar, neutral surfaces, teal primary action color, tighter 8px radii, no decorative radial background blobs, and mobile wrapping fixes.

## Enterprise Lane

Ship-ready enterprise work should focus on:

- Organization workspace creation and join flows.
- Shared chat with AI assignment extraction.
- Owner, deadline, and status tracking.
- Shared calendar handoff from assignments.
- Admin controls for connected providers, token boundaries, and private sender exclusions.
- Audit events for AI planning, approvals, assignments, and external write attempts.
- Clear source citations on every AI-generated task.

Enterprise users need to trust three things:

1. The app only reads what it says it reads.
2. AI recommendations show where they came from.
3. Nothing writes to email, calendar, or team tools without an explicit approval path.

## Consumer Lane

Ship-ready consumer work should focus on:

- Fast daily plan from Gmail and Calendar.
- A readable inbox view with private sender blocking.
- Editable reply drafts before Gmail compose opens.
- Calendar blocks users can edit before relying on them.
- Rescue playbooks for overloaded days.
- Lightweight customization without turning the app into settings soup.

Consumer users need to feel immediate relief:

```
Connect source -> See top work -> Choose next move -> Protect time -> Draft or delegate
```

## Not In Scope For This Cleanup

- Billing and plan enforcement.
- Full native SwiftUI rewrite.
- External write-back to Gmail, Calendar, Slack, Microsoft, WhatsApp, or Notion.
- Background sync workers.
- SSO, SCIM, DLP, retention controls, and admin policy UI.
- Production incident monitoring.

## Engineering Gaps Before Public Launch

- Wire browser persistence to Supabase instead of local-only state.
- Add end-to-end tests for the Google connection, daily planner, reply drafts, and enterprise assignment flows.
- Add deploy canary checks for console errors, route loading, and basic interaction flows.
- Add rate-limit and quota messaging for OpenAI-backed planning.
- Split the large `src/App.tsx` file into route-level components after this cleanup lands.
- Add a production privacy/security pass over OAuth scopes, edge function auth, and token storage.

## Release Gate

Before publishing:

- `npm run test` passes.
- `npm run build` passes.
- Mobile and desktop screenshots show no clipped navigation, modal actions, or primary text.
- The sidebar has no Actions page.
- Enterprise shortcuts point to Sources, Drafts, Productivity, and Calendar.
- Docs describe the same product the app ships.
