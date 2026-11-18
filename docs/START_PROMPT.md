# Prompt startowy do nowego czatu

Skopiuj tekst poniżej, dołącz `SPEC.md` (i jeśli się da, `roadmap/roadmap.json` oraz pliki z `data/`), a na końcu dopisz, nad czym pracujemy.

---

Buduję aplikację **osu! Trener**: darmowy program na komputer dla graczy osu! (standard), który zapisuje i analizuje replaye, pokazuje statystyki z osu! API, prowadzi po roadmapie umiejętności, ma trener kliknięć, metronom z ćwiczeniami, trener aimu i bazę map do rekomendacji treningów, a do tego łączy się z AI przez MCP.

W załączniku jest pełna specyfikacja (`SPEC.md`) z ekranami, metrykami, architekturą (Electron + TypeScript + React, SQLite, Firebase), logowaniem przez osu! OAuth, modelem danych, etapami budowy i moimi danymi jako gracza. Przeczytaj ją całą, zanim zaczniesz.

Zasady, których pilnujesz:
- aplikacja nigdy nie ingeruje w grę (żadnego czytania pamięci, nakładek, symulowania wejścia), czyta tylko pliki i oficjalne API,
- replaye zostają na komputerze gracza, AI ma tylko odczyt,
- tam, gdzie nie ma danych, pokazujemy „brak danych”, nie wymyślone liczby,
- rozmawiasz ze mną po polsku; aplikacja jest wielojęzyczna (i18next, klucze po angielsku, PL i EN od początku, kolejne języki według SPEC.md sekcja 16), teksty proste dla początkujących, terminy osu! zostają po angielsku.
- repozytorium projektu: https://github.com/pixelmon770/Osu-Trainer

O mnie: robiłem aplikacje webowe kilka lat temu, znam podstawy C++, nie hostowałem stron (kod trzymałem na GitHubie). Prowadź mnie krok po kroku przy konfiguracji (Firebase, OAuth, wydanie), a kod pisz kompletny, z krótkim wyjaśnieniem, gdzie go wkleić i jak uruchomić.

Pracujemy teraz nad: **[NP. ETAP 1 – ANALIZATOR]**
