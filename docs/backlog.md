# Backlog

Legenda: `[ ]` do zrobienia · `[~]` w toku · `[x]` gotowe

## Fazy

- [x] **1. Scaffold** — Next.js 16 (App Router, TS, Tailwind 4), shadcn/ui, Prisma 7, docker-compose,
      Jest + Playwright, `.env` + `.env.example`, dokumentacja, AGENTS.md
- [x] **2. Model danych** — schema.prisma, migracja `init`, seed z danymi testowymi
- [ ] **3. Ustawienia** — typy dokumentów, drzewo kategorii, kontrahenci (walidacja NIP/NRB, reguła kategorii)
- [ ] **4. Rejestr dokumentów** — tabela z filtrami, sortowaniem, konfiguracją kolumn; formularz ręczny
- [ ] **5. Upload + parser FA** — PDF/XML, auto-wczytanie danych z FA(2)/FA(3), deduplikacja
- [ ] **6. Bufor** — akceptacja/odrzucenie, auto-kategoryzacja przy wejściu
- [ ] **7. KSeF** — interfejs + mock + realny klient (API 2.0), pobieranie ręczne
- [ ] **8. Harmonogram** — node-cron, konfiguracja wielu godzin, historia uruchomień
- [ ] **9. Podgląd dokumentów** — PDF w przeglądarce, czytelny widok danych z XML, panel boczny
- [ ] **10. Testy** — Jest (domena) + Playwright (ścieżka krytyczna)
- [ ] **11. Wdrożenie** — Railway + subdomena przez CNAME
- [ ] **12. README** — architektura, decyzje, research rynku, instrukcja, ograniczenia
- [ ] **13. (opcjonalnie)** — GUS/biała lista po NIP, reguły kategoryzacji po słowach kluczowych

## Kryteria akceptacji z treści zadania (sekcja 8)

### Rejestr dokumentów
- [ ] Można dodać i edytować dokument z wymaganymi polami
- [ ] Lista pokazuje dokumenty; działają filtry po typie, kontrahencie, dacie wystawienia i terminie płatności
- [ ] Można zdefiniować własny typ dokumentu i przypisać go do dokumentu
- [ ] Można skonfigurować widoczność kolumn na liście

### Pobieranie z KSeF i upload
- [ ] Pobieranie ręczne po zakresie dat i rodzaju (kosztowe / sprzedażowe); wynik trafia do bufora
- [ ] Harmonogram automatycznego pobierania jest konfigurowalny (wiele uruchomień w ciągu doby)
- [ ] Można wgrać plik faktury spoza KSeF (PDF i/lub XML FA); dla XML dane wczytują się automatycznie
- [ ] Akceptacja pozycji z bufora przenosi je do rejestru dokumentów
- [ ] Ta sama faktura nie zostaje pobrana / wgrana / przeniesiona dwukrotnie

### Kategoryzacja
- [ ] Kategorie tworzą drzewo (podkategorie)
- [ ] Można przypisać dokument do kategorii i filtrować po kategorii
- [ ] Reguła „kontrahent → kategoria” przypisuje kategorię automatycznie

### Podgląd dokumentów
- [ ] Można otworzyć podgląd PDF faktury bezpośrednio w aplikacji
- [ ] Dane z faktury XML KSeF są prezentowane w czytelnej formie (nie surowy XML)
- [ ] Podgląd jest dostępny z poziomu listy dokumentów i bufora

### Wdrożenie
- [ ] Aplikacja jest dostępna pod publicznym URL i działa (frontend + API + baza)
- [ ] Pełną ścieżkę można wykonać na wdrożonej wersji: wgranie / pobranie → akceptacja → rejestr → podgląd
