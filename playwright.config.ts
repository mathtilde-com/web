import { defineConfig } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "e2e",
  webServer: { command: `npx next dev -p ${port}`, url: `http://localhost:${port}`, reuseExistingServer: false, timeout: 120_000 },
  use: { baseURL: `http://localhost:${port}` },
});
