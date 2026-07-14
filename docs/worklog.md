# Dziennik prac

## 2026-07-14 — Fazy 1–2: scaffold i model danych

**Zrobione**
- Scaffold: Next.js 16 (App Router, TypeScript, Tailwind 4), shadcn/ui (preset Nova, baza Radix),
  TanStack Table, Zod, node-cron, fast-xml-parser.
- Infrastruktura: `docker-compose.yml` (Postgres 16 + aplikacja), `Dockerfile` (multi-stage),
  `docker-entrypoint.sh` (migracje + seed + start).
- Konfiguracja: `src/server/env.ts` — jedyne miejsce czytające `process.env`, walidowane Zodem,
  oznaczone `server-only` (token KSeF fizycznie nie ma jak trafić do bundla przeglądarki).
- Model danych: `prisma/schema.prisma` + migracja `init` + idempotentny seed
  (3 typy dokumentów, 10 kategorii w drzewie, 6 kontrahentów, 7 dokumentów — w tym 2 w buforze).
- Domena: walidacja NIP (suma kontrolna mod 11) i NRB/IBAN (mod-97) — `src/server/domain/identifiers.ts`.
- Dokumentacja: `docs/architecture.md`, trzy ADR-y, backlog, ten dziennik, `AGENTS.md`.

**Co zaskoczyło (warto zapamiętać)**
- **Prisma 7 zmieniło konwencje.** `schema.prisma` nie zawiera już `url` w bloku `datasource` —
  adres bazy podaje się przy tworzeniu klienta, i to **przez driver adapter**
  (`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`), nie przez `datasourceUrl`
  (ta opcja została usunięta). CLI czyta URL z nowego pliku `prisma.config.ts`. Klient generuje się
  do `src/generated/prisma/`, nie do `node_modules/@prisma/client`.
- **Seed nie może importować `src/server/db.ts`** — tamten moduł jest `server-only` i wymaga kontekstu
  Next.js. Seed tworzy własnego klienta z tym samym adapterem.
- **Next.js 16**: `params` i `searchParams` w komponentach stron są `Promise` — trzeba je `await`ować.
- Trzy NIP-y i trzy numery rachunków, które wymyśliłem do seeda, miały złe sumy kontrolne — wyłapała
  je własna walidacja. Dobry znak: walidator działa, a dane testowe są realistyczne.

**Następny krok**
Faza 3: ustawienia — typy dokumentów, drzewo kategorii, kontrahenci z regułą auto-kategoryzacji.

---

## 2026-07-14 — Fazy 3–10: pełna funkcjonalność

**Zrobione**
- Ustawienia: drzewo kategorii (z ochroną przed cyklem), kontrahenci z regułą auto-kategoryzacji,
  własne typy dokumentów (systemowe chronione przed usunięciem).
- Rejestr: filtry/sortowanie/paginacja po stronie bazy, stan w query stringu, konfigurowalne kolumny
  (widoczność + kolejność w `localStorage`), formularz ręczny z auto-liczeniem brutto.
- Parser FA(2)/FA(3), upload PDF/XML z podglądem danych przed zapisem, bufor z akceptacją zbiorczą.
- KSeF za interfejsem: `MockKsefClient` (fixtures) + `RealKsefClient` (API 2.0, RSA-OAEP + JWT).
- Harmonogram `node-cron` (siatka godzin w UI), historia uruchomień z błędami integracji.
- Podgląd: jeden komponent dla XML / PDF / wpisu ręcznego; PDF przez natywny czytnik przeglądarki.
- Testy: 43 jednostkowe + 11 e2e.

**Co zaskoczyło**
- **Polski `Intl` nie grupuje tysięcy przy czterech cyfrach** — `1230,00`, ale `13 530,00` (i to twardą
  spacją). Wywróciło asercje w testach e2e; teraz są odporne na obie formy.
- **Prisma 7 wymaga `Uint8Array<ArrayBuffer>`** dla kolumn `Bytes` — zwykły `Buffer` nie przechodzi
  kontroli typów (`ArrayBufferLike` ≠ `ArrayBuffer`).
- **Prisma blokuje `migrate reset` uruchamiany przez agenta AI.** Słusznie — to nieodwracalne
  kasowanie bazy. Zamiast prosić o zgodę, przeprojektowałem testy e2e tak, żeby **nie wymagały
  czystej bazy**: każdy przebieg generuje fakturę z unikalnym numerem. Efekt uboczny okazał się
  lepszy od pierwotnego planu — te same testy da się teraz puścić przeciwko wdrożonej aplikacji,
  a tego wymaga zadanie.

---

## 2026-07-14 — Faza 11: przygotowanie wdrożenia

**Zrobione**
- Obraz produkcyjny zweryfikowany: `docker compose up` → migracje → seed → Next.js → cron.
- **Wszystkie 11 testów e2e przechodzi przeciwko kontenerowi** (nie tylko serwerowi dev).
- `railway.json`, `docs/wdrozenie.md` (krok po kroku + pułapki), README z researchem rynku.

**Trzy realne błędy wdrożeniowe wyłapane przez zbudowanie obrazu (a nie zauważalne w `npm run dev`)**
1. Next.js prerenderował strony przy budowaniu obrazu i uderzał do nieistniejącej bazy →
   `export const dynamic = "force-dynamic"` (i tak żaden ekran ewidencji nie ma sensu jako statyczny).
2. `prisma.config.ts` i wygenerowany klient (`src/generated/prisma`) nie trafiały do obrazu runtime →
   `migrate deploy` i seed nie miały adresu bazy ani klienta.
3. `MockKsefClient` czyta fixture'y z dysku → bez skopiowania `src/server/ksef/fixtures` tryb mock
   działał lokalnie, a na wdrożeniu zwracałby pustkę. Klasyczny błąd „u mnie działa”.

**Wdrożone:** <https://gumijagoda-app-production.up.railway.app> (Railway: aplikacja + PostgreSQL).

Ostatnia pułapka, już na produkcji: Railway wstrzykuje własny `PORT` (8080), a domenę przypiąłem
do portu 3000 — efektem było HTTP 502 mimo poprawnie działającego kontenera (migracje przeszły,
seed przeszedł, Next.js wystartował... na innym porcie niż ten, na który patrzył proxy).
Rozwiązane ustawieniem `PORT=3000` w zmiennych usługi.

**Weryfikacja końcowa:** te same testy e2e, które chodzą lokalnie, przechodzą przeciwko produkcji
(`E2E_BASE_URL=… npx playwright test` → 11 passed). To był cel projektowania testów tak, żeby nie
wymagały czystej bazy — inaczej „sprawdzenie na wdrożeniu” zostałoby ręcznym klikaniem.
