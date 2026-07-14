/**
 * Reguły automatycznej kategoryzacji.
 *
 * Czysta funkcja — bez bazy, bez I/O. Dzięki temu ta sama reguła obowiązuje wszędzie:
 * przy imporcie z KSeF, przy uploadzie pliku i przy ręcznym dodaniu dokumentu.
 * Gdyby żyła w serwisie importu, ręczne dodanie dokumentu jej nie użyłoby — i wymaganie
 * „przy pobraniu LUB dodaniu dokumentu kategoria jest przypisywana automatycznie”
 * byłoby spełnione tylko w połowie.
 */
export function resolveCategoryId(input: {
  /** Kategoria wskazana wprost przez użytkownika (formularz). */
  explicitCategoryId?: string | null;
  /** Kategoria domyślna kontrahenta — reguła „kontrahent → kategoria”. */
  contractorDefaultCategoryId?: string | null;
}): string | null {
  // Wybór użytkownika zawsze wygrywa z regułą. Reguła ma podpowiadać, nie nadpisywać
  // świadomej decyzji — inaczej użytkownik nie mógłby zrobić wyjątku od własnej reguły.
  if (input.explicitCategoryId) return input.explicitCategoryId;

  return input.contractorDefaultCategoryId ?? null;
}
