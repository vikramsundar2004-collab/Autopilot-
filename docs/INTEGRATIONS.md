# Integration Setup

This is the shortest safe path to make the current app connect to real platforms.

## Already Done In Code

- Installed `@supabase/supabase-js`.
- Added `.env.example`.
- Added Supabase client setup in `src/integrations/supabaseClient.ts`.
- Added OAuth start and callback handling in `src/integrations/auth.ts`.
- Added provider registry in `src/integrations/providers.ts`.
- Added visible provider cards for Google, Slack, WhatsApp, Microsoft 365, and Notion.
- Added tests that keep Google read-only and WhatsApp server-only.

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

4. Restart the dev server after editing `.env`.

Official docs: [Supabase signInWithOAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth).

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

Important: Gmail `gmail.readonly` is a restricted scope. A public production app can require Google verification, and storing or transmitting restricted Gmail data can require a security assessment.

Official docs:
- [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)

### 3. Slack

For sign-in only:

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

## Token Rule

Never put provider secrets or long-lived provider tokens in `VITE_` variables. Anything prefixed with `VITE_` is bundled into browser JavaScript.

## Local Test

After setup:

```bash
npm run dev
```

Open the app, click `Connect Google`, and complete the OAuth screen. If the app returns to `/auth/callback`, the client exchanges the code and returns you to `/`.
