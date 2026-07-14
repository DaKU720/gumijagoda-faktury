# ADR 0002 — Bufor jako status dokumentu, nie osobna tabela

**Status:** przyjęte
**Data:** 2026-07-14

## Kontekst

Zadanie wymaga dwuetapowego obiegu: faktury z KSeF trafiają najpierw do **bufora**, użytkownik je
przegląda i akceptuje, a zaakceptowane lądują w **rejestrze**. Zadanie wprost zostawia wybór:
„etap bufora możesz zrealizować jako status/flagę na dokumencie albo jako osobny byt”.

Jednocześnie zadanie trzykrotnie wymaga odporności na duplikaty — w tym: „ta sama faktura nie może
zostać **pobrana ani przeniesiona** do rejestru dwukrotnie”.

## Decyzja

Bufor to **status na dokumencie** (`DocumentStatus.BUFFER | ACCEPTED | REJECTED`), nie osobna tabela.
Akceptacja = zmiana statusu, nie kopiowanie rekordu.

## Uzasadnienie

Rozstrzyga o tym wymóg deduplikacji. Przy dwóch tabelach (`BufferedInvoice` + `Document`) unikalność
trzeba by pilnować **w trzech miejscach naraz**: wewnątrz bufora, wewnątrz rejestru i pomiędzy nimi
(faktura leżąca w buforze nie może zostać ponownie pobrana, mimo że nie ma jej jeszcze w rejestrze).
Baza nie potrafi wymusić unikalności przez dwie tabele — skończyłoby się to ręcznymi sprawdzeniami
w kodzie, czyli dokładnie tym, co zawodzi przy współbieżności (dwa równoległe joby harmonogramu).

Przy jednej tabeli `UNIQUE(ksefNumber)` i `UNIQUE(number, contractorId)` załatwiają wszystkie trzy
scenariusze naraz i to na poziomie silnika bazy, a nie uprzejmości kodu.

Dodatkowo:
- Podgląd dokumentu (wymóg 3.4: „dostępny z poziomu listy dokumentów **oraz** bufora”) to jeden
  komponent i jedno zapytanie, nie dwa.
- Ścieżka pliku, kategoria i kontrahent nie muszą być przepinane przy akceptacji.
- Odrzucenie z bufora (`REJECTED`) zostaje w bazie — dzięki temu kolejne pobranie z KSeF nie wciągnie
  ponownie faktury, którą użytkownik świadomie odrzucił. Przy osobnej tabeli bufora rekord zniknąłby
  i wrócił przy następnej synchronizacji.

## Konsekwencje

- Każde zapytanie o rejestr musi filtrować po `status = ACCEPTED` — pokryte indeksami złożonymi
  (`status, issueDate`), więc bez kosztu wydajnościowego.
- Dokument w buforze jest „pełnoprawny” w sensie schematu (ma kontrahenta, typ, kwoty) — import musi
  umieć zbudować komplet danych już na wejściu do bufora, a nie dopiero przy akceptacji. To dobrze:
  użytkownik widzi w buforze dokładnie to, co wyląduje w rejestrze.

## Powiązana decyzja: upload też idzie przez bufor

Zadanie zostawia wybór („do bufora na tych samych zasadach albo bezpośrednio do rejestru — decyzja
i uzasadnienie po stronie kandydata”). Wybieramy **przez bufor**, bo:
1. Jedna ścieżka wejścia = jedno miejsce, gdzie działa deduplikacja i auto-kategoryzacja.
2. Dane z uploadu bywają niepewne (PDF wymaga ręcznego uzupełnienia pól, XML może być z obcego
   systemu) — bufor jest naturalnym miejscem na weryfikację przed wpuszczeniem do ewidencji.
3. Dokument dodany **ręcznie** (formularz) trafia od razu do rejestru — użytkownik właśnie go przepisał,
   akceptowanie własnego wpisu byłoby pustym klikiem.
