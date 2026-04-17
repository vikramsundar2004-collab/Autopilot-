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

## 3. Run Starter Schema

Open the Supabase SQL editor and run:

```text
supabase/schema.sql
```

This creates:

- `profiles`
- `user_settings`
- `connected_accounts`
- `action_items`
- row-level security policies for user-owned rows

It does not store provider refresh tokens. Tokens for Gmail, Slack messages, WhatsApp, Microsoft, and Notion need server-side storage before real ingestion.

## 4. Configure Google OAuth

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

## 5. Test Locally

```bash
npm run dev
```

Open `http://127.0.0.1:5173`, go to Sources, and click `Connect Google`.

Expected result:

1. Browser opens Google consent.
2. Google returns to Supabase.
3. Supabase redirects to `/auth/callback`.
4. The app exchanges the code and returns to `/`.

## 6. Next Backend Work

- Persist customization settings from `localStorage` into `user_settings`.
- Store connected-account metadata in `connected_accounts`.
- Add server-side token vaulting before any provider ingestion.
- Add edge functions or API routes for Gmail sync, Slack message sync, WhatsApp webhooks, Microsoft Graph, and Notion.
