# iOS App Setup

Autopilot-AI now has a Capacitor iOS shell. This keeps the existing React app and packages it as a native iOS project.

## What Is Already Done

- Added Capacitor dependencies.
- Added `capacitor.config.ts`.
- Added the native iOS project in `ios/App`.
- Set the bundle ID to `com.autopilotai.app`.
- Registered the URL scheme `com.autopilotai.app://` for Supabase OAuth callbacks.
- Added native app URL handling through `@capacitor/app`.
- Added npm scripts for syncing and opening the iOS project.

## Requirements

You need a Mac for the native build step:

- macOS
- Xcode
- Apple Developer account for physical-device install or App Store distribution
- Node.js and npm

Windows can build the web app and generate the iOS project files, but it cannot compile or run the iOS simulator.

## Important Architecture Note

- The current mobile app is a Capacitor iOS shell around the existing React web app.
- It is not an Expo or React Native project.
- If you want to test the current app on iOS, stay on the Capacitor path.
- Moving this repo to Expo would be a separate mobile rewrite or wrapper project, not a small config change.

## Build On A Mac

```bash
npm install
npm run ios:sync
npm run ios:open
```

Then in Xcode:

1. Select the `App` target.
2. Set your Apple development team under Signing & Capabilities.
3. Pick an iPhone simulator or physical device.
4. Press Run.

## Supabase Redirects For iOS

Keep the Google Cloud redirect URI as:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Add this redirect URL in Supabase Auth settings:

```text
com.autopilotai.app://auth/callback
```

For local web testing, keep:

```text
http://127.0.0.1:5173/auth/callback
```

Set this in `.env`:

```bash
VITE_IOS_REDIRECT_URL=com.autopilotai.app://auth/callback
```

## Daily iOS Workflow

After changing React code:

```bash
npm run ios:sync
```

Then rebuild from Xcode.

If only native iOS config changed and the web build did not change:

```bash
npx cap sync ios
```

## Notes

- The app is a native iOS WebView shell right now, not a full SwiftUI rewrite.
- This is the right first iOS version because it keeps the product moving while the UI, Supabase auth, and integrations are still changing.
- A future fully native SwiftUI app can reuse the same product structure: Daily plan, Productivity, Sources, Actions, Customize, Calendar, Privacy, and Premium plan.
