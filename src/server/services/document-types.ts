import "server-only";
import { prisma } from "@/server/db";
import { DomainError, DuplicateError, isUniqueViolation } from "@/server/services/errors";
import { documentTypeSchema } from "@/server/validation/schemas";

export async function getDocumentTypes() {
  return prisma.documentType.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { _count: { select: { documents: true } } },
  });
}

export async function createDocumentType(input: unknown) {
  const data = documentTypeSchema.parse(input);

  try {
    // Typy tworzone przez użytkownika nigdy nie są systemowe — flaga `isSystem` jest
    // zarezerwowana dla dwóch typów z seeda, których import z KSeF potrzebuje do działania.
    return await prisma.documentType.create({ data: { ...data, isSystem: false } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateError("Typ dokumentu o tej nazwie już istnieje", "name");
    }
    throw error;
  }
}

export async function updateDocumentType(id: string, input: unknown) {
  const data = documentTypeSchema.parse(input);
  const type = await prisma.documentType.findUnique({ where: { id } });

  if (!type) throw new DomainError("Nie znaleziono typu dokumentu");

  // Typ systemowy można przemianować, ale nie wolno odwrócić jego kierunku:
  // "faktura kosztowa" musi pozostać zobowiązaniem, bo na tym opiera się import z KSeF.
  if (type.isSystem && type.direction !== data.direction) {
    throw new DomainError("Nie można zmienić kierunku typu systemowego", "direction");
  }

  try {
    return await prisma.documentType.update({ where: { id }, data });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateError("Typ dokumentu o tej nazwie już istnieje", "name");
    }
    throw error;
  }
}

export async function deleteDocumentType(id: string) {
  const type = await prisma.documentType.findUnique({
    where: { id },
    include: { _count: { select: { documents: true } } },
  });

  if (!type) throw new DomainError("Nie znaleziono typu dokumentu");
  if (type.isSystem) throw new DomainError("Typ systemowy jest wymagany przez import z KSeF i nie może zostać usunięty");
  if (type._count.documents > 0) {
    throw new DomainError(`Typ jest używany przez ${type._count.documents} dokument(ów) — nie można go usunąć`);
  }

  await prisma.documentType.delete({ where: { id } });
}

/**
 * Typ systemowy dla danego kierunku — punkt zaczepienia dla importu z KSeF,
 * który wie tylko, czy faktura jest kosztowa czy sprzedażowa, a musi wskazać konkretny typ.
 */
export async function getSystemDocumentType(direction: "RECEIVABLE" | "PAYABLE") {
  const type = await prisma.documentType.findFirst({
    where: { isSystem: true, direction },
    orderBy: { createdAt: "asc" },
  });

  if (!type) {
    throw new DomainError(
      `Brak systemowego typu dokumentu dla kierunku ${direction}. Uruchom seed bazy (npm run db:seed).`,
    );
  }

  return type;
}
