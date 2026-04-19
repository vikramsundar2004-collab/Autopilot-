import { spawn } from "node:child_process";
import path from "node:path";

const storagePath = path.join(process.cwd(), ".vitest-localstorage");
const nodeOptions = process.env.NODE_OPTIONS ?? "";
const localStorageFlag = `--localstorage-file=${storagePath}`;
const env = {
  ...process.env,
  NODE_OPTIONS: nodeOptions.includes("--localstorage-file")
    ? nodeOptions
    : `${nodeOptions} ${localStorageFlag}`.trim(),
};
const vitest = path.join(process.cwd(), "node_modules", "vitest", "vitest.mjs");
const child = spawn(process.execPath, [vitest, "run", ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
