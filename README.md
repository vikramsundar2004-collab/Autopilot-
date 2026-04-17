# Tempo Inbox

Tempo Inbox is a mock-backed productivity app that turns email and calendar signals into a daily action plan. It now includes two idea-improver passes that track 150 generated improvements in the visible product surface.

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

## Integration Setup

Read [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for the shortest path. The minimum local setup is:

1. Copy `.env.example` to `.env`.
2. Fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_URL`.
3. Configure Google and Slack OIDC providers in Supabase Auth.
4. Restart `npm run dev`.

## What Is In V1

- Email-derived action list with priority, confidence, source, and risk signals.
- Calendar-aware daily schedule with meetings and protected focus windows.
- Triage filters for all tasks, urgent tasks, waiting tasks, and done tasks.
- Integration readiness for Google, Slack, WhatsApp, Microsoft 365, and Notion.
- A 150-item improvement studio covering recommendations, cross-device continuity, event triggers, shareable state, accessibility, multi-select actions, contextual hints, role-aware defaults, inline editing, and saved presets.
- AI saturation tracking: the second successful 75-idea pass repeated the first 75 titles, so the app surfaces that as a 100% saturation signal instead of hiding the repetition.
- Improvement ideas already folded into the product: source explainability, privacy boundary messaging, effort/impact scoring, and a recovery plan for missed work.

## Deferred

- Supabase database persistence and row-level security tables.
- Server routes or edge functions for Gmail, Slack messages, WhatsApp, Microsoft 365, and Notion ingestion.
- Pricing, billing, and plans.
- Real AI/LLM extraction. The current extraction is deterministic mock logic for product validation.
