// Tłumaczenia (SPEC.md, sekcja 16). Angielski jest językiem bazowym i zapasowym:
// jeśli w danym języku brakuje tekstu, pokaże się wersja angielska.
// Nowy język = nowy folder w locales/ + wpis w LANGUAGES poniżej.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json';
import pl from './locales/pl/translation.json';
import de from './locales/de/translation.json';
import es from './locales/es/translation.json';
import fr from './locales/fr/translation.json';
import ptBR from './locales/pt-BR/translation.json';
import ru from './locales/ru/translation.json';

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'pl', name: 'Polski' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'ru', name: 'Русский' }
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'osu-trainer.language';

function initialLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved as LanguageCode;
  } catch {
    // brak dostępu do pamięci – zostaje język systemu
  }
  // najpierw pełny kod (pt-BR), potem sam język (pt-PT → pt-BR, de-AT → de)
  const system = navigator.language.toLowerCase();
  const exact = LANGUAGES.find((l) => l.code.toLowerCase() === system);
  if (exact) return exact.code;
  const base = system.split('-')[0];
  return LANGUAGES.find((l) => l.code.toLowerCase().split('-')[0] === base)?.code ?? 'en';
}

/** Proces główny też musi znać język (powiadomienia systemowe). */
function syncToMain(code: string): void {
  void window.api?.updateSettings({ language: code }).catch(() => undefined);
}

export function setLanguage(code: LanguageCode): void {
  void i18n.changeLanguage(code);
  syncToMain(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignorujemy – język zostanie tylko do zamknięcia programu
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    pl: { translation: pl },
    de: { translation: de },
    es: { translation: es },
    fr: { translation: fr },
    'pt-BR': { translation: ptBR },
    ru: { translation: ru }
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false } // React sam zabezpiecza tekst
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;
syncToMain(i18n.language);

export default i18n;
