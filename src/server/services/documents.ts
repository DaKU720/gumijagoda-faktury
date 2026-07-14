import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { resolveCategoryId } from "@/server/domain/categorization";
import { getCategorySubtreeIds } from "@/server/services/categories";
import { DomainError, DuplicateError, isUniqueViolation, violatedFields } from "@/server/services/errors";
import { documentSchema } from "@/server/validation/schemas";

export type DocumentFilters = {
  status: "BUFFER" | "ACCEPTED";
  typeId?: string;
  contractorId?: string;
  categoryId?: string;
  issueDateFrom?: string;
  issueDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  search?: string;
};

export type DocumentSort = {
  field: "issueDate" | "dueDate" | "number" | "grossAmount" | "createdAt";
  direction: "asc" | "desc";
};

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Buduje warunek WHERE dla Prismy.
 *
 * Cała selekcja dzieje się w bazie — nigdy nie ściągamy wszystkiego, żeby przefiltrować
 * w JS. Przy kilkudziesięciu tysiącach faktur (a taka jest skala z opisu firmy) różnica
 * to setki milisekund vs. kilkanaście sekund i wyczerpana pamięć.
 *
 * Filtr po kategorii obejmuje CAŁE poddrzewo: wybór "Produkcja" pokazuje też faktury
 * z "Opakowania" i "Surowce" — użytkownik myśli kategoriami, nie liśćmi drzewa.
 */
async function buildWhere(filters: DocumentFilters): Promise<Prisma.DocumentWhereInput> {
  const where: Prisma.DocumentWhereInput = { status: filters.status };

  if (filters.typeId) where.typeId = filters.typeId;
  if (filters.contractorId) where.contractorId = filters.contractorId;

  if (filters.categoryId) {
    const subtree = await getCategorySubtreeIds(filters.categoryId);
    where.categoryId = { in: subtree };
  }

  if (filters.issueDateFrom || filters.issueDateTo) {
    where.issueDate = {
      ...(filters.issueDateFrom ? { gte: new Date(filters.issueDateFrom) } : {}),
      ...(filters.issueDateTo ? { lte: endOfDay(filters.issueDateTo) } : {}),
    };
  }

  if (filters.dueDateFrom || filters.dueDateTo) {
    where.dueDate = {
      ...(filters.dueDateFrom ? { gte: new Date(filters.dueDateFrom) } : {}),
      ...(filters.dueDateTo ? { lte: endOfDay(filters.dueDateTo) } : {}),
    };
  }

  if (filters.search) {
    where.OR = [
      { number: { contains: filters.search, mode: "insensitive" } },
      { contractor: { name: { contains: filters.search, mode: "insensitive" } } },
      { contractor: { nip: { contains: filters.search } } },
      { ksefNumber: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

/**
 * Data "do" z inputu to dzień bez godziny (2026-07-14 = północ). Bez przesunięcia na koniec
 * doby filtr "do 14 lipca" gubiłby wszystkie faktury z 14 lipca — klasyczna pułapka off-by-one,
 * którą użytkownik zgłasza jako "filtr nie działa".
 */
function endOfDay(date: string): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export async function listDocuments(options: {
  filters: DocumentFilters;
  sort: DocumentSort;
  page: number;
  pageSize?: number;
}) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const where = await buildWhere(options.filters);

  // Sortowanie po numerze musi być stabilne, dlatego dokładamy `id` jako ostatni klucz —
  // inaczej dwie faktury z tą samą datą potrafiłyby przeskakiwać między stronami paginacji.
  const orderBy: Prisma.DocumentOrderByWithRelationInput[] = [
    { [options.sort.field]: options.sort.direction },
    { id: "asc" },
  ];

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy,
      skip: (options.page - 1) * pageSize,
      take: pageSize,
      include: {
        type: { select: { id: true, name: true, direction: true } },
        contractor: { select: { id: true, name: true, nip: true } },
        category: { select: { id: true, name: true } },
        files: { select: { id: true, kind: true, filename: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  return {
    documents,
    total,
    page: options.page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getDocumentById(id: string) {
  return prisma.document.findUnique({
    where: { id },
    include: {
      type: true,
      contractor: true,
      category: true,
      files: { select: { id: true, kind: true, filename: true, mimeType: true, sizeBytes: true } },
    },
  });
}

/**
 * Dokument dodany ręcznie trafia OD RAZU do rejestru (status ACCEPTED), z pominięciem bufora.
 *
 * Uzasadnienie (ADR 0002): bufor jest poczekalnią dla dokumentów, których pochodzenia
 * użytkownik jeszcze nie potwierdził — pobranych z KSeF albo wgranych plików. Dokument, który
 * użytkownik właśnie własnoręcznie przepisał, nie wymaga akceptacji samego siebie.
 */
export async function createDocument(input: unknown, options?: { status?: "BUFFER" | "ACCEPTED" }) {
  const data = documentSchema.parse(input);

  const contractor = await prisma.contractor.findUnique({
    where: { id: data.contractorId },
    select: { id: true, defaultCategoryId: true },
  });
  if (!contractor) throw new DomainError("Nie znaleziono kontrahenta", "contractorId");

  const categoryId = resolveCategoryId({
    explicitCategoryId: data.categoryId,
    contractorDefaultCategoryId: contractor.defaultCategoryId,
  });

  try {
    return await prisma.document.create({
      data: {
        number: data.number,
        typeId: data.typeId,
        contractorId: data.contractorId,
        categoryId,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        netAmount: data.netAmount,
        vatAmount: data.vatAmount,
        grossAmount: data.grossAmount,
        currency: data.currency,
        paymentAccount: data.paymentAccount,
        notes: data.notes,
        source: "MANUAL",
        status: options?.status ?? "ACCEPTED",
      },
    });
  } catch (error) {
    throw translateDuplicate(error, data.number);
  }
}

export async function updateDocument(id: string, input: unknown) {
  const data = documentSchema.parse(input);

  try {
    return await prisma.document.update({
      where: { id },
      data: {
        number: data.number,
        typeId: data.typeId,
        contractorId: data.contractorId,
        // Przy edycji NIE stosujemy reguły kontrahenta: użytkownik może celowo wyczyścić
        // kategorię, a reguła natychmiast przywróciłaby ją z powrotem. Reguła działa
        // przy tworzeniu dokumentu, nie przy poprawianiu go.
        categoryId: data.categoryId,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        netAmount: data.netAmount,
        vatAmount: data.vatAmount,
        grossAmount: data.grossAmount,
        currency: data.currency,
        paymentAccount: data.paymentAccount,
        notes: data.notes,
      },
    });
  } catch (error) {
    throw translateDuplicate(error, data.number);
  }
}

export async function deleteDocument(id: string) {
  await prisma.document.delete({ where: { id } });
}

/** Przypisanie kategorii z poziomu listy (szybka akcja, bez otwierania formularza). */
export async function setDocumentCategory(id: string, categoryId: string | null) {
  return prisma.document.update({ where: { id }, data: { categoryId } });
}

/**
 * Zamienia naruszenie unikalnego indeksu na komunikat, który coś znaczy dla człowieka.
 * Baza mówi "P2002 on (number, contractorId)" — użytkownik chce usłyszeć, że ta faktura
 * już u niego jest.
 */
function translateDuplicate(error: unknown, number: string): unknown {
  if (!isUniqueViolation(error)) return error;

  const fields = violatedFields(error);

  if (fields.includes("ksefNumber")) {
    return new DuplicateError("Ta faktura została już pobrana z KSeF", "ksefNumber");
  }
  if (fields.includes("number") || fields.includes("contractorId")) {
    return new DuplicateError(`Dokument „${number}” od tego kontrahenta już istnieje w systemie`, "number");
  }

  return new DuplicateError("Taki dokument już istnieje w systemie");
}
