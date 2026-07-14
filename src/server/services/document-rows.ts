import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Kształt dokumentu przekazywany do komponentów klienckich.
 *
 * Dwie rzeczy, które muszą się tu wydarzyć:
 *  - `Decimal` → `string`. Prisma zwraca Decimal (obiekt), którego React nie potrafi
 *    przesłać przez granicę serwer→klient. Zamiana na string, a nie na `number`, jest celowa:
 *    number gubiłby grosze przy dużych kwotach. Formatowanie do wyświetlenia dzieje się w UI.
 *  - `Date` → ISO string, z tego samego powodu.
 *
 * Poza tym: klient dostaje dokładnie tyle, ile rysuje. Nie wysyłamy w drzewie React
 * zawartości plików ani pól, których nikt nie pokazuje.
 */
export type DocumentRow = {
  id: string;
  number: string;
  status: "BUFFER" | "ACCEPTED" | "REJECTED";
  source: "KSEF" | "UPLOAD" | "MANUAL";
  ksefNumber: string | null;
  typeId: string;
  typeName: string;
  direction: "RECEIVABLE" | "PAYABLE";
  contractorId: string;
  contractorName: string;
  contractorNip: string;
  categoryId: string | null;
  categoryName: string | null;
  issueDate: string;
  dueDate: string | null;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  currency: string;
  paymentAccount: string | null;
  notes: string | null;
  hasPdf: boolean;
  hasXml: boolean;
};

type DocumentWithRelations = Prisma.DocumentGetPayload<{
  include: {
    type: { select: { id: true; name: true; direction: true } };
    contractor: { select: { id: true; name: true; nip: true } };
    category: { select: { id: true; name: true } };
    files: { select: { id: true; kind: true; filename: true } };
  };
}>;

export function toDocumentRow(document: DocumentWithRelations): DocumentRow {
  return {
    id: document.id,
    number: document.number,
    status: document.status,
    source: document.source,
    ksefNumber: document.ksefNumber,
    typeId: document.type.id,
    typeName: document.type.name,
    direction: document.type.direction,
    contractorId: document.contractor.id,
    contractorName: document.contractor.name,
    contractorNip: document.contractor.nip,
    categoryId: document.category?.id ?? null,
    categoryName: document.category?.name ?? null,
    issueDate: document.issueDate.toISOString(),
    dueDate: document.dueDate?.toISOString() ?? null,
    netAmount: document.netAmount.toString(),
    vatAmount: document.vatAmount.toString(),
    grossAmount: document.grossAmount.toString(),
    currency: document.currency,
    paymentAccount: document.paymentAccount,
    notes: document.notes,
    hasPdf: document.files.some((file) => file.kind === "PDF"),
    hasXml: document.files.some((file) => file.kind === "KSEF_XML"),
  };
}
