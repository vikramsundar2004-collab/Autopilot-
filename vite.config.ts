import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  // Capacitor needs relative assets inside the app bundle. Hosted web deploys do not.
  base: mode === "ios" ? "./" : "/",
  plugins: [react()],
  build: {
    target: "es2020",
    cssTarget: "chrome80",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
          icons: ["lucide-react"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
}));
