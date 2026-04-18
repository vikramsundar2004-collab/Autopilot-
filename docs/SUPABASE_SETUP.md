# Supabase Setup

Use this to get the first connected Autopilot-AI build ready for local Google OAuth testing.

## 1. Create Supabase Project

1. Create a Supabase project.
2. Open Project Settings, then API.
3. Copy the project URL and anon public key.
4. Copy `.env.example` to `.env`.
5. Fill:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_APP_URL=http://127.0.0.1:5173
```

Restart `npm run dev` after editing `.env`.

## 2. Add Local Auth URLs

In Supabase Auth settings:

```text
Site URL: http://127.0.0.1:5173
Redirect URL: http://127.0.0.1:5173/auth/callback
```

For the iOS app, also add:

```text
Redirect URL: com.autopilotai.app://auth/callback
```

## 3. Run Starter Schema

Open the Supabase SQL editor and run:

```text
supabase/schema.sql
```

This creates:

- `profiles`
- `user_settings`
- `connected_accounts`
- `provider_token_vault`
- `action_items`
- `organizations`
- `organization_memberships`
- `enterprise_policies`
- `email_messages`
- `calendar_events`
- `plan_runs`
- `schedule_blocks`
- `approval_requests`
- `audit_events`
- `usage_events`
- row-level security policies for user-owned rows

It does not store provider refresh tokens. Tokens for Gmail, Slack messages, WhatsApp, Microsoft, and Notion need server-side storage before real ingestion.

## 4. Deploy the Planning API

Install the Supabase CLI, then run:

```bash
supabase login
supabase link --project-ref qwktgunwrasxthmssnxk
supabase secrets set TOKEN_ENCRYPTION_KEY=GENERATE_A_32_PLUS_CHARACTER_RANDOM_SECRET
supabase secrets set GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
supabase secrets set GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
supabase secrets set OPENAI_PLANNER_MODEL=gpt-5.4
supabase functions deploy store-google-connection
supabase functions deploy sync-google-workspace
supabase functions deploy plan-day
supabase functions deploy draft-email
```

The `OPENAI_API_KEY` secret stays inside Supabase Edge Functions. Do not add it as a `VITE_` browser variable.

The first Google OAuth callback calls `store-google-connection`, which saves an encrypted token connection server-side. Users should not have to reconnect every time.

The app's Sources page has a `Sync Google data` button. It calls `sync-google-workspace` to store recent Gmail and today's Calendar rows using the saved Google connection.

The app's Productivity page has a `Run AI planning API` button. It calls `plan-day` and shows the created action, schedule block, and approval counts.

The app's Drafts page calls `draft-email` to turn important non-promotional email threads into editable reply drafts through the backend API path.

## 5. Configure Google OAuth

In Google Cloud:

1. Create an OAuth web client.
2. Add authorized JavaScript origin:

```text
http://127.0.0.1:5173
```

3. Add authorized redirect URI:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Do not add the iOS custom scheme to Google Cloud. Google returns to Supabase first, then Supabase redirects back to `com.autopilotai.app://auth/callback`.

In Supabase Auth Providers:

1. Enable Google.
2. Paste the Google client ID and client secret.
3. Save the provider.

The app requests these scopes:

```text
openid
email
profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/calendar.events.readonly
```

## 6. Test Locally

```bash
npm run dev
```

Open `http://127.0.0.1:5173`, go to Sources, and click `Connect Google`.

Expected result:

1. Browser opens Google consent.
2. Google returns to Supabase.
3. Supabase redirects to `/auth/callback`.
4. The app exchanges the code and returns to `/`.

To test the API path:

1. Sign in through Supabase/Google.
2. Open the Sources page.
3. Click `Sync Google data`.
4. Open the Productivity page.
5. Click `Run AI planning API`.
6. Expect a notice with the plan source and persisted counts.

If Google does not return a refresh token, remove Autopilot-AI access from your Google account and connect again. Google usually only returns a refresh token on the first consent grant.

## 7. Next Backend Work

- Persist customization settings from `localStorage` into `user_settings`.
- Store connected-account metadata in `connected_accounts`.
- Add scheduled background sync from the saved Google refresh token.
- Add edge functions or API routes for Slack message sync, WhatsApp webhooks, Microsoft Graph, and Notion.
