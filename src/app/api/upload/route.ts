import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { FaParseError } from "@/server/domain/fa-parser";
import { DomainError } from "@/server/services/errors";
import { assertUploadable, uploadPdfInvoice, uploadXmlInvoice } from "@/server/services/upload";

/**
 * Wgrywanie pliku faktury.
 *
 * Route handler, a nie server action: przesyłamy plik binarny, a `FormData` z plikiem
 * jest naturalnym wejściem dla endpointu HTTP. Server action też by to przyjął, ale
 * endpoint daje jasny kontrakt (kod statusu, JSON) i łatwo go przetestować curlem.
 *
 * Warstwa cienka: rozpoznaj typ pliku → oddaj do serwisu → przetłumacz wyjątek na status.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Nie przesłano pliku" }, { status: 400 });
    }

    const kind = assertUploadable({ size: file.size, type: file.type, name: file.name });
    const data = new Uint8Array(await file.arrayBuffer());

    if (kind === "KSEF_XML") {
      const outcome = await uploadXmlInvoice({ name: file.name, type: file.type, data });

      if (outcome.status === "duplicate") {
        // 409 Conflict, nie 400: żądanie było poprawne, tylko ten dokument już u nas jest.
        return NextResponse.json({ status: "duplicate", reason: outcome.reason, number: outcome.number }, { status: 409 });
      }

      return NextResponse.json({ status: "created", documentId: outcome.documentId, number: outcome.number });
    }

    // PDF: dane pochodzą z formularza, plik zostaje załącznikiem.
    const document = await uploadPdfInvoice(
      {
        number: formData.get("number"),
        typeId: formData.get("typeId"),
        contractorId: formData.get("contractorId"),
        categoryId: formData.get("categoryId") === "__none__" ? "" : formData.get("categoryId"),
        issueDate: formData.get("issueDate"),
        dueDate: formData.get("dueDate") ?? "",
        netAmount: formData.get("netAmount"),
        vatAmount: formData.get("vatAmount"),
        grossAmount: formData.get("grossAmount"),
        currency: formData.get("currency") || "PLN",
        paymentAccount: formData.get("paymentAccount") ?? "",
        notes: formData.get("notes") ?? "",
      },
      { name: file.name, type: file.type, data },
    );

    return NextResponse.json({ status: "created", documentId: document.id, number: document.number });
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return NextResponse.json({ error: issue?.message ?? "Niepoprawne dane", field: issue?.path?.[0] }, { status: 400 });
    }

    if (error instanceof FaParseError || error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Upload nie powiódł się:", error);
    return NextResponse.json({ error: "Nie udało się wgrać pliku" }, { status: 500 });
  }
}
