import "server-only";
import { prisma } from "@/server/db";
import { resolveCategoryId } from "@/server/domain/categorization";
import { parseFaXml } from "@/server/domain/fa-parser";
import { DomainError, isUniqueViolation } from "@/server/services/errors";
import { hashFile, importInvoiceXml, type ImportOutcome } from "@/server/services/import";
import { documentSchema } from "@/server/validation/schemas";

/**
 * Wgrywanie faktur spoza KSeF.
 *
 * Dwa rodzaje plików, dwa scenariusze:
 *
 *  XML FA(2)/FA(3) — plik jest ustrukturyzowany, więc dane wczytują się SAME. Użytkownik
 *  nie przepisuje niczego; parser + ten sam import, którym idą faktury z KSeF.
 *
 *  PDF — komputer nie wie, co jest na skanie (OCR jest poza zakresem zadania). Plik zostaje
 *  załącznikiem, a pola dokumentu użytkownik uzupełnia w formularzu. Dokument i tak trafia
 *  do bufora: dane pochodzą z ręki, ale sam dokument z zewnątrz, a bufor jest miejscem,
 *  gdzie się to weryfikuje przed wpuszczeniem do ewidencji.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — faktura PDF nie ma prawa być większa

export function assertUploadable(file: { size: number; type: string; name: string }) {
  if (file.size === 0) throw new DomainError("Plik jest pusty");
  if (file.size > MAX_FILE_BYTES) {
    throw new DomainError(`Plik jest za duży (maks. ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
  }

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isXml =
    file.type.includes("xml") || file.name.toLowerCase().endsWith(".xml");

  if (!isPdf && !isXml) {
    throw new DomainError("Obsługujemy tylko pliki PDF oraz XML w schemacie KSeF FA(2)/FA(3)");
  }

  return isPdf ? ("PDF" as const) : ("KSEF_XML" as const);
}

/** Upload pliku XML: dane faktury wczytują się automatycznie. */
export async function uploadXmlInvoice(file: { name: string; type: string; data: Uint8Array<ArrayBuffer> }): Promise<ImportOutcome> {
  const xml = decodeXml(file.data);

  return importInvoiceXml(xml, {
    source: "UPLOAD",
    file: {
      filename: file.name,
      mimeType: file.type || "application/xml",
      kind: "KSEF_XML",
      data: file.data,
    },
  });
}

/**
 * Zawartość pliku trzymamy jako `Uint8Array` (tego oczekuje Prisma dla kolumny Bytes),
 * a XML dekodujemy jawnie jako UTF-8 — faktury z polskimi znakami nie wybaczają
 * domyślnego kodowania platformy.
 */
function decodeXml(data: Uint8Array<ArrayBuffer>): string {
  return new TextDecoder("utf-8").decode(data);
}

/**
 * Podgląd danych z pliku XML bez zapisu — formularz uploadu pokazuje użytkownikowi,
 * co system z pliku wyczytał, zanim cokolwiek trafi do bazy.
 */
export function previewXmlInvoice(data: Uint8Array<ArrayBuffer>) {
  return parseFaXml(decodeXml(data));
}

/** Upload PDF: plik jako załącznik + dane z formularza. */
export async function uploadPdfInvoice(input: unknown, file: { name: string; type: string; data: Uint8Array<ArrayBuffer> }) {
  const data = documentSchema.parse(input);
  const sha256 = hashFile(file.data);

  const existingFile = await prisma.documentFile.findUnique({ where: { sha256 } });
  if (existingFile) {
    throw new DomainError("Ten sam plik został już wgrany");
  }

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
        source: "UPLOAD",
        status: "BUFFER",
        files: {
          create: {
            kind: "PDF",
            filename: file.name,
            mimeType: file.type || "application/pdf",
            data: file.data,
            sha256,
            sizeBytes: file.data.length,
          },
        },
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError(`Dokument „${data.number}” od tego kontrahenta już istnieje w systemie`, "number");
    }
    throw error;
  }
}
