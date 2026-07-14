# Wdrożenie (Railway + subdomena w Cloudflare)

Aplikacja jest przygotowana do wdrożenia jako **zwykły, długo żyjący kontener Node** — wymóg
harmonogramu `node-cron` (ADR 0003). Obraz Dockera został zweryfikowany lokalnie: `docker compose up`
stawia bazę i aplikację, stosuje migracje, seeduje dane i rejestruje zadania cron, a wszystkie
testy e2e przechodzą przeciwko kontenerowi.

## Co robi kontener przy starcie

`docker-entrypoint.sh`:
1. `prisma migrate deploy` — migracje muszą się udać, inaczej start jest przerywany,
2. `prisma db seed` — idempotentny; jego błąd nie blokuje aplikacji, ale jest wypisany w logu,
3. `next start` — serwer, a wraz z nim `instrumentation.ts` rejestrujące zadania `node-cron`.

## Krok po kroku

### 1. Repozytorium na GitHubie

```bash
gh repo create gumijagoda-faktury --private --source=. --push
```

(`--public`, jeśli link ma być otwarty dla rekrutera bez dodawania go jako współpracownika.)

### 2. Projekt na Railway

1. [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → wybierz repozytorium.
   Railway sam wykryje `railway.json` i zbuduje obraz z `Dockerfile`.
2. W tym samym projekcie: **+ New** → **Database** → **Add PostgreSQL**.
3. Railway wstrzyknie do usługi aplikacji zmienną `DATABASE_URL` — **nie ustawiaj jej ręcznie**.

### 3. Zmienne środowiskowe (zakładka Variables usługi aplikacji)

| Zmienna | Wartość | Uwagi |
|---|---|---|
| `KSEF_MODE` | `real` (albo `mock`) | `mock` = faktury z plików w repo, działa bez tokena |
| `KSEF_BASE_URL` | `https://api-test.ksef.mf.gov.pl` | **wyłącznie** środowisko testowe |
| `KSEF_NIP` | NIP z testowej Aplikacji Podatnika | wymagany przy `real` |
| `KSEF_TOKEN` | token wygenerowany w testowym KSeF | **sekret** — nigdy w repo |
| `SCHEDULER_ENABLED` | `true` | wyłącznik awaryjny harmonogramu |
| `TZ` | `Europe/Warsaw` | godziny w harmonogramie to czas polski |

`DATABASE_URL` pochodzi z pluginu Postgres — nie dodawaj go ręcznie.

### 4. Subdomena `dev.<twoja-domena>`

1. Railway → usługa aplikacji → **Settings → Networking → Custom Domain** → wpisz `dev.<twoja-domena>`.
   Railway pokaże docelowy adres CNAME (coś w rodzaju `xxx.up.railway.app`).
2. Cloudflare → DNS → **Add record**:
   - Type: `CNAME`
   - Name: `dev`
   - Target: adres podany przez Railway
   - **Proxy status: DNS only** (szara chmurka)

   Dlaczego DNS only: przy włączonym proxy Cloudflare terminuje TLS u siebie, a Railway nie może
   wtedy wystawić własnego certyfikatu — efektem jest błąd 526. Jeśli proxy jest potrzebne,
   trzeba przestawić tryb SSL na **Full (strict)**.
3. Odczekaj na propagację (zwykle minuty) — Railway sam wystawi certyfikat Let's Encrypt.

### 5. Weryfikacja wdrożenia

```bash
# Pełna ścieżka krytyczna przeciwko wersji produkcyjnej — te same testy co lokalnie.
E2E_BASE_URL=https://dev.<twoja-domena> npx playwright test
```

Testy e2e nie czyszczą bazy i generują własne, unikalne faktury — dlatego wolno je puścić
przeciwko wdrożeniu. Sprawdzają dokładnie to, czego wymaga zadanie: wgranie/pobranie faktury →
bufor → akceptacja → rejestr → podgląd, wraz z odpornością na duplikaty.

Ręcznie warto jeszcze:
- Ustawienia → Harmonogram → włączyć, wybrać godziny, zapisać (w logach Railway pojawi się
  `[cron] Zarejestrowano N zadań`).

## Znane pułapki (napotkane i rozwiązane)

- **Build bez bazy.** Next.js domyślnie prerenderuje strony przy budowaniu obrazu, a te sięgają
  do bazy, której na tym etapie nie ma. Rozwiązane przez `export const dynamic = "force-dynamic"`
  w `src/app/(app)/layout.tsx` — i tak żaden ekran ewidencji nie ma sensu jako statyczny.
- **Prisma 7 w obrazie runtime.** Do kontenera muszą trafić `prisma.config.ts` (CLI czyta z niego
  adres bazy) oraz wygenerowany klient z `src/generated/prisma`.
- **Tryb mock na produkcji.** `MockKsefClient` czyta pliki XML z dysku, więc `src/server/ksef/fixtures`
  musi być skopiowane do obrazu — inaczej mock działa lokalnie, a na wdrożeniu zwraca pustkę.
- **Jedna instancja.** `node-cron` żyje w pamięci procesu: przy `numReplicas > 1` każda replika
  odpaliłaby własne pobranie. Duplikaty i tak zostałyby odrzucone przez bazę, ale poprawnym
  rozwiązaniem przy skalowaniu jest blokada rozproszona (advisory lock w Postgresie).
