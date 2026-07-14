import { z } from "zod";
import { isValidBankAccount, isValidNip, normalizeBankAccount, normalizeNip } from "@/server/domain/identifiers";

/**
 * Schematy walidacji — jedyne źródło prawdy o tym, co jest poprawnym wejściem.
 *
 * Te same schematy obsługują trzy różne drogi wejścia danych do systemu:
 * formularz w UI, import z KSeF i upload pliku XML. Dane z KSeF też są wejściem
 * z zewnątrz — fakt, że przyszły z serwera Ministerstwa, nie czyni ich zaufanymi.
 *
 * Normalizacja (usunięcie spacji z NIP-u, wielkie litery w IBAN) dzieje się TUTAJ,
 * przed zapisem — dzięki temu w bazie leży jedna kanoniczna postać i deduplikacja
 * po NIP-ie faktycznie działa (inaczej "525-224-84-81" i "5252248481" byłyby
 * dwoma różnymi kontrahentami).
 */

const requiredString = (field: string) => z.string().trim().min(1, `${field} jest wymagany`);

export const nipSchema = z
  .string()
  .trim()
  .transform(normalizeNip)
  .refine(isValidNip, "Niepoprawny NIP (błędna suma kontrolna)");

export const bankAccountSchema = z
  .string()
  .trim()
  .transform(normalizeBankAccount)
  .refine(isValidBankAccount, "Niepoprawny numer rachunku (błędna suma kontrolna)");

/** Pole opcjonalne: puste stringi z formularzy HTML traktujemy jak brak wartości. */
const optionalBankAccount = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : normalizeBankAccount(value)))
  .refine((value) => value === null || isValidBankAccount(value), "Niepoprawny numer rachunku (błędna suma kontrolna)")
  .nullable();

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable();

/** Kwota pieniężna. Przyjmujemy przecinek jako separator dziesiętny — tak pisze polski użytkownik. */
export const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "number" ? value : Number(value.replace(/\s/g, "").replace(",", "."))))
  .refine((value) => Number.isFinite(value), "Kwota musi być liczbą")
  .refine((value) => value >= 0, "Kwota nie może być ujemna")
  .refine((value) => Math.round(value * 100) === Number((value * 100).toFixed(0)), "Maksymalnie dwa miejsca po przecinku");

/** Data z inputu typu `date` (YYYY-MM-DD). */
export const dateSchema = z
  .string()
  .trim()
  .min(1, "Data jest wymagana")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Niepoprawna data")
  .transform((value) => new Date(value));

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine((value) => value === null || !Number.isNaN(Date.parse(value)), "Niepoprawna data")
  .transform((value) => (value === null ? null : new Date(value)))
  .nullable();

// --- Kontrahent --------------------------------------------------------------

export const contractorSchema = z.object({
  name: requiredString("Nazwa"),
  nip: nipSchema,
  address: optionalText,
  bankAccount: optionalBankAccount,
  /** Reguła auto-kategoryzacji: dokumenty tego kontrahenta trafiają domyślnie do tej kategorii. */
  defaultCategoryId: optionalText,
});

export type ContractorInput = z.input<typeof contractorSchema>;
export type ContractorData = z.output<typeof contractorSchema>;

// --- Typ dokumentu -----------------------------------------------------------

export const documentTypeSchema = z.object({
  name: requiredString("Nazwa"),
  direction: z.enum(["RECEIVABLE", "PAYABLE"], { message: "Wybierz kierunek dokumentu" }),
});

export type DocumentTypeInput = z.input<typeof documentTypeSchema>;

// --- Kategoria ---------------------------------------------------------------

export const categorySchema = z.object({
  name: requiredString("Nazwa"),
  parentId: optionalText,
});

export type CategoryInput = z.input<typeof categorySchema>;

// --- Dokument ----------------------------------------------------------------

export const documentSchema = z
  .object({
    number: requiredString("Numer dokumentu"),
    typeId: requiredString("Typ dokumentu"),
    contractorId: requiredString("Kontrahent"),
    categoryId: optionalText,
    issueDate: dateSchema,
    dueDate: optionalDate,
    netAmount: moneySchema,
    vatAmount: moneySchema,
    grossAmount: moneySchema,
    currency: z.string().trim().length(3, "Waluta to kod 3-literowy (np. PLN)").default("PLN"),
    paymentAccount: optionalBankAccount,
    notes: optionalText,
  })
  .refine((doc) => Math.abs(doc.netAmount + doc.vatAmount - doc.grossAmount) < 0.005, {
    message: "Kwota brutto musi być sumą netto i VAT",
    path: ["grossAmount"],
  })
  .refine((doc) => doc.dueDate === null || doc.dueDate >= doc.issueDate, {
    message: "Termin płatności nie może być wcześniejszy niż data wystawienia",
    path: ["dueDate"],
  });

export type DocumentInput = z.input<typeof documentSchema>;
export type DocumentData = z.output<typeof documentSchema>;

// --- Pobieranie z KSeF -------------------------------------------------------

export const ksefFetchSchema = z
  .object({
    dateFrom: dateSchema,
    dateTo: dateSchema,
    kind: z.enum(["PURCHASE", "SALES"], { message: "Wybierz rodzaj faktur" }),
  })
  .refine((range) => range.dateTo >= range.dateFrom, {
    message: "Data „do” nie może być wcześniejsza niż „od”",
    path: ["dateTo"],
  });

// --- Harmonogram -------------------------------------------------------------

export const scheduleSchema = z.object({
  enabled: z.boolean(),
  /** Godziny (0–23), o których ma się odpalić pobieranie. Wiele wpisów = wiele uruchomień na dobę. */
  hours: z.array(z.number().int().min(0, "Godzina 0–23").max(23, "Godzina 0–23")).max(24),
  kinds: z.array(z.enum(["PURCHASE", "SALES"])).min(1, "Wybierz przynajmniej jeden rodzaj faktur"),
  lookbackDays: z.number().int().min(1, "Minimum 1 dzień").max(90, "Maksimum 90 dni"),
});

export type ScheduleInput = z.input<typeof scheduleSchema>;
