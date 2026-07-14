/**
 * Walidacja identyfikatorów: NIP i numer rachunku (NRB/IBAN).
 *
 * Czysta domena: żadnej bazy, żadnego Reacta, żadnego I/O. Dzięki temu testuje się
 * to zwykłym Jestem i używa zarówno w formularzach (przez Zod), jak i w imporcie
 * z KSeF, gdzie dane przychodzą z zewnątrz i też trzeba je sprawdzić.
 *
 * Wymóg z zadania (sekcja 6): "walidacja NIP, numer rachunku (format NRB/IBAN,
 * mile widziana kontrola sumy kontrolnej)". Robimy sumy kontrolne — sam format
 * przepuściłby literówkę w cyfrze, a to najczęstszy błąd przy przepisywaniu z papieru.
 */

/** Usuwa spacje, myślniki i prefiks "PL" — użytkownicy wklejają NIP na wiele sposobów. */
export function normalizeNip(input: string): string {
  return input.replace(/[\s-]/g, "").replace(/^PL/i, "");
}

/**
 * NIP: 10 cyfr, ostatnia jest cyfrą kontrolną.
 * Suma ważona wagami [6,5,7,2,3,4,5,6,7] modulo 11 musi dać ostatnią cyfrę.
 * Reszta 10 jest niemożliwa dla poprawnego NIP-u (dlatego odrzucamy).
 */
export function isValidNip(input: string): boolean {
  const nip = normalizeNip(input);
  if (!/^\d{10}$/.test(nip)) return false;

  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, weight, i) => acc + weight * Number(nip[i]), 0);
  const checksum = sum % 11;

  if (checksum === 10) return false;
  return checksum === Number(nip[9]);
}

/** Usuwa spacje i myślniki z numeru rachunku. */
export function normalizeBankAccount(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Rachunek bankowy w standardzie IBAN (polski NRB to IBAN bez prefiksu "PL").
 *
 * Algorytm mod-97 (ISO 13616): przenieś 4 pierwsze znaki na koniec, zamień litery
 * na liczby (A=10 ... Z=35), potraktuj jako wielką liczbę — reszta z dzielenia
 * przez 97 musi wynosić 1.
 *
 * Akceptujemy zarówno "PL61109010140000071219812874", jak i sam NRB
 * (26 cyfr) — ten drugi domyślnie traktujemy jako polski, bo taki wpisze użytkownik
 * przepisujący fakturę krajową.
 */
export function isValidBankAccount(input: string): boolean {
  let account = normalizeBankAccount(input);

  // Goły NRB (26 cyfr) => dopisujemy polski prefiks, żeby zadziałał mod-97.
  if (/^\d{26}$/.test(account)) {
    account = `PL${account}`;
  }

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(account)) return false;

  const rearranged = account.slice(4) + account.slice(0, 4);
  const digits = rearranged
    .split("")
    .map((char) => (/[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char))
    .join("");

  // Liczba ma do ~38 cyfr — nie zmieści się w Number bez utraty precyzji,
  // więc liczymy resztę fragmentami (klasyczny trick dla mod-97).
  let remainder = 0;
  for (const digit of digits) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }

  return remainder === 1;
}

/**
 * Formatuje polski NRB do postaci czytanej z papieru: "61 1090 1014 0000 0712 1981 2874"
 * (2 cyfry kontrolne + 6 grup po 4). Numery w innym formacie zwracamy bez zmian —
 * lepiej pokazać surowy numer niż pociąć zagraniczny IBAN wg polskiej konwencji.
 */
export function formatBankAccount(input: string): string {
  const account = normalizeBankAccount(input).replace(/^PL/, "");
  if (!/^\d{26}$/.test(account)) return account;

  const groups = account.slice(2).match(/.{4}/g) ?? [];
  return [account.slice(0, 2), ...groups].join(" ");
}
