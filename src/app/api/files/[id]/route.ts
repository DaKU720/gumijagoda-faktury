import { prisma } from "@/server/db";

/**
 * Serwowanie pliku dokumentu (PDF / XML) do podglądu w przeglądarce.
 *
 * Kluczowy nagłówek: `Content-Disposition: inline`. Wymaganie mówi wprost — użytkownik ma
 * obejrzeć fakturę „bez pobierania pliku na dysk”. `attachment` wymusiłoby pobieranie,
 * `inline` pozwala przeglądarce wyrenderować PDF we wbudowanym czytniku (przewijanie, zoom,
 * wyszukiwanie — wszystko za darmo, bez wciągania pdf.js do bundla).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const file = await prisma.documentFile.findUnique({ where: { id } });

  if (!file) {
    return new Response("Nie znaleziono pliku", { status: 404 });
  }

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.sizeBytes),
      // Nazwa pliku w cudzysłowie — faktury potrafią mieć spacje i ukośniki w numerze.
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
      // Treść faktury nigdy się nie zmienia (plik jest niezmienny), ale to dane wrażliwe —
      // cache tylko prywatny, w przeglądarce użytkownika, nigdy na współdzielonym proxy.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
