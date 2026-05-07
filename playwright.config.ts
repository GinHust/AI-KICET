import { defineConfig, devices } from "@playwright/test";

const isWindows = process.platform === "win32";

const apiCommand = `${isWindows ? "python" : "python3"} -m uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8015`;

const webCommand = isWindows
  ? "cmd /c \"set \"NEXT_PUBLIC_USE_MOCK=false\" && set \"NEXT_PUBLIC_KICETIC_DATA_MODE=real\" && set \"NEXT_PUBLIC_KICETIC_API_BASE_URL=http://127.0.0.1:8015\" && set \"NEXT_PUBLIC_KICETIC_E2E_FAST=true\" && set \"NEXT_DIST_DIR=.next-playwright-%RANDOM%\" && npm run dev --workspace @kicetic/web -- --hostname 127.0.0.1 --port 3005\""
  : "NEXT_PUBLIC_USE_MOCK=false NEXT_PUBLIC_KICETIC_DATA_MODE=real NEXT_PUBLIC_KICETIC_API_BASE_URL=http://127.0.0.1:8015 NEXT_PUBLIC_KICETIC_E2E_FAST=true NEXT_DIST_DIR=.next-playwright-e2e npm run dev --workspace @kicetic/web -- --hostname 127.0.0.1 --port 3005";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3005",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: apiCommand,
      url: "http://127.0.0.1:8015/health",
      reuseExistingServer: true,
      timeout: 120000
    },
    {
      command: webCommand,
      url: "http://127.0.0.1:3005/dashboard/overview",
      reuseExistingServer: true,
      timeout: 120000
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
