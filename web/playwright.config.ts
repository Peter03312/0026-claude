import { defineConfig, devices } from "@playwright/test";

// Compose verify 服务中由环境变量指向栈内 web/api；
// 本地 `npm run test:e2e` 默认打 http://localhost:${WEB_PORT:-5173}，
// 并自动执行 `npm run dev` 起站。
const webPort = process.env.WEB_PORT ?? "5173";
const baseURL = process.env.WEB_BASE_URL ?? `http://localhost:${webPort}`;
const managed = !process.env.WEB_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "list" : [["list"]],
  use: {
    baseURL,
    actionTimeout: 7_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Compose 容器内以 root 运行 Chromium 需要 --no-sandbox
        launchOptions: { args: ["--no-sandbox", "--disable-dev-shm-usage"] },
      },
    },
  ],
  webServer: managed
    ? {
        command: "npm run dev -- --port " + webPort,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      }
    : undefined,
});
