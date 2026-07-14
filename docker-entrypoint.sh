#!/bin/sh
set -e

# Migracje MUSZĄ się udać — bez schematu aplikacja i tak nie zadziała, więc lepiej
# zatrzymać start i pokazać błąd, niż wystawić serwis, który sypie się przy pierwszym zapytaniu.
echo "==> Stosowanie migracji bazy danych"
npx prisma migrate deploy

# Seed jest idempotentny (upserty po kluczach naturalnych), więc bezpiecznie odpala się przy
# każdym starcie. Jego niepowodzenie NIE blokuje aplikacji — dane mogą już istnieć, a brak
# danych przykładowych to nie awaria. Ale komunikat mówi prawdę: coś poszło nie tak.
echo "==> Seedowanie danych przykładowych"
if ! npx prisma db seed; then
  echo "!! Seed zakończył się błędem (patrz log powyżej). Aplikacja startuje mimo to."
fi

echo "==> Start Next.js"
exec npx next start -p "${PORT:-3000}"
