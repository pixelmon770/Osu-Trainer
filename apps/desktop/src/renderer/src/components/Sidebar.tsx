import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type LanguageCode } from '../i18n.ts';

// Kolejność i nazwy jak w projekcie (docs/design/Main.dc.html) + nowe ekrany z SPEC.md, sekcja 3.
const SECTIONS = [
  { title: 'nav.sectionTrain', items: ['dashboard', 'stats', 'roadmap', 'replays', 'frameAnalyzer', 'tapTrainer', 'aimTrainer', 'rhythm'] },
  { title: 'nav.sectionPlan', items: ['mapAnalysis', 'mapLibrary', 'sessions', 'plan', 'goals'] },
  { title: 'nav.sectionApp', items: ['ai', 'settings'] }
] as const;

export type ScreenId = (typeof SECTIONS)[number]['items'][number];

const READY: ReadonlySet<ScreenId> = new Set(['dashboard', 'stats', 'mapAnalysis', 'replays', 'tapTrainer', 'rhythm', 'settings']);

interface Props {
  current: ScreenId;
  onSelect: (id: ScreenId) => void;
}

export default function Sidebar({ current, onSelect }: Props) {
  const { t, i18n } = useTranslation();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo" aria-hidden>
          o!
        </div>
        <div>
          <div className="brand-name">{t('app.name')}</div>
          <div className="brand-tag">{t('app.tagline')}</div>
        </div>
      </div>

      <nav className="nav">
        {SECTIONS.map((section) => (
          <div key={section.title} className="nav-section">
            <div className="nav-title">{t(section.title)}</div>
            {section.items.map((id) => (
              <button
                key={id}
                type="button"
                className={`nav-link${current === id ? ' active' : ''}${READY.has(id) ? '' : ' soon'}`}
                onClick={() => onSelect(id)}
              >
                <span className="nav-dot" aria-hidden />
                {t(`nav.${id}`)}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <label className="lang">
        <span>{t('common.language')}</span>
        <select value={i18n.resolvedLanguage} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}
