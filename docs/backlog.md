# Backlog

Legenda: `[ ]` do zrobienia · `[~]` w toku · `[x]` gotowe

## Fazy

- [x] **1. Scaffold** — Next.js 16, shadcn/ui, Prisma 7, docker-compose, Jest + Playwright, dokumentacja
- [x] **2. Model danych** — schema.prisma, migracja `init`, idempotentny seed
- [x] **3. Ustawienia** — typy dokumentów, drzewo kategorii, kontrahenci (NIP/NRB + reguła kategorii)
- [x] **4. Rejestr dokumentów** — filtry, sortowanie, konfiguracja kolumn, formularz ręczny
- [x] **5. Upload + parser FA** — PDF/XML, auto-wczytanie danych z FA(2)/FA(3), deduplikacja
- [x] **6. Bufor** — akceptacja/odrzucenie (pojedyncza i zbiorcza), auto-kategoryzacja
- [x] **7. KSeF** — interfejs + mock + realny klient API 2.0, pobieranie ręczne
- [x] **8. Harmonogram** — node-cron, wiele godzin na dobę, historia uruchomień
- [x] **9. Podgląd dokumentów** — PDF w przeglądarce, czytelny widok XML, panel boczny
- [x] **10. Testy** — 43 jednostkowe (Jest) + 11 e2e (Playwright)
- [x] **11. Wdrożenie** — Railway (app + Postgres), publiczny URL, 11 testów e2e przechodzi przeciwko produkcji
- [x] **12. README** — architektura, decyzje, research rynku, założenia, ograniczenia, „co dalej”
- [ ] **13. (opcjonalnie)** — biała lista VAT / GUS po NIP, reguły kategoryzacji po słowach kluczowych

## Kryteria akceptacji z treści zadania (sekcja 8)

### Rejestr dokumentów
- [x] Można dodać i edytować dokument z wymaganymi polami
- [x] Lista pokazuje dokumenty; działają filtry po typie, kontrahencie, dacie wystawienia i terminie płatności
- [x] Można zdefiniować własny typ dokumentu i przypisać go do dokumentu
- [x] Można skonfigurować widoczność kolumn na liście _(oraz ich kolejność)_

### Pobieranie z KSeF i upload
- [x] Pobieranie ręczne po zakresie dat i rodzaju (kosztowe / sprzedażowe); wynik trafia do bufora
- [x] Harmonogram automatycznego pobierania jest konfigurowalny (wiele uruchomień w ciągu doby)
- [x] Można wgrać plik faktury spoza KSeF (PDF i XML FA); dla XML dane wczytują się automatycznie
- [x] Akceptacja pozycji z bufora przenosi je do rejestru dokumentów
- [x] Ta sama faktura nie zostaje pobrana / wgrana / przeniesiona dwukrotnie
      _(zweryfikowane: powtórne pobranie → 0 zaimportowanych, 2 pominięte; upload faktury z KSeF → 409)_

### Kategoryzacja
- [x] Kategorie tworzą drzewo (podkategorie)
- [x] Można przypisać dokument do kategorii i filtrować po kategorii _(filtr obejmuje poddrzewo)_
- [x] Reguła „kontrahent → kategoria” przypisuje kategorię automatycznie

### Podgląd dokumentów
- [x] Można otworzyć podgląd PDF faktury bezpośrednio w aplikacji
- [x] Dane z faktury XML KSeF są prezentowane w czytelnej formie (nie surowy XML)
- [x] Podgląd jest dostępny z poziomu listy dokumentów i bufora _(panel boczny, bez opuszczania listy)_

### Wdrożenie
- [x] Aplikacja jest dostępna pod publicznym URL i działa (frontend + API + baza)
      — https://gumijagoda-app-production.up.railway.app
- [x] Pełną ścieżkę można wykonać na wdrożonej wersji: wgranie / pobranie faktury → akceptacja →
      rejestr → podgląd _(11 testów e2e przechodzi przeciwko produkcji)_

## Wymagania niefunkcjonalne

- [x] PostgreSQL + Prisma
- [x] Filtrowanie i sortowanie po stronie bazy (indeksy złożone, paginacja serwerowa)
- [x] Walidacja NIP (mod 11) i rachunku (mod-97) z sumami kontrolnymi; kwoty, daty, terminy
- [x] Harmonogram (node-cron), konfigurowalny z UI
- [x] Sekrety wyłącznie po stronie serwera (`server-only`, brak `NEXT_PUBLIC_`)
- [x] Obsługa błędów integracji (KsefSyncRun + czytelne komunikaty, brak utraty danych)
- [x] Uruchomienie jedną komendą (`docker compose up`)
