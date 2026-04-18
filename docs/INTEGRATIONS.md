# Integration Setup

This is the shortest safe path to make the current app connect to real platforms.

## Current Rollout State

- Google Workspace: live now for sign-in, Gmail metadata sync, and Calendar metadata sync.
- Slack: identity-only today through Supabase OAuth. Real channel and DM ingestion still needs a backend Slack app install.
- Microsoft 365: backend-required.
- Notion: backend-required.
- WhatsApp Business: backend-required.

## Already Done In Code

- Installed `@supabase/supabase-js`.
- Added `.env.example`.
- Added Supabase client setup in `src/integrations/supabaseClient.ts`.
- Added OAuth start and callback handling in `src/integrations/auth.ts`.
- Added provider registry in `src/integrations/providers.ts`.
- Added visible provider cards for Google, Slack, WhatsApp, Microsoft 365, and Notion.
- Added an integration rollout map in the Sources page so the UI states what is truly live vs setup-required.
- Added tests that keep Google read-only and WhatsApp server-only.
- Added `supabase/schema.sql` with starter profiles, settings, connected account metadata, action items, and row-level security policies.

## You Need To Do

### 1. Supabase

1. Create a Supabase project.
2. Copy `.env.example` to `.env`.
3. Fill:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_APP_URL=http://127.0.0.1:5173
```

4. Run `supabase/schema.sql` in the Supabase SQL editor.
5. Restart the dev server after editing `.env`.

Official docs: [Supabase signInWithOAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth).

Detailed local setup: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

### 2. Google Gmail + Calendar

1. In Google Cloud, create an OAuth web client.
2. Add this authorized JavaScript origin for local dev:

```text
http://127.0.0.1:5173
```

3. Add your Supabase callback URL as an authorized redirect URI:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

4. In Supabase Auth, enable the Google provider and paste the Google client ID and client secret.
5. Add these Google scopes:

```text
openid
email
profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/calendar.events.readonly
```

Use Gmail `readonly`, not `https://mail.google.com/`. The full Gmail scope can permanently delete messages and is not needed here.

Current send behavior:

- The app can draft replies and hand them off into a prefilled Gmail compose window.
- Direct Gmail API sending is not enabled in the current connectivity model.
- If you later want server-driven send through the Gmail API, you will need an additional Gmail send scope and a new Google re-consent / verification pass.

Important: Gmail `gmail.readonly` is a restricted scope. A public production app can require Google verification, and storing or transmitting restricted Gmail data can require a security assessment.

Official docs:
- [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)

### Deploy these Supabase edge functions for the current build

```bash
npx supabase functions deploy store-google-connection --project-ref qwktgunwrasxthmssnxk --use-api --no-verify-jwt
npx supabase functions deploy sync-google-workspace --project-ref qwktgunwrasxthmssnxk --use-api --no-verify-jwt
npx supabase functions deploy sync-microsoft-workspace --project-ref qwktgunwrasxthmssnxk --use-api --no-verify-jwt
npx supabase functions deploy plan-day --project-ref qwktgunwrasxthmssnxk --use-api --no-verify-jwt
npx supabase functions deploy draft-email --project-ref qwktgunwrasxthmssnxk --use-api --no-verify-jwt
npx supabase functions deploy create-enterprise --project-ref qwktgunwrasxthmssnxk --use-api --no-verify-jwt
npx supabase functions deploy join-enterprise --project-ref qwktgunwrasxthmssnxk --use-api --no-verify-jwt
npx supabase functions deploy enterprise-chat-assistant --project-ref qwktgunwrasxthmssnxk --use-api --no-verify-jwt
```

Secrets required on the Supabase project:

```bash
TOKEN_ENCRYPTION_KEY=YOUR_32_CHAR_RANDOM_KEY
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_PLANNER_MODEL=gpt-5.4
```

### 3. Slack

Current state in this app:

- Slack identity can be wired through Supabase OAuth.
- Slack messages are not yet honest production data until a server-backed Slack OAuth install exists.

For identity only:

1. Create a Slack app.
2. Add the Supabase callback URL:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

3. Add Slack OIDC user scopes:

```text
openid
profile
email
```

4. Enable Slack OIDC in Supabase Auth.

For reading channels or DMs later, add a backend Slack OAuth install flow. Slack message scopes must be exchanged server-side and stored securely.

Recommended backend follow-up:

1. Add a `store-slack-connection` function that mirrors the Google token-vault model.
2. Add a `sync-slack-workspace` function that reads channels, DMs, sender identity, and timestamps.
3. Cache message metadata only unless you explicitly decide to store more.
4. Keep reconnect state in `connected_accounts` just like Google.

Official docs:
- [Supabase Slack login](https://supabase.com/docs/guides/auth/social-login/auth-slack)
- [Slack OAuth v2](https://docs.slack.dev/authentication/installing-with-oauth/)

### 4. WhatsApp Business

WhatsApp is not a normal browser OAuth button. It needs server-side setup.

1. Create a Meta app.
2. Enable WhatsApp Business Platform.
3. Create or connect a WhatsApp Business Account.
4. Get:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_WABA_ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN
```

5. Store those only on the server.
6. Add a webhook endpoint that validates Meta webhook verification and signatures.
7. Pull inbound messages into Supabase, then pass sanitized message text into the task extraction pipeline.

Official docs: [WhatsApp Business Platform Node.js SDK quickstart](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/).

### 5. Microsoft 365 And Notion

The app has provider slots for both. They need backend OAuth before real data access.

Suggested order:

1. Finish Google and Slack sign-in.
2. Add Supabase tables for connected accounts and provider tokens.
3. Add backend token exchange routes.
4. Add Microsoft Graph mail/calendar ingestion.
5. Add Notion page/database ingestion.

Security rule for every non-Google provider:

- Browser can start the flow.
- Backend owns token exchange.
- Backend vault stores refresh or long-lived tokens.
- The app UI should only show a provider as connected once token storage and status tracking are durable.

## Token Rule

Never put provider secrets or long-lived provider tokens in `VITE_` variables. Anything prefixed with `VITE_` is bundled into browser JavaScript.

## Local Test

After setup:

```bash
npm run dev
```

Open the app, click `Connect Google`, and complete the OAuth screen. If the app returns to `/auth/callback`, the client exchanges the code and returns you to `/`.
