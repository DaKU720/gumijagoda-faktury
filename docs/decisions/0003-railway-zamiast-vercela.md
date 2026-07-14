# ADR 0003 — Wdrożenie na Railway (długo żyjący proces), nie na Vercelu

**Status:** przyjęte
**Data:** 2026-07-14

## Kontekst

Zadanie narzuca Next.js i jednocześnie wymaga harmonogramu opartego o **node-cron** („lub równoważny
mechanizm zadań cyklicznych”), konfigurowalnego, z wieloma uruchomieniami w ciągu doby. Aplikacja musi
być publicznie dostępna pod działającym URL-em.

Naturalnym hostingiem dla Next.js jest Vercel, ale Vercel to środowisko **serverless**: proces Node
żyje tyle, co obsługa requestu. `node-cron` rejestruje zadania w pamięci procesu — w serverless nigdy
by nie wystrzeliły. Zastępnik (Vercel Cron) to zewnętrzny scheduler wołający endpoint HTTP, z limitem
jednego uruchomienia dziennie na darmowym planie — czyli sprzeczność z wymaganiem „wiele uruchomień
w ciągu doby”.

## Decyzja

Wdrożenie na **Railway**: aplikacja jako zwykły, długo żyjący kontener Node + PostgreSQL jako usługa
w tym samym projekcie. Publiczny adres podpięty przez rekord CNAME pod subdomenę `dev.<domena>`
w DNS Cloudflare.

`node-cron` startuje w `instrumentation.ts` (hook Next.js wykonywany raz przy starcie serwera),
czyta konfigurację godzin z bazy i rejestruje po jednym zadaniu na godzinę.

## Konsekwencje

- Harmonogram działa dokładnie tak, jak opisuje zadanie — bez obchodzenia wymagania zewnętrznym cronem.
- Baza i aplikacja są w jednym projekcie: `DATABASE_URL` wstrzykiwany przez Railway, brak konfiguracji
  sieci między usługami.
- Migracje uruchamiają się przy starcie kontenera (`prisma migrate deploy` w entrypoincie), więc deploy
  jest jednokrokowy.
- Uwaga operacyjna: przy skalowaniu do wielu instancji cron odpaliłby się raz na instancję. Przy jednej
  instancji (i takim jest to zadanie) to nie problem; docelowo rozwiązaniem jest blokada rozproszona
  (advisory lock w Postgresie) — odnotowane w README jako „co dalej”.
- Sekrety (`KSEF_TOKEN`) żyją w zmiennych środowiskowych Railway, nie w repo — wymóg z sekcji 6 zadania,
  obowiązujący także dla wersji wdrożonej.
