# Autopilot-AI

Autopilot-AI is a mock-backed productivity app that turns email and calendar signals into a daily action plan. The prototype includes page-based workspaces, usable workflow controls, local customization, a skippable tutorial, and a larger calendar workspace.

This first version includes the integration shell for Supabase OAuth, Google, Slack, WhatsApp, Microsoft 365, and Notion. Google and Slack sign-in buttons become live after Supabase env vars and provider credentials are configured. WhatsApp, Microsoft 365 message access, Slack message access, and Notion content access are intentionally marked server-required because their long-lived tokens must not live in a browser bundle.

## Run Locally

```bash
npm install
npm run dev
```

## Checks

```bash
npm run test
npm run build
```

## iOS App

The project includes a Capacitor iOS shell with bundle ID `com.autopilotai.app`.

```bash
npm run ios:sync
npm run ios:open
```

Native iOS build and simulator testing require macOS and Xcode. Read [docs/IOS_APP.md](docs/IOS_APP.md).

## Integration Setup

Read [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) and [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for the shortest path. The minimum local setup is:

1. Copy `.env.example` to `.env`.
2. Fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_URL`.
3. Run `supabase/schema.sql` in the Supabase SQL editor.
4. Configure Google and Slack OIDC providers in Supabase Auth.
5. Restart `npm run dev`.

## What Is In V1

- Email-derived action list with priority, confidence, source, and risk signals.
- Persistent sidebar navigation with separate pages for Daily plan, Productivity, Sources, Actions, Customize, Calendar, Privacy, and the $200/month value plan.
- Full Google Calendar-style day view with a week strip, larger hourly grid, event blocks, meetings, and protected focus windows.
- Productivity cockpit for focus sprints, quick-captured tasks, and planning modes for impact, quick wins, or deep work.
- Customize panel for visual theme, density, visible workspace sections, productivity defaults, and calendar preferences.
- First-run tutorial with skip, completion, and replay controls.
- Triage filters for all tasks, urgent tasks, waiting tasks, and done tasks.
- Integration readiness for Google, Slack, WhatsApp, Microsoft 365, and Notion.
- An action lab covering recommendations, cross-device continuity, event triggers, shareable state, accessibility, multi-select actions, contextual hints, role-aware defaults, inline editing, and saved presets.
- Premium value page covering executive briefs, work graph, AI citations, protected focus scheduling, delegation, approval-gated automation, security controls, personalization, and ROI reporting.
- Source explainability, privacy boundary messaging, effort/impact scoring, and a recovery plan for missed work are built into the daily plan.

## Deferred

- Supabase database persistence wiring from the browser app into the starter schema.
- Server routes or edge functions for Gmail, Slack messages, WhatsApp, Microsoft 365, and Notion ingestion.
- Pricing, billing, and plans.
- Real AI/LLM extraction. The current extraction is deterministic mock logic for product validation.
