import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  /**
   * Testy NIE czyszczą bazy — każdy przebieg generuje własną fakturę z unikalnym numerem
   * (patrz tests/e2e/invoice-factory.ts). Dwa powody:
   *
   *  1. Kasowanie bazy przed testami byłoby nieodwracalne i bezużyteczne na wdrożonej
   *     aplikacji — a zadanie wymaga przejścia pełnej ścieżki właśnie na wdrożeniu.
   *  2. Test, który wymaga pustej bazy, milcząco zakłada, że system startuje od zera.
   *     Prawdziwa ewidencja nigdy nie jest pusta.
   *
   * Dzięki temu te same testy przechodzą lokalnie i na produkcji: E2E_BASE_URL=https://… npx playwright test
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
