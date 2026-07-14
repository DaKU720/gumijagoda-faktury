import { resolveCategoryId } from "@/server/domain/categorization";

/**
 * Reguła auto-kategoryzacji „kontrahent → kategoria”.
 *
 * Wygląda trywialnie i taka ma być — ale to od niej zależy, czy faktura pobrana o 3:00 w nocy
 * trafi do właściwej kategorii bez udziału człowieka. Testujemy ją osobno, bo jest używana
 * w trzech miejscach (import z KSeF, upload, ręczne dodanie) i musi zachowywać się identycznie
 * w każdym z nich.
 */
describe("resolveCategoryId", () => {
  it("stosuje kategorię domyślną kontrahenta, gdy użytkownik nie wskazał własnej", () => {
    const category = resolveCategoryId({ contractorDefaultCategoryId: "cat-opakowania" });
    expect(category).toBe("cat-opakowania");
  });

  it("wybór użytkownika wygrywa z regułą kontrahenta", () => {
    // Reguła ma podpowiadać, nie nadpisywać świadomej decyzji — inaczej nie dałoby się
    // zrobić wyjątku od własnej reguły (np. jednorazowy zakup poza standardową kategorią).
    const category = resolveCategoryId({
      explicitCategoryId: "cat-inna",
      contractorDefaultCategoryId: "cat-opakowania",
    });
    expect(category).toBe("cat-inna");
  });

  it("zwraca brak kategorii, gdy kontrahent nie ma reguły", () => {
    expect(resolveCategoryId({ contractorDefaultCategoryId: null })).toBeNull();
    expect(resolveCategoryId({})).toBeNull();
  });

  it("traktuje pusty string jak brak wyboru", () => {
    // Formularze HTML wysyłają "" dla nieustawionego pola. Bez tego pusty select
    // zablokowałby regułę kontrahenta.
    const category = resolveCategoryId({
      explicitCategoryId: "",
      contractorDefaultCategoryId: "cat-opakowania",
    });
    expect(category).toBe("cat-opakowania");
  });
});
