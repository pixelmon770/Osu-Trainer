# osu! Trener

Program na komputer dla graczy osu!: analiza map i replayów, statystyki, roadmapa umiejętności,
trenery kliknięć i aimu oraz połączenie z AI (Claude, ChatGPT i inne przez MCP).
Pełny opis: [`docs/SPEC.md`](docs/SPEC.md).

**Stan:** działają wszystkie ekrany z SPEC (wersja 0.10), wygląd jak w projekcie `docs/design/Main.dc.html`:

| Ekran | Co robi |
|---|---|
| **Pulpit** | dziś i ostatnie 7 dni (z porównaniem), seria dni, zadania na dziś, cele, „co dziś trenować” z gotowymi ustawieniami ćwiczeń, ostatnie gry, ostatnia sesja |
| **Statystyki** | celność, UR, K2−K1, wejście w stream, UR w streamach – z porównaniem do poprzedniego okresu, trend dzień po dniu, zestawienie według BPM streamów, najczęściej grane mapy |
| **Roadmapa umiejętności** | 35 umiejętności i 51 połączeń z opisami, Twoja ocena każdej umiejętności, część oceniana automatycznie z replayów |
| **Replaye i analizy** | każde kliknięcie przypisane do nuty (okna oceny, notelock, stosy, HR/EZ), wnioski, wykresy; historia z wyszukiwaniem, filtrami, widokiem map i postępem na mapie; nowe gry ze stable i lazera wpadają same |
| **Analizator klatek** | replay na planszy klatka po klatce: kółka zbliżania, slidery, ślad kursora, klawisze, oceny; skok do missów, tempo 0,05–1× |
| **Trener kliknięć** | tor z nutami i hit error K1/K2: drabinka burstów, stream na wytrzymałość, streamy z mapy |
| **Skoki – trener aimu** | kształty jak w mapach (trójkąty, gwiazdy, kwadraty, Oibon przez cały ekran, płynne pod szerokim kątem, wielokąty, losowe) albo skoki wycięte z prawdziwej mapy z Biblioteki (np. wpisz „Sotarks”), z tempem 0,5–1,5×; mysz/tablet + klawisze; timing, odległość od środka, przestrzał/niedolot, wykres miejsc kliknięć |
| **Rytm i metronom** | 10 ćwiczeń palców z SPEC, kalibracja opóźnienia dźwięku, historia |
| **Analiza mapy** | streamy, bloki, skoki, czytanie |
| **Biblioteka map** | Twoje mapy z osu!stable i lazera przeanalizowane w tle; filtry (gwiazdki, BPM, streamy, bloki, skoki, AR/OD/CS, nakładanie), „dobierz do celu” z Twojego poziomu, drabinka do mapy-celu |
| **Sesje i postęp** | gry i ćwiczenia w sesjach, rozgrzewka, zmęczenie pod koniec sesji |
| **Plan i to-do** / **Cele** | zadania powtarzane w dni tygodnia, cele liczone same z danych |
| **Połączenie z AI** | eksport dla AI (Markdown), lokalny serwer MCP dla Claude Desktop (dodawany jednym przyciskiem) |
| **Ustawienia** | foldery osu!stable i lazera, obserwowane foldery, import, powiadomienia, autostart, klawisze, dźwięk, odświeżanie obrazu (jak monitor / bez limitu) i licznik FPS, język |

Brakuje jeszcze konta online (osu! OAuth, Firebase) i bazy map spoza Twojego komputera – Biblioteka map działa na mapach, które masz pobrane.
Błąd na jednym ekranie nie wyłącza programu – pokazuje opis i przycisk powrotu.

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
| `npm test` | testy analizatora i sprawdzenie tłumaczeń |
| `npm run typecheck` | sprawdza typy TypeScript w całym repo |
| `npm run analyze -- "ścieżka\do\mapy.osu"` | analiza mapy w terminalu (działa też z folderem) |
| `npm run build` | buduje program do `apps/desktop/out` |
| `npm run dist -w @osu-trainer/desktop` | instalator .exe w `apps/desktop/release` (później, gdy program będzie gotowy) |

Przykład analizy całego folderu piosenki z osu! (PowerShell, domyślny terminal w Windows 11):

```
npm run analyze -- "$env:LOCALAPPDATA\osu!\Songs\1241370 GYZE - HONESTY"
```

## Replaye

Gdy program jest włączony, obserwuje foldery z replayami i każdy nowy plik `.osr` od razu analizuje:
- `osu!/Data/r` – osu!stable zapisuje tu sam replay każdej **ukończonej** próby,
- `osu!/Replays` – replaye wyeksportowane przez F2 (tak zapiszesz też faila),
- **osu!lazer** – magazyn plików `%APPDATA%\osu\files` (albo folder wybrany w grze, `storage.ini`);
  lazer zapisuje pliki pod nazwami-skrótami bez rozszerzeń, więc program rozpoznaje replaye i mapy
  po pierwszych bajtach; łapie też faile zapisane przez lazera,
- dowolne dodatkowe foldery (Ustawienia → Replaye → Dodaj folder).

W historii każdy replay ma oznaczone źródło (stable / lazer).

Replay zapisuje tylko sumę MD5 mapy. Program szuka mapy tak: przeciągnięty razem plik `.osu`
→ mapy zapamiętane wcześniej → `osu!.db` → indeks map lazera → folder replaya → najnowsze foldery w `Songs`
(osu! dopisuje do `osu!.db` mapy pobrane w trakcie sesji dopiero po zamknięciu gry).
Gdy nic nie pasuje, przy ręcznym otwieraniu program prosi o wskazanie mapy.

### Gdzie program trzyma dane

Folder danych programu: `%APPDATA%\osu-trainer` (w Eksploratorze wpisz to w pasek adresu):

| Plik | Co zawiera |
|---|---|
| `settings.json` | ustawienia |
| `osu-trainer.sqlite` | historia analiz replayów |
| `map-index.json` | zapamiętane ścieżki map (MD5 → plik .osu) |
| `lazer-index.json` | indeks map z magazynu lazera (pierwsze zbudowanie może potrwać minutę) |

Replaye i mapy nie są nigdzie wysyłane.

## Testy na prawdziwych mapach

Mapy nie trafiają do repozytorium. Żeby porównać analizator z danymi z `docs/data/maps_analyzed.json`,
wrzuć pliki `.osu` do folderu `fixtures-local/` w głównym katalogu (jest w `.gitignore`)
albo ustaw zmienną `OSU_MAPS_DIR` na folder z mapami. Bez map ten test jest pomijany.
Replaye `.osr` wrzuć do `fixtures-local/replays/` – test sprawdzi, czy wyliczone oceny
zgadzają się z licznikami zapisanymi przez osu!.

## Języki

Interfejs: English, Polski, Deutsch, Español, Français, Português (Brasil), Русский.
Angielski jest wzorcem i zapasem (brakujący tekst pokaże się po angielsku). Opisy umiejętności
na Roadmapie są na razie tylko po polsku.

Nowy język (`docs/SPEC.md`, sekcja 16): folder `apps/desktop/src/renderer/src/locales/<kod>/translation.json`
(skopiuj angielski, tłumacz wartości, nie klucze), wpis w `LANGUAGES` i `resources` w `src/renderer/src/i18n.ts`,
teksty powiadomień w `src/main/texts.ts` i wstęp eksportu w `src/main/ai.ts`.
`npm test` sprawdza każdy język: brakujące teksty, zmienne `{{...}}` i formy liczby mnogiej
(np. polski i rosyjski potrzebują `_one`, `_few`, `_many`, `_other`).

## Claude Desktop (MCP)

W programie: **Połączenie z AI → Dodaj do Claude Desktop**, potem zamknij i otwórz Claude Desktop.
Serwer (`apps/desktop/mcp/server.mjs`) uruchamia się przez Electron jako Node, tylko czyta bazę historii
i działa wyłącznie lokalnie. Ręczna konfiguracja i lista narzędzi są na tym samym ekranie.

## Praca z nowym czatem AI

Wklej zawartość [`docs/START_PROMPT.md`](docs/START_PROMPT.md) na początku rozmowy
i dołącz link do repozytorium.

## Autorzy i źródła

Roadmapa umiejętności oparta na „osu! phd chart” autorstwa DigitalHypno
(https://osu.ppy.sh/users/4384207), poprawiona i rozbudowana – szczegóły w `docs/roadmap/`.
