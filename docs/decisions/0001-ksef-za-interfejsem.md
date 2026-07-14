# ADR 0001 — Integracja z KSeF schowana za interfejsem (real + mock)

**Status:** przyjęte
**Data:** 2026-07-14

## Kontekst

Zadanie wymaga pobierania faktur z KSeF (kierunek: odbiór) ze środowiska testowego MF, ale wprost
dopuszcza warstwę mock — pod warunkiem, że integracja ma „czysty interfejs”, i zapowiada, że oceniane
będą „abstrakcja, granice, testowalność”.

Realia środowiska testowego KSeF: bywa niedostępne, wymaga tokena wygenerowanego ręcznie w Aplikacji
Podatnika, a uwierzytelnienie to wieloetapowy taniec (challenge → RSA-OAEP → JWT → polling → wymiana
tokena). Uzależnienie testów i demo od jego dostępności jest ryzykiem.

## Decyzja

Integracja żyje za jednym interfejsem:

```ts
interface KsefClient {
  listInvoices(params: { dateFrom: Date; dateTo: Date; kind: InvoiceKind }): Promise<KsefInvoiceRef[]>;
  fetchInvoiceXml(ksefNumber: string): Promise<string>;
}
```

Dwie implementacje, wybierane zmienną `KSEF_MODE`:

- **`RealKsefClient`** — API 2.0 środowiska testowego (`api-test.ksef.mf.gov.pl`).
- **`MockKsefClient`** — deterministyczne faktury z plików XML w repo (`fixtures/`).

Reszta systemu (serwis synchronizacji, UI, harmonogram) zna **wyłącznie interfejs**. Nie ma w niej
ani jednego `if (mock)`.

## Konsekwencje

- Testy jednostkowe i e2e chodzą offline, deterministycznie, bez tokena i bez sieci.
- Awaria środowiska MF nie blokuje demo ani rozwoju — przełącznik zmiennej środowiskowej.
- Logika importu (mapowanie XML → domena, deduplikacja, auto-kategoryzacja) jest testowana raz
  i działa identycznie dla obu źródeł.
- Koszt: dwie implementacje do utrzymania i dyscyplina, by mock zwracał dokładnie te same kształty
  danych co produkcyjny klient (wymuszone przez wspólny typ).

## Rozważane alternatywy

- **Tylko realny klient** — odrzucone: brak determinizmu w testach, demo zależne od dostępności MF.
- **Tylko mock** — odrzucone: zadanie punktuje realną integrację, a przepływ uwierzytelnienia KSeF
  jest najciekawszą techniczną częścią tego obszaru.
