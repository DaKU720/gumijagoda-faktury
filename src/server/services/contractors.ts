import "server-only";
import { prisma } from "@/server/db";
import { DomainError, DuplicateError, isUniqueViolation } from "@/server/services/errors";
import { contractorSchema } from "@/server/validation/schemas";

export async function getContractors() {
  return prisma.contractor.findMany({
    orderBy: { name: "asc" },
    include: {
      defaultCategory: { select: { id: true, name: true } },
      _count: { select: { documents: true } },
    },
  });
}

export async function createContractor(input: unknown) {
  const data = contractorSchema.parse(input);

  try {
    return await prisma.contractor.create({ data });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateError("Kontrahent o tym NIP-ie już istnieje", "nip");
    }
    throw error;
  }
}

export async function updateContractor(id: string, input: unknown) {
  const data = contractorSchema.parse(input);

  try {
    return await prisma.contractor.update({ where: { id }, data });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateError("Kontrahent o tym NIP-ie już istnieje", "nip");
    }
    throw error;
  }
}

export async function deleteContractor(id: string) {
  const documents = await prisma.document.count({ where: { contractorId: id } });
  if (documents > 0) {
    throw new DomainError(`Kontrahent ma ${documents} dokument(ów) w systemie — nie można go usunąć`);
  }

  await prisma.contractor.delete({ where: { id } });
}

/**
 * Znajduje kontrahenta po NIP-ie albo zakłada nowego.
 *
 * Serce importu: faktura z KSeF (albo z pliku XML) przynosi dane sprzedawcy, ale nie wie,
 * czy mamy go już w bazie. NIP jest kluczem naturalnym, więc `upsert` po NIP-ie jest
 * idempotentny — dziesięć faktur od tej samej firmy da jednego kontrahenta, nie dziesięciu.
 *
 * Świadomie NIE nadpisujemy nazwy ani adresu istniejącego kontrahenta danymi z faktury:
 * użytkownik mógł poprawić literówkę w nazwie, a import nie powinien mu tego cofać.
 * Uzupełniamy tylko puste pola.
 */
export async function findOrCreateContractorByNip(input: {
  nip: string;
  name: string;
  address?: string | null;
  bankAccount?: string | null;
}) {
  const data = contractorSchema.parse({
    name: input.name,
    nip: input.nip,
    address: input.address ?? "",
    bankAccount: input.bankAccount ?? "",
    defaultCategoryId: "",
  });

  const existing = await prisma.contractor.findUnique({ where: { nip: data.nip } });

  if (!existing) {
    return prisma.contractor.create({ data });
  }

  const fillMissing: { address?: string; bankAccount?: string } = {};
  if (!existing.address && data.address) fillMissing.address = data.address;
  if (!existing.bankAccount && data.bankAccount) fillMissing.bankAccount = data.bankAccount;

  if (Object.keys(fillMissing).length === 0) return existing;

  return prisma.contractor.update({ where: { id: existing.id }, data: fillMissing });
}
