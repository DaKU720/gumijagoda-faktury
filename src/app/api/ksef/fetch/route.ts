import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { KsefError } from "@/server/ksef";
import { syncFromKsefManual } from "@/server/services/ksef-sync";

/**
 * Ręczne pobranie faktur z KSeF (zakres dat + rodzaj).
 *
 * Endpoint, nie server action: pobranie potrafi trwać kilkanaście sekund (uwierzytelnienie,
 * stronicowanie, ściąganie XML-i), a UI chce w tym czasie pokazać spinner i dostać
 * szczegółowy raport — ile znaleziono, ile zaimportowano, ile pominięto jako duplikaty.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const result = await syncFromKsefManual({
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      kind: body.kind,
    });

    revalidatePath("/bufor");

    return NextResponse.json({
      status: "ok",
      found: result.found,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return NextResponse.json({ error: issue?.message ?? "Niepoprawne dane" }, { status: 400 });
    }

    // Niedostępność KSeF to nie awaria naszej aplikacji — 502 (Bad Gateway) mówi wprost:
    // problem jest po stronie systemu, z którym się integrujemy.
    if (error instanceof KsefError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("Pobieranie z KSeF nie powiodło się:", error);
    return NextResponse.json({ error: "Nie udało się pobrać faktur z KSeF" }, { status: 500 });
  }
}
