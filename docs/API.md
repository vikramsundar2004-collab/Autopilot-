# Autopilot-AI API

The first backend slice uses two Supabase Edge Functions:

- `store-google-connection` saves the user's Google access token and refresh token in an encrypted server-side vault after OAuth.
- `sync-google-workspace` pulls recent Gmail metadata and today's Google Calendar events into Supabase.
- `plan-day` turns stored or request-provided email and calendar signals into a daily action plan, schedule blocks, approval requests, audit events, and usage events.

Users connect Google once. After that, sync reads the encrypted server-side connection. If the access token expires, the sync function refreshes it with the stored refresh token.

## What It Does

`store-google-connection`:

1. Verifies the caller with the Supabase user session bearer token.
2. Receives the Google provider token from the successful Supabase OAuth callback.
3. Encrypts the token with `TOKEN_ENCRYPTION_KEY`.
4. Writes token ciphertext into `provider_token_vault`, which has RLS enabled and no browser-readable policy.
5. Writes safe connection metadata into `connected_accounts`.

`sync-google-workspace`:

1. Verifies the caller with the Supabase user session bearer token.
2. Loads and decrypts the stored Google connection server-side.
3. Refreshes the Google access token when needed.
4. Stores Gmail message metadata, snippets, sender, subject, labels, and received time in `email_messages`.
5. Stores same-day primary-calendar events in `calendar_events`.
6. Writes audit and usage events for enterprise reporting.

`plan-day`:

1. Verifies the caller with the Supabase user session bearer token.
2. Loads enterprise policy for the organization, when supplied.
3. Loads recent `email_messages`, removes any sender blocked from AI privacy controls, and loads same-day `calendar_events`, unless test payload data is passed directly.
4. Calls OpenAI's Responses API with structured JSON output when `OPENAI_API_KEY` is configured.
5. Falls back to deterministic planning logic when OpenAI is not configured or fails.
6. Persists:
   - `plan_runs`
   - `action_items`
   - `schedule_blocks`
   - `approval_requests`
   - `audit_events`
   - `usage_events`

## Function Request

The app calls this from `src/integrations/plannerApi.ts`.

```json
{
  "date": "2026-04-17",
  "timezone": "America/Los_Angeles",
  "organizationId": "optional-org-uuid",
  "planningMode": "impact"
}
```

For local API tests before provider ingestion exists, you can also pass `emails` and `calendarEvents` arrays in the request body. The function will use those instead of reading from the database.

## Function Response

```json
{
  "planRunId": "uuid",
  "source": "openai",
  "model": "gpt-5.4",
  "blockedEmailCount": 1,
  "summary": {
    "headline": "5 action items planned, 1 urgent.",
    "brief": "Autopilot-AI ranked the inbox and scheduled focus time.",
    "openCount": 5,
    "urgentCount": 1,
    "focusMinutes": 95,
    "risks": []
  },
  "actionItems": [],
  "scheduleBlocks": [],
  "enterpriseSignals": [],
  "persisted": {
    "ok": true,
    "actionCount": 5,
    "scheduleBlockCount": 3,
    "approvalCount": 2
  }
}
```

If no OpenAI key is set, `source` is `fallback` and the function still persists a usable plan.

## Google Sync Request

The app calls this from `src/integrations/workspaceSyncApi.ts` after Google OAuth consent.

```json
{
  "date": "2026-04-17",
  "organizationId": "optional-org-uuid",
  "maxEmails": 25,
  "maxEvents": 50,
  "providerAccessToken": "short-lived-google-token"
}
```

The browser client gets `providerAccessToken` from the active Supabase session and passes it directly to the Edge Function. The function uses it immediately and does not write it to the database.

## Required Supabase Secrets

Set these in Supabase, not in browser `.env` files:

```bash
supabase secrets set TOKEN_ENCRYPTION_KEY=GENERATE_A_32_PLUS_CHARACTER_RANDOM_SECRET
supabase secrets set GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
supabase secrets set GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
supabase secrets set OPENAI_PLANNER_MODEL=gpt-5.4
```

`OPENAI_PLANNER_MODEL` is optional. Keep it configurable so the product can move to a stronger or cheaper model without code changes.

## Deploy

```bash
supabase login
supabase link --project-ref qwktgunwrasxthmssnxk
supabase functions deploy store-google-connection
supabase functions deploy sync-google-workspace
supabase functions deploy plan-day
```

Then run `supabase/schema.sql` in the Supabase SQL editor if you have not already applied it.

## Enterprise Capabilities In This Slice

- Organization and membership tables for multi-seat accounts.
- Enterprise policy table for model, retention, email volume, calendar volume, and approval controls.
- Approval gating for email sends, calendar changes, external writes, and sensitive actions.
- Audit event trail for compliance.
- Usage events for future metering and pricing.
- Message-body processing disabled by default. The default policy uses snippets unless an organization explicitly enables body preview processing.
- Private-sender AI blocks so a user can exclude specific Gmail senders from action extraction and planning.

## Next Backend Slices

- Background scheduled sync using the saved Google refresh token.
- Slack, Microsoft, WhatsApp, and Notion ingestion through server-side token storage.
- Generated draft replies and calendar-change proposals behind `approval_requests`.
- Admin API for enterprise policy, audit export, retention, and seat management.
