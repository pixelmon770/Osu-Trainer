# osu! Trener

Program na komputer dla graczy osu!: analiza map i replayów, statystyki, roadmapa umiejętności,
trenery kliknięć i aimu oraz połączenie z AI (Claude, ChatGPT i inne przez MCP).
Pełny opis: [`docs/SPEC.md`](docs/SPEC.md).

**Stan:** etap 0 i pierwsza część etapu 1 – działa analizator map (streamy, bloki streamów,
skoki na 1/2, czytanie) oraz okno programu z menu, dwoma językami (PL/EN) i ekranem „Analiza mapy”.

## Struktura

```
apps/desktop/          program (Electron + React + TypeScript)
  src/main/            proces główny: okno, pliki, komunikacja z interfejsem
  src/preload/         bezpieczny most między interfejsem a procesem głównym
  src/renderer/        interfejs (React), tłumaczenia w src/renderer/src/locales/
  src/shared/          typy wspólne dla wszystkich części
packages/analyzer/     analiza map .osu (czysty TypeScript, bez Electrona) + testy
docs/                  specyfikacja, roadmapa, dane referencyjne, projekt ekranów
```

## Pierwsze uruchomienie (Windows)

1. Zainstaluj **Node.js 22 LTS** ze strony https://nodejs.org (instalator .msi, wszystko domyślnie).
2. Otwórz folder repozytorium w terminalu (w Eksploratorze: prawy przycisk w folderze → „Otwórz w terminalu”).
3. Sprawdź wersję: `node -v` – powinno być `v22.12` lub nowsze.
4. Zainstaluj zależności (raz, i po każdej zmianie `package.json`):
   ```
   npm install
   ```
5. Uruchom program w trybie deweloperskim:
   ```
   npm run dev
   ```
   Otworzy się okno programu. Zmiany w interfejsie widać od razu po zapisaniu pliku.
   F12 otwiera narzędzia deweloperskie (konsola błędów).

## Przydatne komendy

| Komenda | Co robi |
|---|---|
| `npm run dev` | uruchamia program |
| `npm test` | testy analizatora |
| `npm run typecheck` | sprawdza typy TypeScript w całym repo |
| `npm run analyze -- "ścieżka\do\mapy.osu"` | analiza mapy w terminalu (działa też z folderem) |
| `npm run build` | buduje program do `apps/desktop/out` |
| `npm run dist -w @osu-trainer/desktop` | instalator .exe w `apps/desktop/release` (później, gdy program będzie gotowy) |

Przykład analizy całego folderu piosenki z osu! (PowerShell, domyślny terminal w Windows 11):

```
npm run analyze -- "$env:LOCALAPPDATA\osu!\Songs\1241370 GYZE - HONESTY"
```

## Testy na prawdziwych mapach

Mapy nie trafiają do repozytorium. Żeby porównać analizator z danymi z `docs/data/maps_analyzed.json`,
wrzuć pliki `.osu` do folderu `fixtures-local/` w głównym katalogu (jest w `.gitignore`)
albo ustaw zmienną `OSU_MAPS_DIR` na folder z mapami. Bez map ten test jest pomijany.

## Języki

Angielski jest językiem bazowym, polski drugim. Kolejne języki według `docs/SPEC.md`, sekcja 16:
nowy folder w `apps/desktop/src/renderer/src/locales/<kod>/translation.json` (skopiuj angielski
i przetłumacz wartości, nie klucze) i wpis w `LANGUAGES` w `src/renderer/src/i18n.ts`.

## Praca z nowym czatem AI

Wklej zawartość [`docs/START_PROMPT.md`](docs/START_PROMPT.md) na początku rozmowy
i dołącz link do repozytorium.

## Autorzy i źródła

Roadmapa umiejętności oparta na „osu! phd chart” autorstwa DigitalHypno
(https://osu.ppy.sh/users/4384207), poprawiona i rozbudowana – szczegóły w `docs/roadmap/`.
