import "server-only";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/services/errors";

/**
 * Bufor — poczekalnia dla dokumentów, które przyszły z zewnątrz (KSeF, upload).
 *
 * Akceptacja to zmiana statusu BUFFER → ACCEPTED, nie przenoszenie danych między tabelami
 * (ADR 0002). Dzięki temu „przeniesienie do rejestru” jest atomowe i nie ma stanu pośredniego,
 * w którym dokument istniałby w dwóch miejscach naraz albo w żadnym.
 */

export async function acceptDocuments(ids: string[]) {
  if (ids.length === 0) throw new DomainError("Nie wybrano żadnych dokumentów");

  // updateMany z warunkiem `status: BUFFER` jest idempotentne: dokument zaakceptowany
  // w innej karcie przeglądarki po prostu nie wejdzie do zbioru, zamiast wywołać błąd.
  const result = await prisma.document.updateMany({
    where: { id: { in: ids }, status: "BUFFER" },
    data: { status: "ACCEPTED" },
  });

  return result.count;
}

export async function rejectDocuments(ids: string[]) {
  if (ids.length === 0) throw new DomainError("Nie wybrano żadnych dokumentów");

  // Odrzucone dokumenty ZOSTAJĄ w bazie ze statusem REJECTED. Gdybyśmy je kasowali,
  // kolejne pobranie z KSeF wciągnęłoby je z powrotem — użytkownik odrzucałby w kółko
  // tę samą fakturę. Rekord (z numerem KSeF) jest pamięcią systemu o świadomej decyzji.
  const result = await prisma.document.updateMany({
    where: { id: { in: ids }, status: "BUFFER" },
    data: { status: "REJECTED" },
  });

  return result.count;
}

export async function getBufferCount() {
  return prisma.document.count({ where: { status: "BUFFER" } });
}
