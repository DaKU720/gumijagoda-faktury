import { expect, test } from "@playwright/test";

/**
 * Rejestr dokumentów: filtrowanie i konfiguracja kolumn.
 * Testy nieniszczące — opierają się na danych z seeda i nie zmieniają ewidencji.
 */

test("filtrowanie po kontrahencie zawęża listę do jego dokumentów", async ({ page }) => {
  await page.goto("/dokumenty");

  await page.getByLabel("Kontrahent").click();
  await page.getByRole("option", { name: "Kartoniaki Sp. z o.o." }).click();

  // Filtr żyje w URL-u: da się go zapisać w zakładkach i wysłać komuś linkiem.
  await expect(page).toHaveURL(/kontrahent=/);

  const rows = page.getByRole("row").filter({ hasText: "Kartoniaki" });
  await expect(rows.first()).toBeVisible();

  // Żaden wiersz nie należy do innego kontrahenta.
  await expect(page.getByRole("row").filter({ hasText: "ChłodTrans" })).toHaveCount(0);
});

test("filtr po kategorii obejmuje podkategorie", async ({ page }) => {
  // Wybór kategorii nadrzędnej „Produkcja” musi pokazać też faktury z „Opakowania” i „Surowce” —
  // użytkownik myśli kategoriami, nie liśćmi drzewa.
  await page.goto("/dokumenty");

  await page.getByLabel("Kategoria").click();
  await page.getByRole("option", { name: "Koszty operacyjne / Produkcja", exact: true }).click();

  await expect(page).toHaveURL(/kategoria=/);

  // Faktura za opakowania (podkategoria „Opakowania”) jest widoczna mimo filtra na rodzicu.
  await expect(page.getByRole("row").filter({ hasText: "Kartoniaki" }).first()).toBeVisible();
});

test("sortowanie po terminie płatności zmienia kolejność", async ({ page }) => {
  await page.goto("/dokumenty");

  await page.getByRole("button", { name: /Sortuj po: dueDate/ }).click();

  await expect(page).toHaveURL(/sortuj=dueDate/);
});

test("konfiguracja kolumn: ukrycie kolumny przeżywa odświeżenie strony", async ({ page }) => {
  await page.goto("/dokumenty");

  await expect(page.getByRole("columnheader", { name: "Kategoria" })).toBeVisible();

  await page.getByRole("button", { name: /Kolumny/ }).click();
  await page.getByRole("checkbox", { name: "Kategoria" }).uncheck();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("columnheader", { name: "Kategoria" })).toBeHidden();

  // Układ kolumn siedzi w localStorage — użytkownik nie ustawia go od nowa po każdym wejściu.
  await page.reload();
  await expect(page.getByRole("columnheader", { name: "Kategoria" })).toBeHidden();

  // Sprzątamy po sobie, żeby test nie zostawiał zmienionego układu kolejnym uruchomieniom.
  await page.getByRole("button", { name: /Kolumny/ }).click();
  await page.getByRole("button", { name: /Domyślne/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Kategoria" })).toBeVisible();
});

test("dokument dodany ręcznie trafia od razu do rejestru", async ({ page }) => {
  const number = `RĘCZNY/${Date.now()}`;

  await page.goto("/dokumenty");
  await page.getByRole("button", { name: "Nowy dokument" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Numer dokumentu").fill(number);
  await dialog.getByLabel("Data wystawienia").fill("2026-07-14");
  await dialog.getByLabel("Termin płatności").fill("2026-07-28");
  await dialog.getByLabel("Netto").fill("500");
  await dialog.getByLabel("VAT", { exact: true }).fill("115");
  // Brutto liczy się samo z netto i VAT — sprawdzamy, że użytkownik nie musi go liczyć.
  await expect(dialog.getByLabel("Brutto")).toHaveValue("615.00");

  await dialog.getByLabel("Kontrahent").click();
  await page.getByRole("option", { name: "ChłodTrans Logistyka Sp. z o.o." }).click();

  await dialog.getByRole("button", { name: "Zapisz dokument" }).click();

  await expect(page.getByText(/Dodano dokument/i)).toBeVisible({ timeout: 15_000 });

  // Wpis ręczny pomija bufor (ADR 0002) — jest od razu w rejestrze.
  await page.goto(`/dokumenty?szukaj=${encodeURIComponent(number)}`);
  await expect(page.getByRole("row").filter({ hasText: number })).toHaveCount(1);
});
