import { contractorSchema, documentSchema, ksefFetchSchema, scheduleSchema } from "@/server/validation/schemas";

/**
 * Schematy walidacji — granica między światem zewnętrznym a domeną.
 *
 * Te same schematy obsługują formularz w przeglądarce, upload pliku i import z KSeF,
 * więc każdy błąd tutaj przecieka do wszystkich trzech ścieżek naraz.
 */

const validDocument = {
  number: "FV/2026/07/001",
  typeId: "type-1",
  contractorId: "contractor-1",
  categoryId: "",
  issueDate: "2026-07-01",
  dueDate: "2026-07-15",
  netAmount: "1000",
  vatAmount: "230",
  grossAmount: "1230",
  currency: "PLN",
  paymentAccount: "",
  notes: "",
};

describe("dokument", () => {
  it("przyjmuje poprawny dokument", () => {
    const parsed = documentSchema.parse(validDocument);

    expect(parsed.number).toBe("FV/2026/07/001");
    expect(parsed.netAmount).toBe(1000);
    expect(parsed.issueDate).toBeInstanceOf(Date);
    expect(parsed.categoryId).toBeNull();
  });

  it("odrzuca dokument, w którym netto + VAT ≠ brutto", () => {
    // Najczęstszy błąd przy ręcznym przepisywaniu faktury. Bez tej reguły w ewidencji
    // wylądowałyby kwoty, które się nie sumują — i wyszłoby to dopiero przy rozliczeniu.
    expect(() => documentSchema.parse({ ...validDocument, grossAmount: "1500" })).toThrow(/brutto/i);
  });

  it("dopuszcza groszowe różnice zaokrągleń", () => {
    // 999.99 + 230.00 = 1229.99; tolerancja pół grosza przepuszcza zaokrąglenia,
    // ale nie przepuści pomyłki o złotówkę.
    const parsed = documentSchema.parse({
      ...validDocument,
      netAmount: "999,99",
      vatAmount: "230",
      grossAmount: "1229,99",
    });
    expect(parsed.grossAmount).toBeCloseTo(1229.99, 2);
  });

  it("przyjmuje przecinek jako separator dziesiętny", () => {
    // Polski użytkownik pisze "1 230,50", nie "1230.50".
    const parsed = documentSchema.parse({
      ...validDocument,
      netAmount: "1 000,00",
      vatAmount: "230,00",
      grossAmount: "1 230,00",
    });
    expect(parsed.netAmount).toBe(1000);
    expect(parsed.grossAmount).toBe(1230);
  });

  it("odrzuca termin płatności wcześniejszy niż data wystawienia", () => {
    expect(() => documentSchema.parse({ ...validDocument, dueDate: "2026-06-01" })).toThrow(/termin/i);
  });

  it("odrzuca niepoprawny numer rachunku", () => {
    expect(() =>
      documentSchema.parse({ ...validDocument, paymentAccount: "61109010140000071219812875" }),
    ).toThrow(/rachunk/i);
  });

  it("wymaga numeru dokumentu", () => {
    expect(() => documentSchema.parse({ ...validDocument, number: "  " })).toThrow(/wymagany/i);
  });
});

describe("kontrahent", () => {
  it("normalizuje NIP przy zapisie", () => {
    // Kluczowe dla deduplikacji: "525-224-84-81" i "5252248481" muszą być tym samym kontrahentem.
    const parsed = contractorSchema.parse({
      name: "Kartoniaki Sp. z o.o.",
      nip: "525-224-84-81",
      address: "",
      bankAccount: "",
      defaultCategoryId: "",
    });

    expect(parsed.nip).toBe("5252248481");
    expect(parsed.address).toBeNull();
    expect(parsed.bankAccount).toBeNull();
  });

  it("odrzuca NIP z błędną sumą kontrolną", () => {
    expect(() =>
      contractorSchema.parse({ name: "X", nip: "1234567890", address: "", bankAccount: "", defaultCategoryId: "" }),
    ).toThrow(/NIP/i);
  });
});

describe("pobieranie z KSeF", () => {
  it("odrzuca odwrócony zakres dat", () => {
    expect(() => ksefFetchSchema.parse({ dateFrom: "2026-07-31", dateTo: "2026-07-01", kind: "PURCHASE" })).toThrow(
      /wcześniejsza/i,
    );
  });

  it("odrzuca nieznany rodzaj faktur", () => {
    expect(() => ksefFetchSchema.parse({ dateFrom: "2026-07-01", dateTo: "2026-07-31", kind: "WSZYSTKIE" })).toThrow();
  });
});

describe("harmonogram", () => {
  it("przyjmuje wiele godzin w ciągu doby", () => {
    const parsed = scheduleSchema.parse({
      enabled: true,
      hours: [1, 2, 3],
      kinds: ["PURCHASE", "SALES"],
      lookbackDays: 7,
    });

    expect(parsed.hours).toEqual([1, 2, 3]);
  });

  it("odrzuca godzinę spoza doby", () => {
    expect(() =>
      scheduleSchema.parse({ enabled: true, hours: [24], kinds: ["PURCHASE"], lookbackDays: 7 }),
    ).toThrow(/0–23/);
  });

  it("wymaga wybrania rodzaju faktur", () => {
    expect(() => scheduleSchema.parse({ enabled: true, hours: [1], kinds: [], lookbackDays: 7 })).toThrow(
      /przynajmniej jeden/i,
    );
  });
});
