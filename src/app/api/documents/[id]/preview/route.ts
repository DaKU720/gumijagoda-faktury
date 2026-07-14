import { NextResponse } from "next/server";
import { getDocumentPreview } from "@/server/services/document-preview";

/**
 * Dane podglądu dokumentu.
 *
 * Endpoint, a nie prop przekazany z listy: panel podglądu otwiera się na żądanie (klik w wiersz),
 * a niesie znacznie więcej danych niż wiersz tabeli — pozycje faktury, adresy stron, treść XML-a.
 * Wysyłanie tego wszystkiego z góry, dla każdego z 25 wierszy strony, byłoby marnotrawstwem;
 * użytkownik otworzy podgląd jednego, może dwóch dokumentów.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const preview = await getDocumentPreview(id);

  if (!preview) {
    return NextResponse.json({ error: "Nie znaleziono dokumentu" }, { status: 404 });
  }

  return NextResponse.json(preview);
}
