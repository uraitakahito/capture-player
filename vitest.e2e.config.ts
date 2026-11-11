import { defineConfig } from "vitest/config";

// build したビューア（public/）を headless の Chrome で開く試験。`pnpm run build:viewer` の後に流す。
// Chrome は CHROME_PATH か、~/.cache/puppeteer の Chrome for Testing 156。
export default defineConfig({
  test: {
    include: ["test-e2e/**/*.test.ts"],
    environment: "node",
    testTimeout: 90_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
