<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Gumijagoda — system zarządzania fakturami

Zadanie rekrutacyjne. Aplikacja do ewidencji faktur: rejestr, pobieranie z KSeF, upload plików
spoza KSeF, kategoryzacja drzewiasta, podgląd dokumentów.

## Komendy

```bash
docker compose up -d db     # baza (Postgres 16)
npm run dev                 # aplikacja na :3000
npm run db:migrate          # nowa migracja po zmianie schema.prisma
npm run db:seed             # dane testowe (idempotentne)
npm run db:reset            # czysta baza + migracje + seed
npm test                    # testy jednostkowe (Jest, warstwa domenowa)
npm run test:e2e            # testy e2e (Playwright)
npm run typecheck           # tsc --noEmit
docker compose up           # cała aplikacja + baza jednym poleceniem
```

## Reguły architektury (nienegocjowalne — to jest oceniane)

1. **Logika biznesowa nigdy w komponentach React.** Mieszka w `src/server/`:
   - `src/server/domain/` — czyste funkcje, zero I/O (walidacja, parsowanie XML, reguły kategoryzacji)
   - `src/server/services/` — przypadki użycia; znają Prismę i domenę, nie znają HTTP ani Reacta
   - `src/server/ksef/` — integracja za interfejsem `KsefClient` (implementacja real + mock)
   - `src/app/` — cienka warstwa wejścia: sparsuj Zodem → wywołaj serwis → zwróć wynik
2. **`src/server/**` nie importuje niczego z `react`/`next`** (poza `server-only`). Sprawdzian:
   testy jednostkowe działają w środowisku `node`, bez `next/jest`. Jeśli przestaną — logika wyciekła do UI.
3. **Sekrety tylko po stronie serwera.** Wszystkie zmienne czyta `src/server/env.ts` (oznaczony
   `server-only`). Żadnego `NEXT_PUBLIC_` dla tokenów KSeF — bundler wstrzyknąłby je do przeglądarki.
4. **Walidacja Zodem na granicy serwera**, nie tylko w formularzu. Dane z KSeF też są wejściem
   z zewnątrz i też trzeba je sprawdzić.
5. **Deduplikacja jest niezmiennikiem bazy**, nie `if`-em w kodzie: `ksefNumber` unique,
   `(number, contractorId)` unique, `sha256` pliku unique. Serwis przechwytuje naruszenie i zamienia
   je na czytelny komunikat, a przy imporcie liczy jako „pominięty duplikat”, nie jako błąd.
6. **Kwoty to `Decimal`, nigdy `Float`.**

## Dokumentacja — prowadzona na bieżąco

- `docs/backlog.md` — zadania + checklista kryteriów akceptacji z treści zadania. Odhaczaj po każdej fazie.
- `docs/worklog.md` — dziennik: co zrobione, co odkryte, co zaskoczyło.
- `docs/decisions/` — ADR-y. Każda nieoczywista decyzja: kontekst, decyzja, konsekwencje, odrzucone alternatywy.
- `docs/architecture.md` — aktualny stan architektury.

Commit po każdej ukończonej fazie (historia commitów jest deliverable).

## Kontekst techniczny (rzeczy, które zaskakują)

- **Prisma 7**: `schema.prisma` nie zawiera URL-a bazy. Klient tworzy się z adapterem
  (`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`), a CLI czyta URL z `prisma.config.ts`.
  Wygenerowany klient leży w `src/generated/prisma/` (poza repo) — import z `@/generated/prisma/client`.
- **Next.js 16**, App Router, React 19, Tailwind 4, shadcn/ui, TanStack Table.
- **KSeF**: wyłącznie środowisko testowe (`api-test.ksef.mf.gov.pl`). Nigdy produkcyjne.
