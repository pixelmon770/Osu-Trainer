// Kilka tekstów potrzebnych w procesie głównym (powiadomienia systemowe).
// Reszta tłumaczeń jest w interfejsie (src/renderer/src/locales).

const TEXTS = {
  en: {
    newReplay: 'New replay analyzed',
    replayBody: '{map} · {acc}% · UR {ur}',
    failedTitle: 'Could not analyze a replay',
    mapNotFound: 'Map not found for {file}. Open it on the Replays screen to choose the map.'
  },
  pl: {
    newReplay: 'Nowy replay przeanalizowany',
    replayBody: '{map} · {acc}% · UR {ur}',
    failedTitle: 'Nie udało się przeanalizować replaya',
    mapNotFound: 'Nie znaleziono mapy dla {file}. Otwórz go na ekranie Replaye, żeby wskazać mapę.'
  }
} as const;

export function text(language: string, key: keyof (typeof TEXTS)['en'], vars: Record<string, string> = {}): string {
  const lang = language in TEXTS ? (language as keyof typeof TEXTS) : 'en';
  return TEXTS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}
