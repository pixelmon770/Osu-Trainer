// Tłumaczenia (SPEC.md, sekcja 16). Angielski jest językiem bazowym i zapasowym:
// jeśli w danym języku brakuje tekstu, pokaże się wersja angielska.
// Nowy język = nowy folder w locales/ + wpis w LANGUAGES poniżej.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json';
import pl from './locales/pl/translation.json';

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'pl', name: 'Polski' }
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
  const system = navigator.language.toLowerCase().split('-')[0];
  return LANGUAGES.find((l) => l.code === system)?.code ?? 'en';
}

export function setLanguage(code: LanguageCode): void {
  void i18n.changeLanguage(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignorujemy – język zostanie tylko do zamknięcia programu
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pl: { translation: pl } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false } // React sam zabezpiecza tekst
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export default i18n;
