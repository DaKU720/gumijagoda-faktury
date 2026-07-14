# Architektura

> Dokument żyjący — aktualizowany na bieżąco wraz z kolejnymi fazami.
> Skrót decyzji „dlaczego tak” znajduje się w `docs/decisions/` (ADR-y).

## Widok z lotu ptaka

Aplikacja to monolit Next.js (App Router) z **twardo rozdzielonymi warstwami**. Wymóg z zadania
brzmi wprost: „logika biznesowa nie może żyć w komponentach React”. Realizujemy to nie deklaracją,
lecz strukturą katalogów i zależnościami, które da się sprawdzić mechanicznie:

```
src/
  app/          UI + route handlers      → wolno importować z server/, components/
  components/   komponenty prezentacyjne → NIE wolno importować z server/services
  server/       domena i dostęp do danych→ NIE importuje niczego z react/next
  generated/    klient Prisma (generowany, poza repo)
```

Reguła praktyczna: **`src/server/**` da się przetestować zwykłym Jestem w środowisku `node`,
bez jsdom i bez `next/jest`**. Jeśli kiedykolwiek przestanie — znaczy, że logika wyciekła do UI.

## Warstwy

### `src/server/domain` — czysta domena
Funkcje bez efektów ubocznych i bez bazy: walidacja NIP i NRB (sumy kontrolne), parsowanie
XML FA(2)/FA(3), decyzja o kategorii z reguły kontrahenta, rozstrzyganie duplikatów.
To tutaj mieszka to, co najciekawsze do przetestowania — i co jest w 100% pokryte testami jednostkowymi.

### `src/server/services` — przypadki użycia
Orkiestracja: „zaimportuj fakturę do bufora”, „zaakceptuj pozycje z bufora”, „zsynchronizuj z KSeF”.
Serwisy znają Prismę i domenę; nie znają HTTP ani Reacta. Zwracają wyniki, nie `Response`.

### `src/server/ksef` — integracja za interfejsem
`KsefClient` to interfejs; są dwie implementacje (`RealKsefClient`, `MockKsefClient`) wybierane
zmienną `KSEF_MODE`. Reszta systemu nie wie, która działa. Szczegóły i uzasadnienie:
`docs/decisions/0001-ksef-za-interfejsem.md`.

### `src/app` — cienka warstwa wejścia
Server actions (formularze) i route handlery (upload, strumieniowanie plików, wyzwalanie synchronizacji).
Ich jedyne zadania: sparsować wejście Zodem, wywołać serwis, zamienić wynik na odpowiedź/redirect.
Zero reguł biznesowych.

## Model danych — kluczowe decyzje

| Decyzja | Dlaczego |
|---|---|
| Kierunek (należność/zobowiązanie) na **typie dokumentu**, nie na dokumencie | To typ definiuje naturę dokumentu. Użytkownik dodając własny typ („nota odsetkowa”) od razu deklaruje jego kierunek — system nie musi zgadywać. |
| Bufor jako **status dokumentu**, nie osobna tabela | Akceptacja to zmiana stanu, nie przepisywanie danych. Jeden byt = jeden identyfikator = deduplikacja działa globalnie (także między buforem a rejestrem). ADR 0002. |
| Kwoty jako `Decimal(14,2)` | `Float` gubi grosze. W ewidencji faktur to dyskwalifikujące. |
| Trzy niezależne bariery antyduplikatowe | `ksefNumber` unique, `(number, contractorId)` unique, `sha256` pliku unique. Każda łapie inny scenariusz — patrz niżej. |
| Pliki w bazie (`bytea`) | Railway bez wolumenu nie ma trwałego dysku; S3/R2 to zależność ponad zakres zadania. Świadomy trade-off, przy skali → object storage. |
| Kategoria: self-relation + unique `(parentId, name)` | Drzewo dowolnej głębokości; „Transport” może istnieć równolegle pod „Koszty” i pod „Sprzedaż”. |

## Deduplikacja — trzy scenariusze, trzy bariery

Wymóg pojawia się w zadaniu trzykrotnie (KSeF, upload, przeniesienie do rejestru), więc traktujemy
go jako niezmiennik bazy, a nie jako `if` w kodzie:

1. **Ta sama faktura pobrana dwa razy z KSeF** (np. nakładające się okna harmonogramu)
   → `Document.ksefNumber` UNIQUE.
2. **Ta sama faktura wgrana ręcznie i pobrana z KSeF** (albo wgrana dwukrotnie z innego pliku)
   → `Document.(number, contractorId)` UNIQUE — numer faktury + NIP kontrahenta, dokładnie jak sugeruje zadanie.
3. **Ten sam plik wgrany dwa razy** (inny numer w nazwie, ta sama treść)
   → `DocumentFile.sha256` UNIQUE.

Baza pilnuje niezmiennika; warstwa serwisów **przechwytuje** naruszenie i zamienia je na czytelny
komunikat („Faktura FV/1/2026 od tego kontrahenta jest już w systemie”) zamiast błędu 500.
Ważne: pomijanie duplikatu przy imporcie **nie jest błędem** — jest liczone jako `skippedCount`
w historii synchronizacji.

## Wydajność listy dokumentów

Filtrowanie i sortowanie dzieje się **w bazie**, nie w przeglądarce: parametry filtrów żyją
w query stringu, komponent serwerowy tłumaczy je na `where`/`orderBy` Prismy, wraca jedna strona
wyników. Indeksy złożone (`status, issueDate`) pokrywają domyślny widok rejestru (status = ACCEPTED
posortowany po dacie). Konfiguracja kolumn (widoczność, kolejność) jest wyłącznie kwestią UI —
trzymana w `localStorage`, bez round-tripu do serwera.

## Harmonogram

`node-cron` rejestrowany w `instrumentation.ts` przy starcie procesu Node — odczytuje konfigurację
z bazy i tworzy jedno zadanie na każdą wybraną godzinę. Zmiana ustawień w UI przeładowuje zadania
bez restartu. To dlatego wdrożenie idzie na **Railway** (długo żyjący proces), a nie na Vercela
(serverless — proces umiera po requeście, cron by nie tykał). ADR 0003.
