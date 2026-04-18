# Render Setup For Google Verification

This project already has the basic public-site pieces Google expects:

- [render.yaml](../render.yaml) builds the Vite app as a Render static site.
- [`public/home.html`](../public/home.html) is the public homepage for the app.
- [`public/privacy.html`](../public/privacy.html) is the public privacy policy.
- [`public/terms.html`](../public/terms.html) is the public terms page.
- [`public/product.html`](../public/product.html) is the longer product explainer.

What Google verification still needs is not just deployment. It needs the right domain, the right OAuth branding, and accurate public disclosures that match the code.

## What This App Actually Requests

From code:

- Google OAuth scopes live in [`src/integrations/providers.ts`](../src/integrations/providers.ts).
- The app requests:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/calendar.events.readonly`
- Google login and workspace connection flow lives in [`src/integrations/auth.ts`](../src/integrations/auth.ts).
- Google tokens are stored server-side in [`supabase/functions/store-google-connection/index.ts`](../supabase/functions/store-google-connection/index.ts).
- Gmail snippets and calendar events are synced server-side in [`supabase/functions/sync-google-workspace/index.ts`](../supabase/functions/sync-google-workspace/index.ts).
- Synced email and calendar context can be sent to the planner model in [`supabase/functions/plan-day/index.ts`](../supabase/functions/plan-day/index.ts).

That means the verification story must accurately describe:

- Gmail message metadata plus snippet access
- Calendar event access
- server-side token storage
- AI planning using synced work context

## The Important Domain Rule

Google requires the homepage, privacy policy, terms page, and authorized domains to be on a verified domain you own.

Render gives every static site an `onrender.com` URL, but for Google verification you should use a custom domain you control, such as:

- `https://app.yourdomain.com`

Why:

- Google requires domain ownership verification in Search Console.
- Render supports attaching a custom domain to a static site.
- Using your own domain also keeps the public app pages and consent-screen links consistent.

Practical recommendation:

- Use a real domain you control.
- Point a subdomain like `app.yourdomain.com` to Render.
- Use that same domain for the public app pages.

## Recommended Production URLs

Once the site is deployed on your custom domain, use:

- Homepage: `https://app.yourdomain.com/home.html`
- Privacy policy: `https://app.yourdomain.com/privacy.html`
- Terms: `https://app.yourdomain.com/terms.html`
- Product page: `https://app.yourdomain.com/product.html`
- App: `https://app.yourdomain.com/`

Use the homepage URL, not the app root, in the Google consent screen if the app root is primarily a login or authenticated workspace surface.

## Render Setup

1. Push the repo to GitHub.
2. In Render, create a Static Site from this repo.
3. Use the existing blueprint in [`render.yaml`](../render.yaml).
4. Set environment variables:
   - `VITE_SUPABASE_URL=https://qwktgunwrasxthmssnxk.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<your anon key>`
5. Deploy the site.
6. In Render, add your custom domain.
7. Update DNS as Render instructs.
8. Wait for TLS to become active.

Render facts:

- Static sites auto-deploy on push.
- HTTPS is handled by Render.
- Custom domains are supported on static sites.

## Supabase Setup After Render Deploy

Update Supabase Auth URL configuration:

- Site URL: `https://app.yourdomain.com`
- Additional Redirect URL: `https://app.yourdomain.com/auth/callback`
- Keep mobile redirect URL: `com.autopilotai.app://auth/callback`

Do not change the Google OAuth redirect URI away from the Supabase callback. Keep:

- `https://qwktgunwrasxthmssnxk.supabase.co/auth/v1/callback`

## Google Auth Platform Setup

In Google Cloud / Google Auth Platform:

### Branding

Set:

- App name: `Autopilot-AI`
- Support email: a real monitored address you control
- Homepage: `https://app.yourdomain.com/home.html`
- Privacy policy: `https://app.yourdomain.com/privacy.html`
- Terms: `https://app.yourdomain.com/terms.html`
- App logo: your square app logo

### Authorized domains

Add the top private domain you control, for example:

- `yourdomain.com`

Then verify domain ownership in Google Search Console using a project owner/editor account.

### Data Access

Declare only the scopes actually used:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.events.readonly`

### OAuth client

For the Google web client used by Supabase:

- Authorized JavaScript origin:
  - `https://app.yourdomain.com`
- Authorized redirect URI:
  - `https://qwktgunwrasxthmssnxk.supabase.co/auth/v1/callback`

## Verification Reality For This App

This app is not in the easy bucket.

Reasons:

- `gmail.readonly` is a restricted Gmail scope.
- `calendar.events.readonly` is a sensitive scope.
- The backend stores Google tokens.
- The backend stores synced Gmail snippet data and calendar data.
- The planner function can process synced Google-derived context.

That means you should expect more than just basic brand verification.

Likely path:

1. Brand verification
2. Sensitive / restricted scope review
3. Additional review because Gmail restricted scope data is stored or transmitted server-side

## Lower-Friction Alternative

If your immediate goal is public launch and faster verification, the cleanest simplification is:

1. Launch with Google sign-in only or Calendar-only access first
2. Remove `gmail.readonly` from the production OAuth consent screen
3. Re-submit Gmail access later once you are ready for restricted-scope review

This repo currently asks for Gmail access in:

- [`src/integrations/providers.ts`](../src/integrations/providers.ts)
- [`src/integrations/auth.ts`](../src/integrations/auth.ts)
- [`supabase/functions/store-google-connection/index.ts`](../supabase/functions/store-google-connection/index.ts)
- [`supabase/functions/sync-google-workspace/index.ts`](../supabase/functions/sync-google-workspace/index.ts)

If you keep Gmail in scope, plan for the heavier review path.

## Submission Checklist

Before you click Submit for verification:

- Public site is live on your custom HTTPS domain
- Homepage, privacy, and terms pages all load without login
- Privacy page matches actual code behavior
- Search Console domain ownership is verified
- OAuth branding matches the live product
- Support email is real and monitored
- Scopes in Google Cloud exactly match the app
- Demo video shows:
  - homepage
  - sign-in flow
  - Google consent screen
  - source sync
  - planning flow
  - where Gmail and Calendar data appear in-product

## Useful Official References

- Google OAuth policy compliance:
  - https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
- Google verification requirements:
  - https://support.google.com/cloud/answer/13464321
- Gmail scope classifications:
  - https://developers.google.com/workspace/gmail/api/auth/scopes
- Supabase Google login:
  - https://supabase.com/docs/guides/auth/social-login/auth-google
- Render static sites:
  - https://render.com/docs/static-sites
- Render custom domains:
  - https://render.com/docs/custom-domains
