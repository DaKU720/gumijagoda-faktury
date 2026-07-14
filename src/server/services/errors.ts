import "server-only";

/**
 * Błąd domenowy: sytuacja przewidziana przez reguły biznesowe, którą trzeba pokazać
 * użytkownikowi po ludzku ("Faktura o tym numerze już istnieje"), a nie zrzutem stosu.
 *
 * Rozróżnienie jest istotne: `DomainError` to nie awaria, tylko odpowiedź systemu.
 * Wszystko inne, co wyleci z serwisu, jest prawdziwym błędem i ma prawo skończyć
 * jako 500 — bo znaczy, że czegoś nie przewidzieliśmy.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    /** Pole formularza, którego dotyczy błąd — UI podświetla je zamiast pokazywać ogólny komunikat. */
    readonly field?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Naruszenie unikalności w bazie (Prisma P2002) — duplikat, którego nie wolno utworzyć. */
export class DuplicateError extends DomainError {
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = "DuplicateError";
  }
}

type PrismaKnownError = { code?: string; meta?: { target?: string[] | string } };

/** Czy błąd to naruszenie unikalnego indeksu. */
export function isUniqueViolation(error: unknown): error is PrismaKnownError {
  return typeof error === "object" && error !== null && (error as PrismaKnownError).code === "P2002";
}

/** Które pole (indeks) zostało naruszone — Prisma podaje to w `meta.target`. */
export function violatedFields(error: unknown): string[] {
  if (!isUniqueViolation(error)) return [];
  const target = error.meta?.target;
  if (Array.isArray(target)) return target;
  if (typeof target === "string") return [target];
  return [];
}
