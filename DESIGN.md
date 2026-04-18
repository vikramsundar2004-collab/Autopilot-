# Design System - Autopilot-AI

## Product Context
- **What this is:** A productivity cockpit that reads Gmail and calendar context, extracts action items, drafts replies, and helps plan the day.
- **Who it is for:** Operators, founders, and busy professionals who want one place to see what matters next.
- **Project type:** Web-first application with a matching iOS shell.
- **Current product boundary:** Live Google Workspace sync, editable reply drafts, privacy controls, AI planning, calendar operations, and enterprise-style audit and approval concepts.

## Aesthetic Direction
- **Direction:** Warm operations room.
- **Mood:** Controlled, premium, and simple. The app should feel like a focused command desk, not a toy dashboard.
- **Visual stance:** Dark navigation rail, bright paper workspace, strong typography, clear information blocks, restrained color.
- **Avoid:** Generic pale SaaS cards, giant empty whitespace, purple gradients, overly rounded “AI blob” styling, or marketing-site patterns inside the product.

## Typography
- **Display:** Sora for headlines, commands, and structural titles.
- **Body/UI:** Source Sans 3 for dense readable interface copy.
- **Data:** JetBrains Mono for time, counts, scopes, and system labels.
- **Scale:** 12, 14, 16, 18, 24, 32, 44 px.

## Color
- **Ink:** #161311
- **Muted:** #61584f
- **Surface:** #efe8dc
- **Panel:** #fffaf2
- **Line:** #d9cfbf
- **Primary:** #bf5a33
- **Primary strong:** #8f3f22
- **Accent:** #194f45
- **Warning:** #d59c1f
- **Info:** #2a69c7
- **Success:** #25815b

## Layout
- **Approach:** Persistent left rail plus one dominant workspace canvas.
- **Desktop:** Dark navigation column, wide center workspace, right-side calendar operations stack where needed.
- **Tablet/mobile:** Stack the workspace vertically, keep cards readable, and prevent horizontal overflow at all costs.
- **Panels:** Large paper-like cards with subtle depth and sharper hierarchy.

## Motion
- **Approach:** Functional only.
- **Timing:** 140ms hover/focus, 180ms state transitions.
- **Rule:** Motion should confirm intent, not decorate static pages.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-18 | Move to a warm operations-room visual system | The previous interface was too close to a generic productivity dashboard and did not feel distinct enough. |
| 2026-04-18 | Put calendar AI directly on the calendar page | Users should not have to infer that calendar AI exists from the daily page. |
| 2026-04-18 | Keep Gmail, drafts, planning, and privacy as one narrative | The product works best when these surfaces read as one coordinated workflow instead of disconnected features. |
