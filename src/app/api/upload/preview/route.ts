import { NextResponse } from "next/server";
import { FaParseError } from "@/server/domain/fa-parser";
import { DomainError } from "@/server/services/errors";
import { assertUploadable, previewXmlInvoice } from "@/server/services/upload";

/**
 * Podgląd danych z pliku XML PRZED zapisem.
 *
 * Po co: użytkownik wgrywa plik i od razu widzi, co system z niego wyczytał (kontrahenta,
 * kwoty, termin). Jeśli parser czegoś nie zrozumiał, dowiaduje się o tym zanim faktura
 * wyląduje w buforze — a nie po fakcie, przeglądając bufor.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Nie przesłano pliku" }, { status: 400 });
    }

    const kind = assertUploadable({ size: file.size, type: file.type, name: file.name });
    if (kind !== "KSEF_XML") {
      return NextResponse.json({ error: "Podgląd danych jest dostępny tylko dla plików XML" }, { status: 400 });
    }

    const parsed = previewXmlInvoice(new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ status: "parsed", invoice: parsed });
  } catch (error) {
    if (error instanceof FaParseError || error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Podgląd XML nie powiódł się:", error);
    return NextResponse.json({ error: "Nie udało się odczytać pliku" }, { status: 500 });
  }
}
