# Design System - Autopilot-AI

## Product Context
- **What this is:** A productivity command center that turns email and calendar signals into a clean daily action plan.
- **Who it is for:** Busy professionals who lose track of commitments buried in inbox threads.
- **Project type:** Web app dashboard.
- **Current product boundary:** Mock data only with Supabase OAuth scaffolding. No live Gmail, Calendar, Slack message, WhatsApp, database persistence, or pricing flow in this version.

## Aesthetic Direction
- **Direction:** Editorial utility.
- **Decoration level:** Minimal and intentional.
- **Mood:** Calm, crisp, and decisive. It should feel like a thoughtful operations desk, not a loud SaaS dashboard.
- **Avoid:** Purple gradients, decorative blobs, oversized rounded cards, icon-in-circle feature grids, centered marketing copy.

## Typography
- **Display:** Instrument Serif, used sparingly for the product mark and one daily readout.
- **Body/UI:** Instrument Sans, because it stays readable in dense app layouts without feeling default.
- **Data:** IBM Plex Mono, used for time, confidence, and counts.
- **Scale:** 12, 14, 16, 18, 24, 32, 44 px.

## Color
- **Approach:** Balanced. Neutrals carry the interface, green marks forward motion, red marks urgency, yellow marks time pressure.
- **Ink:** #171717
- **Muted ink:** #62645f
- **Surface:** #f7f8f6
- **Panel:** #ffffff
- **Line:** #dadfd6
- **Primary:** #23684e
- **Accent:** #d4583f
- **Warning:** #e0b943
- **Info:** #3b6f8f
- **Success:** #2d7b51

## Spacing
- **Base unit:** 4px.
- **Density:** Comfortable but information-rich.
- **Scale:** 4, 8, 12, 16, 20, 24, 32, 48, 64 px.

## Layout
- **Approach:** App-first, with persistent navigation, one main workspace, and a secondary insight rail.
- **Grid:** Desktop uses left nav, main action list, right calendar rail. Tablet stacks the right rail. Mobile collapses into a single-column command feed.
- **Border radius:** 4px for small controls, 8px for repeated cards and panels, never more unless circular avatars.

## Motion
- **Approach:** Minimal-functional.
- **Duration:** 120ms for hover/focus, 180ms for state changes.
- **Rule:** Motion must clarify state, not decorate empty space.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-16 | Build v1 as mock-backed local app | User explicitly asked not to connect Supabase, Google, accounts, or pricing yet. |
| 2026-04-16 | Keep email intelligence in pure TypeScript functions | Future integrations can replace data sources without rewriting React components. |
| 2026-04-16 | Ship the extra workflow work as an action lab | The app should expose usable behaviors like apply, undo, snooze, share, sync, and save instead of showing internal planning notes. |
| 2026-04-17 | Simplify the visual system | The action lab is flatter, labels are shorter, shadows are quieter, and the page reads more like a focused work surface than a control matrix. |
| 2026-04-17 | Add a familiar calendar day view | The integrated calendar now uses a week strip, hourly grid, and color-coded event blocks so it feels closer to Google Calendar while staying visually aligned with the app. |
| 2026-04-17 | Add productivity controls above integrations | Focus sprints, quick capture, and planning modes are placed near the daily call because they directly change what the user does next. |
| 2026-04-17 | Add practical customization | Theme, density, workspace visibility, productivity defaults, and calendar preferences are saved locally now and isolated for future Supabase profile storage. |
| 2026-04-17 | Add a skippable tutorial | First-run guidance uses a small modal so users can learn the app without replacing the working dashboard. |
