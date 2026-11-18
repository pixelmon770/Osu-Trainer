# osu! Trener – specyfikacja projektu

Wersja: 18.11.2026 · autor pomysłu: parthmage (osu! ID 10059055)

Ten plik opisuje cały projekt tak, żeby dowolny czat z AI (Claude, ChatGPT lub inny) mógł od razu kontynuować pracę. Razem z nim w pakiecie są dane, roadmapa umiejętności, kod analiz i pliki projektu interfejsu (opis w sekcji 15).

---

## 0. Jak zacząć nowy czat

1. Dołącz do czatu ten plik (`SPEC.md`). Jeśli czat przyjmuje więcej plików, dołącz też `roadmap/roadmap.json` i `data/*.json`.
2. Wklej prompt startowy z pliku `START_PROMPT.md`.
3. Powiedz, nad którym etapem (sekcja 13) pracujemy.

---

## 1. Cel i odbiorcy

**osu! Trener** to darmowa aplikacja na komputer dla graczy osu! (tryb standard), która:

- automatycznie zapisuje i analizuje replaye (timing, palce, aim, przyczyny missów),
- pokazuje statystyki z osu! API i z replayów,
- prowadzi gracza po **roadmapie umiejętności** z poziomem w każdej umiejętności,
- daje narzędzia treningowe: trener kliknięć, metronom z ćwiczeniami perkusyjnymi, trener aimu i zakładkę typów skoków,
- dobiera mapy do treningu na podstawie bazy przeanalizowanych map,
- łączy się z AI (Claude, ChatGPT i inne przez MCP), żeby AI mogło analizować dane gracza i układać treningi.

Odbiorcy: gracze z całego świata, od początkujących po zaawansowanych. Dlatego aplikacja jest wielojęzyczna (sekcja 16), a każdy termin ma proste wyjaśnienie (słowniczek, opisy umiejętności).

---

## 2. Zasady nienaruszalne

1. **Żadnej ingerencji w grę.** Aplikacja nie czyta pamięci osu!, nie wstrzykuje kodu, nie symuluje wejścia, nie działa jako nakładka na grę. Czyta tylko pliki (replaye `.osr`, mapy `.osu`, `osu!.db`) i oficjalne API. To ważne także dlatego, że autor miał kiedyś restrykcję konta, zdjętą po odwołaniu.
2. **Dane gracza zostają u gracza.** Replaye nie opuszczają komputera. Na serwer trafiają tylko podsumowania, które gracz sam zaznaczy do udostępnienia.
3. **AI ma tylko odczyt.** Nie zmienia ustawień, nie wysyła wyników, nie loguje się do osu! w imieniu gracza.
4. **Zgodność z zasadami osu! API:** limity zapytań, cache, brak masowego pobierania bez potrzeby.
5. **Zdrowie:** aplikacja pilnuje przerw (strażnik zmęczenia, limit minut streamów) i ostrzega przy objawach przeciążenia.
6. **Uczciwe dane:** tam, gdzie nie ma pomiaru, aplikacja pokazuje „brak danych”, a nie wymyśloną liczbę.

---

## 3. Ekrany (projekt UI gotowy, pliki w `design/`)

Styl: ciemny (tło `#0f1012`, karty `#1b1c20`, obramowania `#2a2c31`), font Inter, pastelowe kafelki (niebieski `#dfe6f3`, zielony `#dde9d8`, żółty `#f7f0c6`, fioletowy `#e6defa`), akcent `#c9b8ff`. Kolory palców: **K1 niebieski `#8fb3ff`, K2 pomarańczowy `#f5b27a`**. Delikatne poświaty, karty unoszą się o 4 px po najechaniu, ruch wyłączony przy `prefers-reduced-motion`. Boczne menu na każdym ekranie.

| Ekran | Plik projektu | Zawartość |
|---|---|---|
| Pulpit | `Main.dc.html` | plan dnia z to-do (odhaczanie), kafelki profilu, „co program zauważył”, wykres acc w kolejnych próbach, najdłuższe bloki streamów na mapach, ostatnie replaye, cele długoterminowe |
| Statystyki | `Statystyki.dc.html` | profil, ranking 90 dni, wszystkie trafienia (300/100/50/miss), top 100 (histogramy gwiazdek, BPM, długości), wykres acc a trudność, porównania, pomiary z replayów |
| Roadmapa umiejętności | `Roadmapa.dc.html` | interaktywny diagram 35 umiejętności i 51 powiązań, poziom gracza, opisy, wybór fokusu (maks. 2), słowniczek, źródło |
| Replaye i analizy | `Replay.dc.html` | analiza pojedynczego replaya: UR start/koniec, K2–K1, odstępy tapnięć, przebieg próby, spóźnienie na skokach wg BPM, zadania dodane do to-do |
| Analizator klatek | `Analizator.dc.html` | pole gry klatka po klatce: ślad kursora, kliknięcia, ocena, oś czasu ze zdarzeniami, pasek klawiszy K1/K2, szczegóły klatki, wyjaśnienie przyczyny missa |
| Trener kliknięć | `Trener.dc.html` | pole gry (jeden tor z kolorami palców albo dwa tory), siatka rytmu, okna oceny, oznaczenie początku burstu z licznikiem, hit error K1/K2 na żywo, wskaźnik równości tapnięć, tryb skupienia |
| Rytm i metronom | `Rytm.dc.html` | działający metronom (BPM, 1/2, 1/3, 1/4, akcent), 10 ćwiczeń L/P z drabinkami tempa |
| Połączenie z AI i ustawienia | `Polaczenie.dc.html` | status AI, co AI może czytać (przełączniki), ostatnie odczyty AI, autostart, auto-zapis replayów, foldery, klucze osu! API |
| **Do zaprojektowania** | – | **Ustawienia** (sekcja 3.1), **Skoki i trener aimu** (3.2), **Biblioteka map** (3.3) |

### 3.1 Ustawienia (nowy ekran)

- **Klawisze** K1/K2 (kliknij pole i naciśnij klawisz), opcjonalnie przycisk myszy/tabletu.
- **Foldery:** folder osu!stable (domyślnie `%LOCALAPPDATA%\osu!`), folder danych lazera, folder archiwum replayów. Autowykrywanie stable i lazera.
- **Głośności** w trenerze: muzyka, metronom, hitsoundy (osobno).
- **Kalibracja opóźnienia** (sekcja 10): audio i obraz osobno, z testem stukania do metronomu.
- **Język** aplikacji (sekcja 16): domyślnie język systemu, zmiana od razu, bez restartu.
- **Wygląd:** rozmiar tekstu (80–150%), ograniczenie animacji.
- **Program:** autostart z Windows, plan dnia po starcie, zapisywanie faili.
- **AI i prywatność:** co udostępniać, z którym AI, eksport podsumowania.
- **Konto osu!:** połącz/rozłącz.

### 3.2 Skoki i trener aimu (nowy ekran)

- **Katalog typów skoków** rozpoznawanych automatycznie w mapach (sekcja 5.6): tam i z powrotem, trójkąty, kwadraty, gwiazdy, skoki przez ekran, ostre kąty (snap), rozwarte kąty (flow), zmienna odległość, skoki z nakładaniem nut, rozstawione streamy.
- Dla każdego typu: proste wyjaśnienie z rysunkiem, fragmenty z prawdziwych map z czasem, mapy z największym udziałem wzorca, poziom gracza w tym typie.
- **Trener aimu:** generuje wybrany typ w zadanym BPM, odległości i CS. Mierzy odległość od środka, overshoot/niedolot, kąt błędu i spóźnienie kliknięcia względem dolotu kursora (koordynacja aim–tap). Drabinka tempa jak w metronomie.

### 3.3 Biblioteka map (nowy ekran)

Filtrowanie bazy map po parametrach (gwiazdki, BPM, długość, AR/OD/CS, najdłuższy blok streamów, spacing streamów, liczba skoków, typy skoków, % nakładania nut). Przycisk „dobierz do fokusu” i „drabinka do mapy-celu”.

---

## 4. Roadmapa umiejętności

Na podstawie **osu! phd chart** autorstwa DigitalHypno (https://osu.ppy.sh/users/4384207, https://youtu.be/uc99yWeP1h4), przebudowana pod dzisiejsze mapy. Pełne dane (węzły, kolumny, powiązania, opisy dla początkujących, słowniczek) są w `roadmap/roadmap.json`.

**Zmiany względem oryginału**

- **Dodane:** koordynacja aim–tap, rozstawione streamy, snap aim (skoki), kontrola burstów, równość i alternate, rytm złożony (tech), reading przy AR, nakładające się nuty, długie mapy (marathon).
- **Poprawione:** flow aim nie prowadzi do streamingu (razem ze streamingiem i koordynacją daje rozstawione streamy); skupienie nie prowadzi do flow aim; kondycja prowadzi do długich map zamiast do nerwów; podstawy zasilają wszystkie filary, nie tylko reading.

**Kolumny:** Podstawy → Filary (Reading, Wyczucie rytmu, Tapping, Aim) → Kontrola → Umiejętności → Zaawansowane → Złożone (Streaming, Rozstawione streamy).

**Poziom w umiejętności:** `mocne` / `w porządku` / `do poprawy` / `brak danych`, liczony z metryk z sekcji 5 (progi do ustalenia na danych wielu graczy; na start porównanie z celami z planu i z rozkładem wyników gracza).

**Fokus:** gracz wybiera maks. 2 umiejętności. Plan dnia, trener, metronom i rekomendacje map dopasowują się do fokusu.

---

## 5. Metryki i algorytmy analizy

Wszystkie poniższe wzory były już używane w praktyce na mapach gracza (kod referencyjny: `analysis/`).

### 5.1 Podstawy z formatu osu!

- Promień kółka (osu!px): `r = 54.4 − 4.48 × CS`.
- Czas widoczności kółka (AR): AR > 5: `preempt = 1200 − 750 × (AR − 5) / 5` ms; AR < 5: `1200 + 600 × (5 − AR) / 5` ms (AR 9 = 600 ms, AR 10 = 450 ms).
- Okna oceny (OD): 300: `±(80 − 6 × OD)` ms, 100: `±(140 − 8 × OD)` ms, 50: `±(200 − 10 × OD)` ms.
- Rate Change / DT / HT skalują czas mapy (BPM × rate) i efektywne okna AR/OD.
- UR = `10 × odchylenie standardowe hit errorów` (ms).
- Gwiazdki: biblioteka `rosu-pp` (wersja JS/WASM albo Python `rosu-pp-py`).

### 5.2 Streamy (analiza mapy)

- Nuta należy do streamu, gdy odstęp do poprzedniej ≤ `1.15 × (beatLength / 4)` (1/4 przy lokalnym BPM, z uwzględnieniem zmian tempa).
- Stream = co najmniej 5 takich nut z rzędu. BPM streamu = `60000 / (4 × mediana odstępu)`.
- **Spacing** streamu = średnia odległość między kolejnymi nutami / średnica kółka (`2r`). 0,5 = nuty nachodzą na siebie, 1 = ledwo się stykają.
- **Blok streamów** = streamy rozdzielone przerwami krótszymi niż 1 s. Najdłuższy blok to główna miara wymagań staminy.
- Dodatkowo: łączny czas streamów, % obiektów w streamach, rozkład długości, czas w ćwiartkach mapy.

### 5.3 Skoki i czytanie (analiza mapy)

- Skok na 1/2: odstęp > 1/4 i ≤ 1/2 uderzenia. Duży skok: odległość > 1,5 średnicy kółka.
- Średnia odległość na 1/2 (w średnicach).
- **Nakładanie nut:** % nut, w których promieniu (odległość < 2r) pojawia się niesąsiednia nuta, zanim pierwsza zniknie (okno = preempt).
- Średnio widocznych obiektów naraz, liczba uderzeń widocznych do przodu = `preempt / beatLength`.

### 5.4 Replay (analiza gry)

- **Hit error** każdej nuty z dopasowania kliknięć (stan klawiszy w `.osr`) do obiektów, z uwzględnieniem offsetu i modów.
- **K1/K2:** osobne hit errory i UR dla każdego klawisza. Główna metryka palców: średnie spóźnienie K2 względem K1.
- **Równość tapnięć:** rozrzut odstępów między kolejnymi kliknięciami w streamach.
- **Złamania alternate:** dwa kliknięcia z rzędu tym samym klawiszem w streamie (na 1000 nut).
- **Wejście w burst:** hit error pierwszej nuty burstu, osobno dla startu z K1 i z K2.
- **Hit error wg typu nut:** pojedyncze, bursty, streamy, skoki (skoki także w przedziałach BPM: 200–220, 220–250, 250+).
- **Dolot kursora:** odległość kliknięcia od środka kółka (w promieniach, ze znakiem: ujemna = niedolot w kierunku skoku).
- **Overshoot / niedolot:** dla skoków, wg długości i kąta.
- **UR w czasie:** w ćwiartkach mapy i w oknach kroczących (zmęczenie).
- **Najdłuższy równy blok:** najdłuższy blok streamów zagrany bez wzrostu UR ponad próg.

### 5.5 Klasyfikacja missów

- **Aim – overshoot:** kliknięcie w rytm (|hit error| małe), kursor minął kółko w kierunku skoku.
- **Aim – niedolot:** kliknięcie w rytm, kursor zatrzymał się przed kółkiem.
- **Timing:** kursor w kółku, kliknięcie poza oknem 50.
- **Podwójne kliknięcie / złamanie alternate:** ten sam klawisz dwa razy, druga nuta „zjedzona”.
- **Pominięta nuta:** brak kliknięcia (np. zgubiony rytm, mindblock: stream 21 nut, 10 kliknięć).
- **Slider break, notelock:** z logiki gry.

### 5.6 Typy skoków (rozpoznawanie)

Na podstawie kolejnych wektorów ruchu (odległość, kąt między wektorami, rytm): tam i z powrotem (zawrót ~180°), trójkąty (powtarzalne ~120°), kwadraty (~90°), gwiazdy (ostre kąty), skoki przez ekran (odległość > ~4 średnic), snap (kąt ostry) i flow (kąt rozwarty, płynne łuki), zmienna odległość, skoki z nakładaniem nut. Progi do kalibracji na mapach.

### 5.7 Sesja

- Spadek formy w sesji: acc/UR kolejnych prób tej samej mapy. Reguła strażnika: **acc spada dwie próby z rzędu → koniec streamów, przerwa albo mapy skokowe**.
- Dzienne minuty streamów, pora dnia a wynik.

### 5.8 Gotowość do mapy-celu

Porównanie wymagań mapy (najdłuższy blok przy BPM, spacing, skoki przy BPM, AR, długość) z pomiarami gracza. Wynik: % gotowości w każdej umiejętności i lista braków.

---

## 6. Architektura i technologie

Autor zna aplikacje webowe (sprzed ~3–4 lat) i podstawy C++, więc całość w **TypeScript**.

Repozytorium: https://github.com/pixelmon770/Osu-Trainer

```
osu-trener/                (monorepo na GitHubie)
├─ apps/desktop/           Electron + React + Vite (UI z projektu)
├─ packages/analyzer/      wspólna analiza .osu/.osr (TS), testy na prawdziwych mapach
├─ functions/              Firebase Functions (logowanie osu!, MCP, synchronizacja)
├─ tools/map-dataset/      generator bazy map (osu! API + analyzer)
└─ docs/                   ten plik i reszta pakietu
```

- **Program na komputer:** Electron (autostart: `app.setLoginItemSettings`, ikona w zasobniku), lokalna baza **SQLite**, obserwowanie folderów replayów, Web Audio (metronom, trener) z kalibracją opóźnienia, lokalny serwer MCP dla AI na komputerze.
- **Języki:** `i18next` + `react-i18next`, pliki tłumaczeń w `apps/desktop/src/locales/<język>/<przestrzeń>.json` (sekcja 16).
- **Parsowanie:** gotowe biblioteki JS do `.osu`/`.osr` (np. `osu-parsers`) albo własny parser (format jest prosty, replay to dane skompresowane LZMA). Gwiazdki: `rosu-pp` (JS/WASM). Sprawdzić aktualne wersje bibliotek przed startem.
- **Serwer – Firebase:** Hosting (strona, adres zwrotny OAuth), Functions (wymiana kodu osu! na tokeny + wystawienie własnego tokenu Firebase, publiczny punkt MCP, synchronizacja), Firestore (konta, ustawienia, fokus, plan, podsumowania sesji), Storage (plik bazy map).
- **Baza map jako plik:** generator przelicza mapy rankingowe, publikuje plik (SQLite albo JSON), program pobiera go i filtruje lokalnie. Filtrowanie po wielu liczbach w Firestore byłoby niewygodne i drogie. Alternatywa: Supabase (Postgres) dla całości.
- **Replaye:** osu!stable zapisuje replaye ukończonych prób w `osu!/Data/r`, a wyeksportowane (F2) w `osu!/Replays`. Faile trzeba zapisać ręcznie (F2 na ekranie faila). Lazer trzyma dane we własnym formacie; najpewniej korzystać z eksportu replayów. Przed implementacją sprawdzić aktualne zachowanie obu klientów.

---

## 7. Logowanie przez osu! (OAuth)

- Rejestracja aplikacji: osu.ppy.sh → ustawienia konta → OAuth → „New OAuth Application”. Nazwa + **Application Callback URL**.
- Adres zwrotny musi się zgadzać **dokładnie** z tym w żądaniu. Dla wersji tylko lokalnej może to być `http://localhost:<port>/callback`. Dla wersji dla innych: adres na Firebase Hosting, np. `https://<projekt>.web.app/auth/callback`.
- Dwa tryby:
  - **Client credentials:** bez logowania gracza, tylko dane publiczne (profil, top plays, ostatnie wyniki, mapy).
  - **Authorization code:** logowanie gracza na stronie osu! (aplikacja nie widzi hasła). Potrzebne m.in. do **pobierania replayów z serwera** (endpoint pobierania replaya wymaga OAuth użytkownika). Zakresy: `public`, `identify`.
- Przepływ dla wersji dla innych: program otwiera przeglądarkę → osu! → callback na Firebase → Function wymienia kod na tokeny (sekret tylko na serwerze) → tworzy konto Firebase z custom tokenem → program dostaje sesję. Tokeny osu! odświeżane przez serwer.
- Dokumentacja: https://osu.ppy.sh/docs/index.html

---

## 8. Model danych

**SQLite (lokalnie):**

- `replays` (id, ścieżka, hash mapy, data, mody, rate, wynik, acc, missy, liczby 300/100/50, UR, czy fail)
- `replay_metrics` (replay_id, metryka, wartość, kontekst np. typ nut lub przedział BPM)
- `replay_events` (replay_id, czas, typ: miss_overshoot / miss_undershoot / miss_timing / alt_break / late_100…, szczegóły JSON)
- `maps` (beatmap_id, hash, metadane, cechy z sekcji 5.2–5.3 i 5.6)
- `sessions` (id, start, koniec, liczba prób, podsumowanie)
- `trainer_runs`, `metronome_runs` (ćwiczenie, BPM, UR, K2–K1, rozrzut, data)
- `weekly_tests` (tydzień, data, UR, setki, missy, acc, K2–K1, luz, uwagi)
- `settings`, `focus`, `plan_tasks`

**Firestore (serwer):** `users/{uid}` (osu id, nick, język, ustawienia udostępniania), `users/{uid}/summaries/*` (podsumowania sesji i metryk zaznaczone do udostępnienia), `users/{uid}/plan`, `users/{uid}/focus`.

---

## 9. AI i MCP

- **Lokalnie:** program uruchamia serwer MCP widoczny dla aplikacji AI na tym komputerze (np. Claude desktop).
- **Publicznie:** punkt MCP (HTTPS `/mcp`) w Firebase Functions z logowaniem kontem osu!, dzięki czemu każde AI obsługujące MCP widzi tylko dane zalogowanego gracza. ChatGPT obsługuje MCP w trybie deweloperskim (ograniczenia zależą od planu, w planach indywidualnych zwykle tylko odczyt, co wystarcza). Wymaga publicznego adresu HTTPS. Sprawdzić aktualne zasady przed wydaniem.
- **Narzędzia (tylko odczyt):** `get_profile`, `get_top_scores`, `get_sessions`, `get_replay_list`, `get_replay_analysis`, `get_metrics_trend`, `get_roadmap_levels`, `get_focus_and_plan`, `search_maps(filtry)`, `analyze_map(beatmap_id)`, `get_goal_readiness(beatmap_id)`.
- **Eksport dla AI:** przycisk kopiujący podsumowanie (statystyki, słabe punkty, ostatnie sesje) do wklejenia w dowolny czat.
- Gracz w ustawieniach wybiera, co udostępnia.
- Narzędzia MCP zwracają dane liczbowe i kody (np. `status: "slabe"`, `skill: "burst"`), a nie gotowe zdania, więc AI odpowiada w języku gracza. Eksport dla AI powstaje w języku wybranym w aplikacji.

---

## 10. Kalibracja opóźnienia i dźwięk

- **Audio:** gracz stuka do metronomu (np. 32 uderzenia). Średnie przesunięcie = opóźnienie dźwięku do kompensacji.
- **Obraz:** stuknięcie w momencie, gdy wskaźnik mija linię (bez dźwięku). Osobny offset.
- Po kalibracji: ostrzeżenie, jeśli gracz stale się spieszy lub spóźnia, z wyjaśnieniem, że to już technika, a nie sprzęt.
- Trener i metronom: Web Audio z planowaniem dźwięków z wyprzedzeniem (nie setInterval) dla stabilnego tempa, `latencyHint: "interactive"`.
- Czasy kliknięć z `event.timeStamp` (wysoka rozdzielczość).
- Zmiana tempa muzyki bez zmiany wysokości dźwięku (time-stretch) jako opcja; stary trener zmieniał wysokość jak nightcore.

---

## 11. Narzędzia treningowe – szczegóły

### Trener kliknięć (port starego `osu_rytm.py`)

Stary trener (Python/pygame, z wcześniejszego czatu): wybór mapy z folderu osu!, tryby (streamy z mapy, 1/4 do muzyki, własna gęstość, bursty z drabinką tempa, samo K2), pętla fragmentu, zmiana tempa, kalibracja, ocena 300/100/50/miss wg OD, hit error K1/K2, tablica wyników z wykresem postępu, pomijanie pustych fragmentów, poziome tory, przełącznik jednego/dwóch torów, edytor trybów, alternate ciągnięty przez całą mapę.

Poprawki czytelności (z projektu): jeden tor z kolorami palców domyślnie, siatka rytmu, początek burstu z licznikiem, stały rozmiar nut z automatyczną prędkością przewijania, okna oceny przy linii trafienia, hit error w dwóch rzędach, wskaźnik równości tapnięć, tryb skupienia, pętle tworzone z miejsc missów w replayach.

### Rytm i metronom – ćwiczenia (L = K1, P = K2, › = akcent)

| Ćwiczenie | Wzór | Tempo | Po co |
|---|---|---|---|
| Single stroke | ›L P L P L P L P | 150–180 | równy K2 |
| Double stroke | ›L L P P L L P P | 110–150 | wzmocnienie słabszego palca |
| Paradiddle | ›L P L L ›P L P P | 110–150 | zmiana palca w środku wzoru |
| Burst 5 od L | ›L P L P L · · · | 160–190 | wejście w burst na czas |
| Burst 5 od P | ›P L P L P · · · | 150–180 | start ze słabszego palca |
| Triplety (galop) | ›L P L · ›P L P · | 160–190 | krótkie serie |
| Triola 1/3 | ›L P L ›P L P | 140–170 | przejścia 1/4 ↔ 1/3 |
| Przesuwany akcent | akcent co 3 nuty | 140–170 | niezależność, luz |
| Samo P | ›P · P · P · P · | 150–180 | izolacja K2 |
| Stream z akcentem na takt | 16 nut | 160–188 | stamina |

### Pomysły do dodania

- Gotowość do mapy-celu (5.8).
- Pętle z replayów: miejsce missa → pętla w trenerze jednym kliknięciem.
- Strażnik zmęczenia i dzienny limit minut streamów.
- Kreator testu A/B sprzętu (np. rapid trigger: punkt zadziałania, czułość).
- Test startowy dla nowych graczy (~10 min) wyliczający wstępny poziom w roadmapie.
- Rozgrzewka dopasowana do gracza (krótka, poniżej limitu).
- Porównanie dwóch prób w analizatorze klatek (stara i nowa ścieżka kursora).
- Automatyczny test tygodniowy z wykresem postępu.

---

## 12. Dane referencyjne

Szczegóły w `data/`. Najważniejsze:

**Gracz parthmage (18.11.2026):** #77 870 globalnie (było #96 948 trzy miesiące wcześniej), PL #3 356, najlepszy #9 558 (2.08.2020), 5 711 pp, acc 97,95%, 59 367 zagrań, ~728 h, keyboard + tablet (Wooting UwU z rapid triggerem, kiedyś Cherry MX Speed Silver; Wacom). Top 100: średnio 6,02★, 190 BPM, 2:05, acc 97,27%, FC 49/100. Acc od 200 BPM 96,96% vs poniżej 97,50%; mapy od 3:00 97,40% vs poniżej 2:00 97,18%.

**Pomiary z replayów (październik 2026):** hit error pojedyncze nuty −3 do +5 ms (offset −14 ms jest dobry), bursty +27 ms, skoki +9,7 / +16 / +26,5 ms przy 200–220 / 220–250 / 250+ BPM, K2 później niż K1 o 10 ms (175 BPM) i 18,3 ms (streamy na DT), rozrzut odstępów 16 ms (NM) / 30 ms (DT), dolot −0,38 → −0,07 promienia, UR rośnie pod koniec map (~194 → 225–238).

**Diagnoza:** szybkość wystarcza (krótkie bursty 190–200 BPM), brakuje staminy na streamach (dziś ~17 s równego bloku, kiedyś 36 s), równego K2, wejścia w burst na czas i koordynacji aim–tap powyżej 220 BPM. Luz w ręce („sprężyna”) pojawia się tylko chwilami.

---

## 13. Etapy budowy

| Etap | Zakres | Gotowe, gdy |
|---|---|---|
| 0. Start | repo GitHub (monorepo), Node LTS, Firebase CLI, projekt Firebase, aplikacja OAuth w osu! | `npm run dev` otwiera pusty program; logowanie testowe działa lokalnie |
| 1. Analizator | `packages/analyzer`: parser .osu/.osr, metryki z sekcji 5, testy | liczby zgadzają się z `data/maps_analyzed.json` (np. HONESTY: blok 73 s, 185 BPM; Sidetracked Day: blok 36 s) |
| 2. Program | ekrany z projektu w React, SQLite, auto-zapis replayów, Ustawienia, kalibracja, i18n od pierwszego ekranu (PL + EN) | replay po próbie pojawia się w programie z analizą; żaden tekst nie jest wpisany na sztywno w komponencie |
| 3. Konto osu! | OAuth przez Firebase, profil i wyniki z API | Statystyki pokazują dane z API |
| 4. Trening | trener kliknięć, metronom, trener aimu, zakładka skoków | ćwiczenia zapisują wyniki i trafiają do statystyk |
| 5. AI | lokalny MCP, publiczny MCP, eksport dla AI | AI odpowiada na pytania o ostatnią sesję na prawdziwych danych |
| 6. Mapy i roadmapa | generator bazy map, Biblioteka map, poziomy w roadmapie, gotowość do map-celów, rekomendacje | rekomendacja dla fokusu zwraca sensowne mapy |
| 7. Wydanie | instalator, aktualizacje, strona do pobrania (wielojęzyczna), tłumaczenia fali 1 i 2 | znajomy instaluje i loguje się bez pomocy; aplikacja działa w co najmniej 6 językach |

---

## 14. Plan treningowy autora (6 tygodni, od 18.11.2026)

**Cel:** równe tappowanie 36-sekundowych bloków przy 188 BPM (poziom Sidetracked Day [Infinity Inside], dawny top 424 pp, 97,8%). Mierzalnie: K2–K1 < 5 ms przy 160 BPM; < 3% setek na stream practice przy 170 BPM; blok od 4:14 na Sidetracked Day na 1,0x bez wzrostu UR w drugiej połowie.

**Start:** test A/B Wootinga (obecne ustawienie vs punkt zadziałania ~1,2 mm i rapid trigger 0,4–0,5 mm), Bluenation 0,85x, 3+3 próby; podkładka pod nadgarstek ~2–2,5 cm; ustawienia zamrożone na 4 tygodnie.

**Sesja (do 45 min: ~30 min treningu + wolne granie):** rozgrzewka 5 min (jedna mapa na 0,85x) → technika 10–15 min (streamy w tempie etapu, K2 i start burstu, luz) → stamina ~10 min (w dni staminy) → wolne granie (maks. 3–5 prób na mapach streamowych). Stop przy spadku acc dwa razy z rzędu.

**Tydzień:** pon/śr/pt: technika + stamina; wt: technika; czw: lżej; sob: wolne; **nd: test** (Sidetracked Day 0,9x z No Fail, 2 próby).

**Progresja:** tyg. 1–2: technika 150–155 BPM, stamina Lionheart/Dragonflame 0,85x · tyg. 3–4: technika 160–165, stamina Sidetracked Day 0,85x · tyg. 5–6: technika 170–175, Sidetracked 0,9 → 0,95 → 1,0x. Potem HONESTY 0,8–0,85x.

**Poza osu!:** codziennie metronom 2×2 min, unoszenie palców, napnij-puść, rozciąganie po pracy; wt/pt gumka, lekki grip, nadgarstek z butelką.

**Cele długoterminowe i drabinki:**
- Ata – Euphoria [Ultimate Power] 8,24★ (deathstream 357 nut ~28 s przy 190 BPM): [Bliss] 6,59★ → plan staminy → Blue Zenith → [Ultimate Power] od 0,8x.
- Imperial Circus Dead Decadence – Yomi yori… [Kyouaku] 8,92★ (8:04, 221 BPM, stream 145 nut, 692 skoki): [Reverberation] 7,44★ → [Kurushimi] 8,52★ → [Kyouaku].
- DragonForce – Astral Empire [Break of Dawn] 9,18★ (224 BPM, OD 10, spacing streamów 0,99): [Reaching Into Infinity] 8,36★ → [Break of Dawn].

---

## 15. Zawartość pakietu

| Plik | Co to jest |
|---|---|
| `SPEC.md` | ten dokument |
| `START_PROMPT.md` | prompt do wklejenia w nowym czacie |
| `roadmap/roadmap.json` | węzły, kolumny, wiersze, kolory grup, powiązania, opisy, słowniczek, źródło |
| `data/player_parthmage.json` | profil, historia rankingu 90 dni, statystyki top 100, pomiary z replayów |
| `data/maps_analyzed.json` | wyniki analiz map (streamy, bloki, spacing, skoki, nakładanie) |
| `data/training_maps.json` | mapy treningowe pogrupowane według rodzaju streamów |
| `analysis/analyze_map.py` | referencyjny analizator streamów w Pythonie |
| `analysis/analyze_map.js` | ta sama analiza plus skoki i nakładanie nut w JavaScript |
| `design/*.dc.html`, `design/canvas.json` | pliki projektu interfejsu (format płótna Claude Design; HTML z szablonami `{{…}}` i klasą `Component`, poza tym narzędziem nie uruchomią się samodzielnie, ale układ, style, kolory, teksty i logika są gotowe do przeniesienia do React) |

## 16. Języki (i18n)

Aplikacja ma trafić do graczy z różnych krajów, więc jest wielojęzyczna od pierwszego ekranu.

**Języki**

| Fala | Języki | Kiedy |
|---|---|---|
| 1 | English (język bazowy i zapasowy), Polski | od etapu 2 |
| 2 | Deutsch, Español, Português (Brasil), Français, Русский | przed wydaniem (etap 7) |
| 3 | 日本語, 한국어, 简体中文, 繁體中文, Bahasa Indonesia, Tiếng Việt, Українська | po wydaniu, zależnie od zainteresowania |

Lista do weryfikacji: przed falą 2 i 3 sprawdzić, z jakich krajów jest najwięcej użytkowników aplikacji (statystyki pobrań lub logowań), i według tego ustalić kolejność.

**Zasady**

- **Klucze tłumaczeń po angielsku**, teksty w plikach JSON, żaden tekst wpisany na sztywno w komponencie. Przestrzenie: `common`, `nav`, `dashboard`, `stats`, `roadmap`, `glossary`, `exercises`, `trainer`, `analyzer`, `settings`, `ai`.
- **Język bazowy: angielski.** Polski jest pełny od początku. Brakujący klucz w danym języku pokazuje się po angielsku.
- **Terminy osu! zostają po angielsku we wszystkich językach** (stream, burst, AR, OD, CS, UR, flow aim, snap aim, alternate, spacing, Rate Change), bo tak mówią gracze i tak jest w grze. Wyjaśnienie terminu jest tłumaczone. Słowniczek pokazuje termin i opis w języku gracza.
- **Liczby, daty i jednostki** przez `Intl` (przecinek albo kropka dziesiętna, format daty, „ms”, „%”).
- **Liczba mnoga** według reguł języka (np. polskie „1 próba / 2 próby / 5 prób”) przez mechanizm liczby mnogiej i18next.
- **Długość tekstów:** niemiecki i francuski bywają o ~30% dłuższe. Przyciski i karty zawijają tekst, a karty w diagramie roadmapy mają rozmiar liczony dla najdłuższej etykiety w danym języku.
- **Czcionki:** Inter nie ma znaków japońskich, koreańskich i chińskich. Dla tych języków fallback na Noto Sans JP/KR/SC/TC.
- **Opisy w roadmapie** (co to jest, dlaczego ważne, jak ćwiczyć) to najdłuższe teksty. Trzymać je w osobnej przestrzeni `roadmap`, żeby tłumacze mogli pracować nad nimi osobno.
- **Proces tłumaczenia:** pierwsza wersja przy pomocy AI, potem sprawdzenie przez graczy znających dany język (pull requesty na GitHubie albo darmowa platforma tłumaczeń dla projektów open source). W ustawieniach przy każdym języku procent przetłumaczenia.
- **Wybór języka:** przy pierwszym uruchomieniu język systemu (jeśli jest dostępny), zmiana w Ustawieniach działa od razu. Wybór zapisany lokalnie i na koncie.
- **Strona do pobrania** w tych samych językach co aplikacja.

## 17. Linki

- osu! API v2: https://osu.ppy.sh/docs/index.html
- osu! phd chart (DigitalHypno): https://osu.ppy.sh/users/4384207 · https://youtu.be/uc99yWeP1h4
- osu!Skills (inny podział umiejętności): https://osuskills.com
- ChatGPT i MCP (tryb deweloperski): https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt
