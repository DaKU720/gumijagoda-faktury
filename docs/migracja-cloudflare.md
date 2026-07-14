# Plan migracji na Cloudflare (Workers + Hyperdrive + R2)

> Dokument dla przyszłych użytkowników i dla mnie samego, gdyby projekt miał zmienić hosting.
> Gotowe pliki konfiguracyjne leżą w [`docs/cloudflare/`](cloudflare/) — do skopiowania jeden do jednego.

---

## 0. Trzy sprostowania na start

Zanim cokolwiek zaczniemy przenosić, trzeba wyprostować trzy rzeczy, bo od nich zależy cały plan.

### „Baza na Workers”

**Workers to nie baza danych.** Workers to środowisko uruchomieniowe — odpowiednik serwera, na którym
działa kod aplikacji. Nie da się „postawić na nim bazy”, tak jak nie da się postawić bazy „na Node.js”.

Cloudflare ma trzy różne rzeczy do przechowywania danych i żadna z nich nie jest zamiennikiem
PostgreSQL jeden do jednego:

| Usługa | Czym jest | Czy nadaje się dla nas |
|---|---|---|
| **D1** | SQLite na brzegu sieci | **Nie.** Nasz schemat używa typów, których SQLite nie ma: `enum`, tablic (`Int[]` w harmonogramie), `Decimal(14,2)`, `bytea`. Migracja oznaczałaby przepisanie modelu danych i utratę precyzji kwot. |
| **KV** | magazyn klucz–wartość | Nie. To cache, nie baza relacyjna. Zero relacji, zero transakcji. |
| **R2** | magazyn obiektów (jak S3) | **Tak, ale na pliki** — nie na dane. Idealne miejsce na PDF-y i XML-e faktur. |

**Wniosek:** baza zostaje PostgreSQL, tylko przenosi się do zewnętrznego dostawcy
(**Neon**, **Supabase** albo **Prisma Postgres**), a Cloudflare łączy się z nią przez **Hyperdrive** —
pooler połączeń, który utrzymuje pulę otwartych połączeń blisko bazy i sprawia, że Worker nie musi
nawiązywać nowego połączenia TCP przy każdym żądaniu.

```
Przeglądarka → Cloudflare Workers (Next.js) → Hyperdrive (pooler) → PostgreSQL (Neon/Supabase)
                        ↓
                    R2 (pliki: PDF, XML)
```

### „Cloudflare Pages”

Pages jest **wchłaniane przez Workers**. Adapter `next-on-pages` jest oficjalnie **deprecated**,
a dokumentacja Cloudflare kieruje nowe projekty Next.js na **Workers + OpenNext**
(`@opennextjs/cloudflare`). Nie ma sensu celować w Pages w 2026 roku — trafilibyśmy w produkt
w trakcie zwijania.

### Twardy blocker: kryptografia KSeF

Nasz `RealKsefClient` wyciąga klucz publiczny Ministerstwa z certyfikatu X.509:

```ts
const certificate = new X509Certificate(Buffer.from(usable.certificate, "base64"));
return createPublicKey(certificate.publicKey).export({ type: "spki", format: "pem" }).toString();
```

**`X509Certificate` nie jest zaimplementowane w Cloudflare Workers** (nawet z flagą `nodejs_compat`).
To nie jest drobiazg do obejścia flagą — to brakujące API w silniku `workerd`.

Rozwiązanie: przepisać ten fragment na **WebCrypto**, wyciągając klucz publiczny (SPKI) wprost
ze struktury DER certyfikatu, bez `X509Certificate`. Gotowy kod:
[`docs/cloudflare/ksef-crypto-webcrypto.ts`](cloudflare/ksef-crypto-webcrypto.ts).

To jedyna część aplikacji, która **nie przeniesie się bez zmian w kodzie**.

---

## 1. Co się psuje przy przenosinach (i co z tym zrobić)

Uczciwa lista. Workers to nie „Node.js w chmurze” — to inny silnik, z innymi ograniczeniami.

| Co mamy dziś | Co się dzieje na Workers | Rozwiązanie |
|---|---|---|
| **`node-cron`** w `instrumentation.ts` | **Nie działa.** Worker nie jest procesem, który żyje — budzi się na żądanie i umiera. Nie ma czego „trzymać w pamięci”. | **Cron Triggers** Cloudflare: platforma sama budzi Workera o zadanej porze i wywołuje handler `scheduled()`. |
| **Godziny harmonogramu z bazy** (użytkownik klika w UI) | Cron Triggers są zdefiniowane statycznie w `wrangler.jsonc` — **nie da się ich zmienić z poziomu aplikacji**. | Trigger co godzinę (`0 * * * *`), a handler **sam sprawdza w bazie**, czy ta godzina jest na liście użytkownika. Konfigurowalność zostaje, zmienia się mechanika. |
| **Pliki w Postgresie (`bytea`)** | Działa, ale źle: Worker ma limit pamięci (128 MB) i CPU. Wciąganie 10-megabajtowego PDF-a do pamięci Workera, żeby go odesłać, to marnotrawstwo. | **R2** (magazyn obiektów). W bazie zostaje tylko klucz obiektu i suma SHA-256. |
| **`prisma migrate deploy` w entrypoincie kontenera** | Nie ma kontenera ani entrypointu. | Migracje odpalane **z CI albo lokalnie** przed wdrożeniem (`npm run db:deploy`). |
| **Singleton `PrismaClient`** | Antywzorzec na Workers — trzeba klienta **na żądanie**, z `maxUses: 1`. | [`docs/cloudflare/db-workers.ts`](cloudflare/db-workers.ts) |
| **Pętla pobierania faktur z KSeF** (stronicowanie + XML-e) | Limit CPU (do 5 min na płatnym planie, 10 ms–30 s zależnie od planu). Import 500 faktur może się nie zmieścić. | Rozbić na kolejkę (**Cloudflare Queues**) albo importować partiami. |
| **`X509Certificate`** | **Nie istnieje w Workers.** | Przepisać na WebCrypto — [`ksef-crypto-webcrypto.ts`](cloudflare/ksef-crypto-webcrypto.ts). |

### Czy w takim razie w ogóle warto?

**Dla tego zadania rekrutacyjnego — nie.** Specyfikacja wprost wskazuje `node-cron`, a `node-cron`
wymaga długo żyjącego procesu. Railway daje to za darmo i bez kompromisów (ADR 0003).

**Cloudflare ma sens, gdy:** aplikacja ma użytkowników na kilku kontynentach (Workers działają
w ~300 lokalizacjach), ruch jest zmienny (płacisz za żądania, nie za czas działania serwera),
a domena i tak jest w Cloudflare. Dla ewidencji faktur jednej polskiej firmy — Railway jest
prostszy i tańszy w utrzymaniu.

Ten dokument istnieje po to, żeby migracja była **decyzją**, a nie skokiem w nieznane.

---

## 2. Sekrety: gdzie co trzymać

Pytanie „zapiszemy w env i w cloudflare tokens?” — odpowiedź brzmi: **zależy od środowiska**, i to
jest ważne rozróżnienie.

| Gdzie | Plik / miejsce | Co tam trafia | Czy w repo |
|---|---|---|---|
| **Lokalny development** | `.dev.vars` | `KSEF_TOKEN`, `KSEF_NIP`, `DATABASE_URL` | **NIE** (w `.gitignore`) |
| **Produkcja — sekrety** | Workers **Secrets** (szyfrowane) | `KSEF_TOKEN` | **NIE** — nigdy |
| **Produkcja — jawna konfiguracja** | `vars` w `wrangler.jsonc` | `KSEF_MODE`, `KSEF_BASE_URL` | **TAK** (to nie sekrety) |
| **Połączenia do usług** | Bindings (Hyperdrive, R2) | id konfiguracji | **TAK** (id nie jest sekretem) |

**Zasada:** jeśli wyciek wartości oznacza kłopoty → **Secret**. Jeśli nie → `vars`.
`KSEF_TOKEN` to Secret. `KSEF_MODE=mock` to zwykła zmienna.

Ustawianie sekretów (nigdy przez commit):

```bash
npx wrangler secret put KSEF_TOKEN     # zapyta o wartość, zapisze zaszyfrowaną
npx wrangler secret put KSEF_NIP
npx wrangler secret list               # sprawdzenie, co jest ustawione (bez wartości!)
```

Albo w panelu: **Workers & Pages → [twój worker] → Settings → Variables and Secrets → Add → Type: Secret**.

> **Uwaga na osobny byt: „Cloudflare API Token”.** To co innego niż sekrety aplikacji! Token API służy
> do tego, żeby **CI/CD mogło wdrażać** w Twoim imieniu. Tworzysz go w
> **My Profile → API Tokens → Create Token → szablon „Edit Cloudflare Workers”** i wklejasz do
> GitHub Actions jako `CLOUDFLARE_API_TOKEN`. Aplikacja go nigdy nie widzi.

---

## 3. Migracja krok po kroku

### Krok 1: Baza PostgreSQL u zewnętrznego dostawcy

```bash
# Przykład: Neon (darmowy tier wystarczy)
# 1. https://neon.tech → New Project → region: Frankfurt (najbliżej Polski)
# 2. Skopiuj connection string, np.:
#    postgresql://user:haslo@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require

# 3. Przenieś schemat (migracje działają bez zmian — to nadal Postgres):
DATABASE_URL="postgresql://..." npx prisma migrate deploy
DATABASE_URL="postgresql://..." npx prisma db seed
```

Schemat przenosi się **bez żadnych zmian** — to nadal PostgreSQL, tylko u innego dostawcy.
To jest ta część, która jest łatwa, i dlatego warto ją zrobić najpierw.

### Krok 2: Hyperdrive (pooler między Workerem a bazą)

```bash
npx wrangler hyperdrive create gumijagoda-db \
  --connection-string="postgresql://user:haslo@ep-xxx.neon.tech/neondb?sslmode=require"
```

Komenda zwróci **ID konfiguracji** — wklej je do `wrangler.jsonc` (pole `bindings[].id`).

**Po co Hyperdrive:** Worker budzi się na milisekundy. Nawiązanie połączenia TCP + TLS do bazy
w Niemczech trwa dłużej niż całe żądanie. Hyperdrive trzyma pulę gotowych połączeń **po stronie
Cloudflare**, więc Worker dostaje połączenie od ręki. Bez tego aplikacja byłaby wolna i szybko
wyczerpałaby limit połączeń bazy.

### Krok 3: R2 na pliki faktur

```bash
npx wrangler r2 bucket create gumijagoda-faktury
```

Zmiana w modelu danych (`prisma/schema.prisma`):

```prisma
model DocumentFile {
  // ...
  // data      Bytes     ← USUWAMY
  r2Key      String @unique   // np. "faktury/2026/07/<sha256>.pdf"
  sha256     String @unique
  sizeBytes  Int
}
```

Endpoint `/api/files/[id]` zamiast czytać `bytea` z bazy, strumieniuje obiekt z R2:

```ts
const object = await env.FILES.get(file.r2Key);
return new Response(object.body, {
  headers: { "Content-Type": file.mimeType, "Content-Disposition": "inline; ..." },
});
```

**Dlaczego to jest lepsze, a nie tylko inne:** plik nie przechodzi już przez pamięć Workera —
R2 strumieniuje go prosto do przeglądarki. Znika limit 128 MB pamięci jako sufit rozmiaru faktury.

### Krok 4: Adapter OpenNext

```bash
npm install --save-dev @opennextjs/cloudflare wrangler
```

Skopiuj z `docs/cloudflare/`:
- [`wrangler.jsonc`](cloudflare/wrangler.jsonc) → do katalogu głównego
- [`open-next.config.ts`](cloudflare/open-next.config.ts) → do katalogu głównego
- [`db-workers.ts`](cloudflare/db-workers.ts) → zastępuje `src/server/db.ts`
- [`ksef-crypto-webcrypto.ts`](cloudflare/ksef-crypto-webcrypto.ts) → wymiana kryptografii w `RealKsefClient`

Dodaj do `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
};
```

Skrypty w `package.json`:

```json
{
  "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
  "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy"
}
```

### Krok 5: Harmonogram na Cron Triggers

`node-cron` i `instrumentation.ts` **znikają**. Zastępuje je handler `scheduled`, który Cloudflare
budzi co godzinę — a on sam sprawdza w bazie, czy ta konkretna godzina jest na liście użytkownika.
Konfigurowalność z UI zostaje nienaruszona.

Kod: [`docs/cloudflare/scheduled.ts`](cloudflare/scheduled.ts).

### Krok 6: Pierwsze wdrożenie

```bash
npx wrangler login          # logowanie w przeglądarce
npm run deploy              # build OpenNext + upload na Workers
```

---

## 4. Subdomena `dev.twojadomena.pl` — krok po kroku w panelu Cloudflare

**Warunek wstępny:** domena musi być już w Cloudflare (nameservery przestawione u rejestratora,
strefa aktywna). Jeśli tak jest, subdomena to dosłownie kilka kliknięć — a **rekordu DNS nie tworzysz
ręcznie**, Cloudflare zrobi to za Ciebie.

### Ścieżka w panelu

1. Zaloguj się na <https://dash.cloudflare.com>.
2. Lewe menu → **Compute (Workers)** → **Workers & Pages**.
3. Kliknij swojego workera (`gumijagoda-faktury`).
4. Zakładka **Settings** → sekcja **Domains & Routes**.
5. **Add** → **Custom domain**.
6. Wpisz pełną nazwę: **`dev.twojadomena.pl`** (nie samo `dev`).
7. **Add domain**.

**Co się dzieje automatycznie:** Cloudflare sam tworzy rekord DNS (typ `CNAME`, proxowany —
pomarańczowa chmurka) i sam wystawia certyfikat TLS. Nie dotykasz zakładki DNS.

Po 1–2 minutach status zmieni się na **Active** i `https://dev.twojadomena.pl` zaczyna działać.

### Weryfikacja

```bash
dig dev.twojadomena.pl +short              # powinien pokazać adresy Cloudflare
curl -I https://dev.twojadomena.pl/dokumenty   # HTTP 200
```

### Częste pułapki

| Objaw | Przyczyna | Naprawa |
|---|---|---|
| „This domain is not in your account” | Domena nie jest w Cloudflare | Najpierw **Add a Site** i przestaw nameservery u rejestratora |
| Błąd **526** (invalid SSL certificate) | Tryb SSL ustawiony na *Full (strict)*, a origin nie ma certyfikatu | Dla Workers to nie występuje (nie ma zewnętrznego origin). Jeśli widzisz 526 — masz konfliktujący rekord DNS `dev`, usuń go |
| Subdomena pokazuje starą stronę | Istnieje ręcznie dodany rekord `dev` (A/CNAME) | **DNS → Records** → usuń rekord `dev`, potem dodaj Custom Domain jeszcze raz |
| „Custom domain already in use” | Subdomena podpięta do innego workera/Pages | Odepnij ją tam (Settings → Domains → Remove) |

> **Różnica względem Railway:** tam trzeba było ręcznie dodać CNAME w Cloudflare i **wyłączyć proxy**
> (szara chmurka), bo Railway sam terminuje TLS. Przy Workers jest odwrotnie: ruch **ma** iść przez
> Cloudflare, bo tam właśnie działa aplikacja. Dlatego proxy zostaje włączone i wszystko dzieje się
> automatycznie.

---

## 5. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci

      # Migracje PRZED wdrożeniem — Worker nie ma entrypointu, który by je odpalił.
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - run: npx opennextjs-cloudflare build
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Sekrety w GitHubie (**Settings → Secrets and variables → Actions**):
- `CLOUDFLARE_API_TOKEN` — z **My Profile → API Tokens → szablon „Edit Cloudflare Workers”**
- `CLOUDFLARE_ACCOUNT_ID` — z prawej kolumny dashboardu
- `DATABASE_URL` — connection string do Neona (do migracji)

---

## 6. Checklista migracji

- [ ] Baza PostgreSQL u zewnętrznego dostawcy (Neon / Supabase / Prisma Postgres)
- [ ] `prisma migrate deploy` + seed na nowej bazie
- [ ] `wrangler hyperdrive create` → ID wklejone do `wrangler.jsonc`
- [ ] `wrangler r2 bucket create` → pliki przeniesione z `bytea` do R2 (+ migracja schematu)
- [ ] `src/server/db.ts` → klient **na żądanie** (`maxUses: 1`), nie singleton
- [ ] `RealKsefClient` → **WebCrypto zamiast `X509Certificate`** ← bez tego nic nie zadziała
- [ ] `node-cron` + `instrumentation.ts` → **usunięte**, zastąpione handlerem `scheduled`
- [ ] Sekrety: `wrangler secret put KSEF_TOKEN`, `KSEF_NIP`
- [ ] `wrangler deploy` → działa pod `*.workers.dev`
- [ ] Custom domain `dev.twojadomena.pl` w panelu (DNS tworzy się sam)
- [ ] Testy e2e przeciwko nowemu adresowi: `E2E_BASE_URL=https://dev.twojadomena.pl npx playwright test`
- [ ] Dopiero teraz: wyłączenie Railway

**Ostatni punkt jest najważniejszy.** Nie wyłączaj starego wdrożenia, dopóki testy e2e nie przejdą
na nowym. Mamy je właśnie po to — 11 testów przechodzących przeciwko produkcji to różnica między
„chyba działa” a „wiem, że działa”.
