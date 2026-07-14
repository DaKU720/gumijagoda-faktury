import { expect, test } from "@playwright/test";
import { createTestInvoice } from "./invoice-factory";

/**
 * Ścieżka krytyczna z kryteriów akceptacji zadania:
 *
 *   wgranie / pobranie faktury → bufor → akceptacja → rejestr → podgląd
 *
 * Dokładnie ta, którą zadanie każe przejść na wdrożonej wersji. Testy klikają to, co kliknąłby
 * człowiek, i nie zakładają pustej bazy — dlatego przechodzą też przeciwko produkcji
 * (E2E_BASE_URL=https://… npx playwright test).
 */

// Jedna faktura na cały plik testowy: kolejne testy sprawdzają, co się z NIĄ dzieje
// (wgranie → akceptacja → duplikat), więc muszą mówić o tym samym dokumencie.
const invoice = createTestInvoice();

test.describe.configure({ mode: "serial" });

test("wgranie XML: dane wczytują się automatycznie, dokument ląduje w buforze", async ({ page }) => {
  await page.goto("/bufor");

  await page.getByRole("button", { name: "Wgraj plik" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles(invoice.filePath);

  // Sedno wymagania „dla XML dane wczytują się automatycznie”: użytkownik nie przepisuje
  // niczego — widzi, co system wyczytał z pliku, jeszcze przed zapisem.
  await expect(dialog.getByText("Odczytano z pliku")).toBeVisible();
  await expect(dialog.getByText(invoice.number)).toBeVisible();
  await expect(dialog.getByText(/Kartoniaki/)).toBeVisible();
  await expect(dialog.getByText(/1[\s\u00a0]*230,00 PLN/)).toBeVisible();

  await dialog.getByRole("button", { name: "Wgraj do bufora" }).click();

  await expect(page.getByText(/trafił do bufora/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("row").filter({ hasText: invoice.number })).toBeVisible();
});

test("podgląd z bufora pokazuje dane z XML, nie surowy plik", async ({ page }) => {
  await page.goto("/bufor");

  await page.getByRole("button", { name: `Podgląd dokumentu ${invoice.number}` }).click();

  const preview = page.getByRole("dialog");

  // Wymóg: „czytelna, przyjazna prezentacja danych faktury (strony transakcji, pozycje,
  // kwoty netto/VAT/brutto) — nie surowy XML”.
  await expect(preview.getByText(invoice.lineName)).toBeVisible();
  await expect(preview.getByText("FA(2)")).toBeVisible();
  await expect(preview.getByText("Kartoniaki Sp. z o.o.").first()).toBeVisible();
  await expect(preview.getByText(/1[\s\u00a0]*230,00 PLN/).first()).toBeVisible();

  // Reguła kontrahent → kategoria zadziałała bez udziału użytkownika (Kartoniaki → Opakowania).
  await expect(preview.getByText("Opakowania")).toBeVisible();
});

test("akceptacja przenosi dokument z bufora do rejestru", async ({ page }) => {
  await page.goto("/bufor");

  await page.getByRole("button", { name: `Akceptuj dokument ${invoice.number}` }).click();
  await expect(page.getByText(/przeniesiony do rejestru/i)).toBeVisible({ timeout: 15_000 });

  // Znika z bufora…
  await expect(page.getByRole("row").filter({ hasText: invoice.number })).toHaveCount(0);

  // …i jest w rejestrze.
  await page.goto(`/dokumenty?szukaj=${encodeURIComponent(invoice.number)}`);
  await expect(page.getByRole("row").filter({ hasText: invoice.number })).toHaveCount(1);
});

test("ta sama faktura nie zostaje wgrana dwa razy", async ({ page }) => {
  // Wymóg: „ta sama faktura nie może zostać pobrana / wgrana / przeniesiona dwukrotnie”.
  await page.goto("/bufor");

  await page.getByRole("button", { name: "Wgraj plik" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles(invoice.filePath);
  await dialog.getByRole("button", { name: "Wgraj do bufora" }).click();

  await expect(page.getByText(/Pominięto duplikat/i)).toBeVisible({ timeout: 15_000 });

  // Rejestr nadal ma dokładnie JEDEN taki dokument — duplikat nie powstał.
  await page.goto(`/dokumenty?szukaj=${encodeURIComponent(invoice.number)}`);
  await expect(page.getByRole("row").filter({ hasText: invoice.number })).toHaveCount(1);
});

test("podgląd jest dostępny także z rejestru", async ({ page }) => {
  // Wymóg: „podgląd dostępny z poziomu listy dokumentów (rejestru) oraz bufora”.
  await page.goto(`/dokumenty?szukaj=${encodeURIComponent(invoice.number)}`);

  await page.getByRole("row").filter({ hasText: invoice.number }).click();

  const preview = page.getByRole("dialog");
  await expect(preview.getByText(invoice.lineName)).toBeVisible();
});

test("pobranie z KSeF zasila bufor i nie tworzy duplikatów przy powtórzeniu", async ({ page }) => {
  await page.goto("/bufor");

  await page.getByRole("button", { name: "Pobierz z KSeF" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Data od").fill("2026-07-01");
  await dialog.getByLabel("Data do").fill("2026-07-31");
  await dialog.getByRole("button", { name: /Pobierz do bufora/ }).click();

  // Pierwsze pobranie może zaimportować faktury albo pominąć je jako duplikaty (jeśli baza
  // już je zna) — oba wyniki są poprawne. Istotne jest, że pobranie KOŃCZY SIĘ SUKCESEM
  // i raportuje, co się stało.
  await expect(page.getByText(/znaleziono \d+/i)).toBeVisible({ timeout: 20_000 });

  // Powtórzenie tego samego zakresu MUSI pominąć duplikaty — to jest istota wymagania.
  await page.getByRole("button", { name: "Pobierz z KSeF" }).click();
  const again = page.getByRole("dialog");
  await again.getByLabel("Data od").fill("2026-07-01");
  await again.getByLabel("Data do").fill("2026-07-31");
  await again.getByRole("button", { name: /Pobierz do bufora/ }).click();

  await expect(page.getByText(/pominięto \d+ duplikat/i)).toBeVisible({ timeout: 20_000 });
});
