# AI Revision Pass

This file records the latest AI-product revision pass for Tempo Inbox.

## Idea Improver Runs

- Round 1 generated 75 improvements.
- Round 2 generated 75 improvements.
- The successful round 2 output repeated all 75 round 1 titles.
- Two stricter attempts to force non-overlapping round 2 titles returned zero ideas.

The app treats that as an AI saturation signal: every generated title is tracked, but repeated round 2 items are marked `Saturated` instead of pretending they are new.

Raw outputs are stored locally:

- `.codex/idea-improver-round-1.json`
- `.codex/idea-improver-round-2.json`

The app-facing generated catalog lives in:

- `src/ideaImproverResults.json`
- `src/improvements.ts`

## Review Decisions

- CEO review: keep pricing out of scope and focus the AI prototype on trust, usability, and integration readiness.
- Engineering review: keep generated idea data separate from derived product logic, then test the derivation layer.
- Design review: show all 150 records without making the dashboard unusable by using filters, compact rows, and a detail panel.
- Investigate review: failures found during verification were fixed at the source: stale selected idea state and stale test expectations.

## Current Verification Bar

The AI version is considered complete for this mock-backed stage when all checks pass:

```bash
npm run test
npm run build
npm audit --audit-level=high
```

Pricing, billing, live ingestion, and production account storage are still intentionally deferred.
