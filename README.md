# Gumijagoda — system zarządzania fakturami

Aplikacja do ewidencji faktur: rejestr dokumentów, pobieranie z KSeF, wgrywanie faktur spoza KSeF,
kategoryzacja drzewiasta i podgląd dokumentów bezpośrednio w przeglądarce.

**Repozytorium:** <https://github.com/DaKU720/gumijagoda-faktury>
**Wdrożona wersja:** _(uzupełnić po wdrożeniu — instrukcja w [`docs/wdrozenie.md`](docs/wdrozenie.md))_

---

## Uruchomienie

### Jedną komendą

```bash
cp .env.example .env      # domyślne wartości wystarczą: KSEF_MODE=mock działa bez tokena
docker compose up
```

Aplikacja: <http://localhost:3000>. Kontener sam stosuje migracje, seeduje dane przykładowe
i rejestruje zadania harmonogramu.

### Tryb deweloperski

```bash
docker compose up -d db   # sama baza
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

### Testy

```bash
npm test          # 43 testy jednostkowe (Jest) — warstwa domenowa
npm run test:e2e  # 11 testów e2e (Playwright) — ścieżka krytyczna przez UI
```

Testy e2e nie czyszczą bazy (każdy przebieg generuje fakturę z unikalnym numerem), więc te same
testy można puścić przeciwko wdrożonej aplikacji: `E2E_BASE_URL=https://… npx playwright test`.

---

## Architektura

Monolit Next.js z **twardo rozdzielonymi warstwami**. Wymóg „logika biznesowa nie może żyć
w komponentach React” jest tu wymuszony strukturalnie, a nie deklaratywnie:

```
src/
  app/          UI + route handlery + server actions  → cienka warstwa wejścia
  components/   komponenty prezentacyjne
  server/       backend (nie importuje react/next)
    domain/     czyste funkcje, zero I/O    → walidacja NIP/NRB, parser FA, reguły kategoryzacji
    services/   przypadki użycia            → import, bufor, synchronizacja, harmonogram
    ksef/       integracja za interfejsem   → KsefClient + Mock + Real
    validation/ schematy Zod
```

**Sprawdzian, że rozdział jest prawdziwy:** testy jednostkowe warstwy domenowej działają w czystym
środowisku `node` — bez `jsdom`, bez `next/jest`. Gdyby logika wyciekła do komponentów, przestałyby
się kompilować. To mechaniczny dowód, nie obietnica.

Warstwa wejścia ma jedno zadanie: sparsować wejście Zodem → wywołać serwis → zamienić wynik na
odpowiedź. Ani jednego `try/catch` w plikach akcji — tłumaczeniem wyjątków domenowych na komunikaty
formularza zajmuje się `runAction` (`src/server/actions/run-action.ts`).

### Model danych — decyzje

| Decyzja | Dlaczego |
|---|---|
| **Bufor jako status dokumentu**, nie osobna tabela | Rozstrzyga o tym wymóg deduplikacji. Przy dwóch tabelach unikalność trzeba by pilnować w trzech miejscach (w buforze, w rejestrze i między nimi) — a baza nie potrafi wymusić unikalności przez dwie tabele. Przy jednej tabeli `UNIQUE` załatwia wszystkie scenariusze na poziomie silnika, nie uprzejmości kodu. ([ADR 0002](docs/decisions/0002-bufor-jako-status-dokumentu.md)) |
| **Kierunek na typie dokumentu**, nie na dokumencie | To typ definiuje naturę dokumentu. Dodając własny typ („nota odsetkowa”), użytkownik od razu deklaruje, czy to należność, czy zobowiązanie. |
| **Kwoty jako `Decimal(14,2)`** | `Float` gubi grosze. W ewidencji faktur to dyskwalifikujące. |
| **Pliki w bazie (`bytea`)** | Świadomy trade-off: hosting bez trwałego dysku, a S3/R2 to zależność ponad zakres zadania. Przy realnej skali → object storage. |
| **Kategorie: self-relation + `UNIQUE(parentId, name)`** | Drzewo dowolnej głębokości; „Transport” może istnieć równolegle pod „Koszty” i pod „Sprzedaż”. |

### Deduplikacja — trzy bariery, trzy scenariusze

Wymóg pojawia się w zadaniu trzykrotnie, więc jest traktowany jako **niezmiennik bazy**, nie `if`
w kodzie:

1. `Document.ksefNumber` UNIQUE → ta sama faktura pobrana dwa razy z KSeF (nakładające się okna harmonogramu).
2. `Document.(number, contractorId)` UNIQUE → ta sama faktura wgrana ręcznie i pobrana z KSeF.
3. `DocumentFile.sha256` UNIQUE → ten sam plik wgrany dwukrotnie pod inną nazwą.

Serwis przechwytuje naruszenie i zamienia je na czytelny komunikat („Faktura FV/1/2026 od tego
kontrahenta jest już w systemie”), a przy imporcie liczy jako **pominięty duplikat**, nie jako błąd.
Ta sama bariera łapie też wyścig dwóch równoległych importów — czego samo sprawdzenie „czy istnieje?”
przed zapisem nigdy nie zagwarantuje.

### Integracja z KSeF

Cały system zna wyłącznie interfejs `KsefClient` (dwie metody: `listInvoices`, `fetchInvoiceXml`).
Za nim stoją dwie implementacje wybierane zmienną `KSEF_MODE` — reszta kodu nie zawiera ani jednego
`if (mock)`:

- **`RealKsefClient`** — API 2.0 środowiska testowego MF. Pełny przepływ uwierzytelnienia:
  certyfikat klucza publicznego → `POST /auth/challenge` → szyfrowanie `token|timestamp`
  algorytmem **RSA-OAEP (SHA-256)** → `POST /auth/ksef-token` → polling statusu → wymiana na
  `accessToken` (kilkanaście minut) + `refreshToken` (7 dni). Kryptografia wyłącznie na wbudowanym
  `node:crypto` — mniej zależności w kodzie dotykającym sekretów.
- **`MockKsefClient`** — prawdziwe faktury XML (FA(2) i FA(3)) z plików w repozytorium. Nie atrapa:
  implementuje ten sam kontrakt, respektuje zakres dat i przechodzi tę samą ścieżkę importu.

Dzięki temu testy są deterministyczne i offline, a awaria środowiska MF (które bywa niedostępne)
nie blokuje ani rozwoju, ani demo. ([ADR 0001](docs/decisions/0001-ksef-za-interfejsem.md))

**Jedna ścieżka importu.** Faktura z KSeF i plik wgrany przez użytkownika przechodzą przez ten sam
kod (`src/server/services/import.ts`) — te same reguły deduplikacji, ta sama auto-kategoryzacja,
ten sam bufor. Dwie ścieżki prędzej czy później rozjechałyby się w szczegółach.

### Wydajność

Filtrowanie, sortowanie i paginacja dzieją się **w bazie**. Stan filtrów żyje w query stringu
(link do przefiltrowanego widoku da się wysłać, „wstecz” działa, odświeżenie nie gubi filtrów),
komponent serwerowy tłumaczy go na `where`/`orderBy` Prismy i renderuje jedną stronę wyników.
Indeksy złożone (`status, issueDate`) pokrywają domyślny widok rejestru. Filtr po kategorii schodzi
w dół drzewa rekurencyjnym CTE — wybór „Produkcja” pokazuje też faktury z „Opakowania” i „Surowce”.

Konfiguracja kolumn (widoczność + kolejność) to preferencja UI — `localStorage`, bez round-tripu
do serwera.

---

## Research rynku

Przejrzałem, jak problem rozwiązują **Fakturownia**, **wFirma**, **inFakt** i **SaldeoSMART**.
Trzy rzeczy warte zapożyczenia i jedna, którą robię inaczej:

- **Poczekalnia przed ewidencją** (SaldeoSMART, wFirma) — dokumenty z zewnątrz nie wpadają wprost
  do ksiąg, tylko czekają na akceptację. Przejąłem to jako centralny element modelu, ale
  zrealizowałem statusem, nie osobnym bytem — bo tylko wtedy deduplikacja działa *pomiędzy* buforem
  a rejestrem, a nie osobno w każdym z nich.
- **Auto-dekretacja po kontrahencie** (SaldeoSMART, inFakt) — reguła „ten dostawca zawsze na to
  konto/kategorię” zdejmuje z użytkownika najbardziej powtarzalną pracę. U mnie: `Contractor.defaultCategory`,
  stosowana identycznie przy imporcie z KSeF, uploadzie i wpisie ręcznym (jedna czysta funkcja
  `resolveCategoryId`, testowana osobno).
- **Konfigurowalne kolumny rejestru** (Fakturownia) — księgowa i zarząd patrzą na te same faktury
  w zupełnie innych przekrojach.
- **Czym się różnię:** te systemy pokazują fakturę jako wizualizację PDF nawet wtedy, gdy źródłem
  jest XML. Ja renderuję **dane z XML-a** (strony transakcji, pozycje, stawki) w natywnym widoku
  aplikacji, a PDF traktuję jako załącznik obok. Faktura ustrukturyzowana to zbiór danych, nie
  obrazek — i tak też powinna być pokazywana. PDF renderuję wbudowanym czytnikiem przeglądarki
  (`iframe` + `Content-Disposition: inline`), bez dokładania pdf.js do bundla.

---

## Bezpieczeństwo

- Wszystkie zmienne środowiskowe czyta **jedno miejsce**: `src/server/env.ts`, oznaczone
  `import "server-only"`. Próba zaciągnięcia tego modułu do komponentu klienckiego wysadza **build**,
  a nie produkcję.
- Żadna zmienna nie ma prefiksu `NEXT_PUBLIC_` — token KSeF fizycznie nie ma jak trafić do bundla
  przeglądarki.
- Konfiguracja walidowana Zodem przy starcie: literówka w nazwie zmiennej ubija aplikację od razu,
  z czytelnym komunikatem, zamiast dawać `undefined` w środku importu z KSeF.
- Sekrety na wdrożeniu żyją w zmiennych środowiskowych hostingu, nigdy w repozytorium.
- Pliki dokumentów serwowane z `Cache-Control: private` — nigdy do współdzielonego proxy.

---

## Założenia

Miejsca, w których specyfikacja zostawiała swobodę, i decyzje, które podjąłem:

1. **Upload idzie przez bufor, wpis ręczny — nie.** Bufor to poczekalnia dla dokumentów
   *z zewnątrz*, których pochodzenia użytkownik jeszcze nie potwierdził. Dokument, który właśnie
   własnoręcznie przepisał, nie wymaga akceptowania samego siebie.
2. **Odrzucone dokumenty zostają w bazie** (status `REJECTED`). Gdyby znikały, kolejne pobranie
   z KSeF wciągałoby je z powrotem — użytkownik odrzucałby w kółko tę samą fakturę.
3. **Kierunek faktury z uploadu**: gdy nasz NIP nie pasuje do żadnej ze stron (typowe dla faktur
   zagranicznych), dokument jest traktowany jako kosztowy. Faktura wgrywana „z zewnątrz” to prawie
   zawsze coś do zapłaty; zgadywanie na odwrót zaśmieciłoby przychody.
4. **Termin płatności z FA** czytamy tylko jako konkretną datę. Schemat dopuszcza też opis słowny
   („14 dni od dostawy”) — zgadywanie terminu płatności w systemie księgowym jest gorsze niż jego brak.
5. **Brak logowania i ról** — zadanie tego nie wymaga (dopuszczalny tryb jednego użytkownika).
6. **PDF nie jest OCR-owany.** Pola uzupełnia użytkownik, plik zostaje załącznikiem.
7. **Sumy VAT liczone przez sumowanie wszystkich pól `P_13_*` / `P_14_*`**, zamiast wypisywania stawek
   z palca — faktura z nietypową (albo przyszłą) stawką nie wypadnie po cichu z sumy.

---

## Znane ograniczenia

- **Pliki w bazie danych.** Działa i przeżywa redeploy, ale nie jest to docelowe rozwiązanie przy
  tysiącach faktur miesięcznie — wtedy object storage (S3/R2) i strumieniowanie.
- **Harmonogram w pamięci procesu.** Przy skalowaniu do wielu instancji każda replika odpaliłaby
  własne pobranie. Duplikaty odrzuciłaby baza, ale poprawnym rozwiązaniem jest blokada rozproszona
  (advisory lock w Postgresie).
- **Brak paginacji po stronie KSeF przy bardzo dużych zakresach** — klient pobiera wszystkie strony
  w pętli; przy roku danych warto by to przenieść do zadania w tle z raportem postępu.
- **Reguła auto-kategoryzacji tylko po kontrahencie** (reguły po słowach kluczowych to zadanie
  dodatkowe, nie zrealizowane).
- **Real KSeF przetestowany strukturalnie, nie na żywym tokenie** — pełny przepływ uwierzytelnienia
  jest zaimplementowany zgodnie z dokumentacją API 2.0 i OpenAPI MF, ale wymaga tokena
  z testowej Aplikacji Podatnika, żeby przejść ścieżkę end-to-end.

## Co zrobiłbym dalej

1. **Weryfikacja kontrahenta po NIP** — publiczne API Wykazu podatników VAT (`wl-api.mf.gov.pl`,
   bez klucza): auto-uzupełnianie nazwy i adresu oraz sprawdzanie, czy rachunek jest na białej liście.
   To zadanie dodatkowe ze specyfikacji i pierwsza rzecz, którą bym dołożył — realna wartość przy
   niewielkim koszcie.
2. **Reguły kategoryzacji po słowach kluczowych** (w nazwie kontrahenta lub pozycji faktury),
   z podglądem „ta reguła dopasuje N istniejących dokumentów”.
3. **Object storage na pliki** + strumieniowanie zamiast `bytea`.
4. **Blokada rozproszona dla harmonogramu** (advisory lock) — warunek bezpiecznego skalowania.
5. **Kolejka zadań** dla importów z dużych zakresów dat, z raportem postępu zamiast długiego requestu.

---

## Dokumentacja

- [`docs/architecture.md`](docs/architecture.md) — architektura, warstwy, przepływy
- [`docs/decisions/`](docs/decisions/) — ADR-y (kontekst, decyzja, konsekwencje, odrzucone alternatywy)
- [`docs/wdrozenie.md`](docs/wdrozenie.md) — instrukcja wdrożenia i napotkane pułapki
- [`docs/backlog.md`](docs/backlog.md) — zakres prac i checklista kryteriów akceptacji
- [`docs/worklog.md`](docs/worklog.md) — dziennik prac

## Stack

Next.js 16 (App Router) · TypeScript · PostgreSQL + Prisma 7 · Zod · node-cron · TanStack Table ·
shadcn/ui + Tailwind 4 · Jest · Playwright · Docker

## Dane testowe

Seed (`prisma/seed.ts`, idempotentny) tworzy: 3 typy dokumentów (2 systemowe + własna nota),
10 kategorii w drzewie (do 3 poziomów), 6 kontrahentów — w tym 4 z regułą auto-kategoryzacji —
oraz 7 dokumentów, z czego 2 czekają w buforze. Faktury przykładowe dla trybu mock leżą
w `src/server/ksef/fixtures/` (FA(2) i FA(3), kosztowe i sprzedażowe).
