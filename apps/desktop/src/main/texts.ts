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
  },
  de: {
    newReplay: 'Neues Replay analysiert',
    replayBody: '{map} · {acc}% · UR {ur}',
    failedTitle: 'Replay konnte nicht analysiert werden',
    mapNotFound: 'Map für {file} nicht gefunden. Öffne es auf dem Replays-Bildschirm, um die Map zu wählen.'
  },
  es: {
    newReplay: 'Nuevo replay analizado',
    replayBody: '{map} · {acc}% · UR {ur}',
    failedTitle: 'No se pudo analizar un replay',
    mapNotFound: 'No se encontró el mapa de {file}. Ábrelo en la pantalla Replays para elegir el mapa.'
  },
  fr: {
    newReplay: 'Nouveau replay analysé',
    replayBody: '{map} · {acc} % · UR {ur}',
    failedTitle: "Impossible d'analyser un replay",
    mapNotFound: "Map introuvable pour {file}. Ouvre-le sur l'écran Replays pour choisir la map."
  },
  'pt-BR': {
    newReplay: 'Novo replay analisado',
    replayBody: '{map} · {acc}% · UR {ur}',
    failedTitle: 'Não foi possível analisar um replay',
    mapNotFound: 'Mapa não encontrado para {file}. Abra-o na tela Replays para escolher o mapa.'
  },
  ru: {
    newReplay: 'Новый реплей проанализирован',
    replayBody: '{map} · {acc}% · UR {ur}',
    failedTitle: 'Не удалось проанализировать реплей',
    mapNotFound: 'Карта для {file} не найдена. Открой его на экране Реплеи, чтобы выбрать карту.'
  }
} as const;

export function text(language: string, key: keyof (typeof TEXTS)['en'], vars: Record<string, string> = {}): string {
  const lang = language in TEXTS ? (language as keyof typeof TEXTS) : 'en';
  return TEXTS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}
