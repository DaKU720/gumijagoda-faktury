import {
  formatBankAccount,
  isValidBankAccount,
  isValidNip,
  normalizeBankAccount,
  normalizeNip,
} from "@/server/domain/identifiers";

/**
 * Walidacja NIP i numeru rachunku.
 *
 * To jest ta warstwa, w której literówka z papierowej faktury musi zostać złapana.
 * Sam format (10 cyfr) przepuściłby przekręcone cyfry — dlatego liczymy sumy kontrolne.
 */

describe("NIP", () => {
  it("przyjmuje poprawne NIP-y", () => {
    // Sumy kontrolne policzone algorytmem mod 11 z wagami [6,5,7,2,3,4,5,6,7].
    expect(isValidNip("5252248481")).toBe(true);
    expect(isValidNip("6771102954")).toBe(true);
    expect(isValidNip("1132456789")).toBe(true);
  });

  it("odrzuca NIP z błędną sumą kontrolną", () => {
    // Ten sam numer z ostatnią cyfrą zmienioną o jeden — format bez zarzutu, treść bezsensowna.
    expect(isValidNip("5252248482")).toBe(false);
    expect(isValidNip("1234567890")).toBe(false);
  });

  it("odrzuca NIP-y o złej długości i ze znakami innymi niż cyfry", () => {
    expect(isValidNip("525224848")).toBe(false);
    expect(isValidNip("52522484812")).toBe(false);
    expect(isValidNip("525224848X")).toBe(false);
    expect(isValidNip("")).toBe(false);
  });

  it("normalizuje zapis, jakim posługuje się człowiek", () => {
    // Użytkownik przepisuje z faktury: myślniki, spacje, czasem prefiks PL.
    expect(normalizeNip("525-224-84-81")).toBe("5252248481");
    expect(normalizeNip("PL 525 224 84 81")).toBe("5252248481");
    expect(isValidNip("525-224-84-81")).toBe(true);
    expect(isValidNip("PL5252248481")).toBe(true);
  });
});

describe("numer rachunku (NRB/IBAN)", () => {
  it("przyjmuje poprawny polski NRB — z prefiksem i bez", () => {
    expect(isValidBankAccount("61109010140000071219812874")).toBe(true);
    expect(isValidBankAccount("PL61109010140000071219812874")).toBe(true);
    expect(isValidBankAccount("61 1090 1014 0000 0712 1981 2874")).toBe(true);
  });

  it("odrzuca rachunek z błędną sumą kontrolną mod-97", () => {
    // Dwie pierwsze cyfry to suma kontrolna — podmieniona, więc mod-97 nie da 1.
    expect(isValidBankAccount("62109010140000071219812874")).toBe(false);
    // Przekręcone dwie cyfry w środku numeru: klasyczna literówka przy przepisywaniu.
    expect(isValidBankAccount("61109010140000071219812847")).toBe(false);
  });

  it("odrzuca numery o niepoprawnej długości i formacie", () => {
    expect(isValidBankAccount("123")).toBe(false);
    expect(isValidBankAccount("")).toBe(false);
    expect(isValidBankAccount("PL61ABC010140000071219812874X")).toBe(false);
  });

  it("normalizuje zapis z pliku i z klawiatury", () => {
    expect(normalizeBankAccount("61 1090-1014 0000 0712 1981 2874")).toBe("61109010140000071219812874");
  });

  it("formatuje NRB do postaci czytanej z papieru", () => {
    expect(formatBankAccount("61109010140000071219812874")).toBe("61 1090 1014 0000 0712 1981 2874");
  });

  it("zostawia zagraniczny IBAN bez cięcia go polską konwencją", () => {
    // Niemiecki IBAN ma inną strukturę — lepiej pokazać surowy numer niż pociąć go na grupy,
    // które nic nie znaczą.
    const german = "DE89370400440532013000";
    expect(formatBankAccount(german)).toBe(german);
  });
});
