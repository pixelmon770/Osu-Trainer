# Projekt interfejsu osu! Trener

Pliki z płótna Claude Design (format `.dc.html`). Każdy plik to jeden ekran:

| Plik | Ekran |
|---|---|
| Main.dc.html | Pulpit |
| Statystyki.dc.html | Statystyki |
| Roadmapa.dc.html | Roadmapa umiejętności (diagram, opisy, fokus, słowniczek) |
| Replay.dc.html | Replaye i analizy |
| Analizator.dc.html | Analizator klatek |
| Trener.dc.html | Trener kliknięć |
| Rytm.dc.html | Rytm i metronom (działający metronom na Web Audio) |
| Polaczenie.dc.html | Połączenie z AI i ustawienia |
| canvas.json | układ ekranów na płótnie |

## Jak z nich korzystać

Pliki nie uruchomią się samodzielnie w przeglądarce: używają szablonów `{{nazwa}}`, pętli `<sc-for>`, warunków `<sc-if>` i klasy `Component` z metodą `renderVals()`, które obsługuje runtime narzędzia Claude Design. Przy przenoszeniu do React:

- markup między `<x-dc>` a `</x-dc>` to JSX-owy szkielet ekranu (style są inline, łatwo zamienić na CSS modules lub Tailwind),
- `{{x}}` to wartości z `renderVals()`, `<sc-for list="{{items}}" as="item">` to `items.map(item => …)`, `<sc-if value="{{c}}">` to `{c && …}`,
- logika w `renderVals()` (np. metronom w `Rytm.dc.html`, przewijanie klatek w `Analizator.dc.html`, podświetlanie powiązań w `Roadmapa.dc.html`) przenosi się do komponentu React prawie bez zmian,
- wspólne style: tło `#0f1012`, karty `#1b1c20`, obramowania `#2a2c31`, akcent `#c9b8ff`, K1 `#8fb3ff`, K2 `#f5b27a`, font Inter, efekty hover w `<helmet><style>` każdego pliku.

Dane w ekranach to prawdziwe dane gracza parthmage z 18.11.2026, poza miejscami oznaczonymi jako przykładowe (analizator klatek, liczby na żywo w trenerze).
