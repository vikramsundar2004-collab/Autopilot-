import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.autopilotai.app",
  appName: "Autopilot-AI",
  webDir: "dist",
  ios: {
    contentInset: "automatic",
  },
};

export default config;
