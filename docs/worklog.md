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
