import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type LanguageCode } from '../i18n.ts';

// Kolejność i nazwy jak w projekcie (docs/design/Main.dc.html) + nowe ekrany z SPEC.md, sekcja 3.
const SECTIONS = [
  { title: 'nav.sectionTrain', items: ['dashboard', 'stats', 'roadmap', 'replays', 'frameAnalyzer', 'tapTrainer', 'aimTrainer', 'rhythm'] },
  { title: 'nav.sectionPlan', items: ['mapAnalysis', 'mapLibrary', 'sessions', 'plan', 'goals'] },
  { title: 'nav.sectionApp', items: ['ai', 'settings'] }
] as const;

export type ScreenId = (typeof SECTIONS)[number]['items'][number];

// Ikony 24×24, obrys w kolorze tekstu (jak w projekcie)
const ICONS: Record<ScreenId, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  stats: (
    <>
      <line x1="6" y1="20" x2="6" y2="12" />
      <line x1="12" y1="20" x2="12" y2="5" />
      <line x1="18" y1="20" x2="18" y2="9" />
    </>
  ),
  roadmap: (
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M7 6h10M6 8l5 8M18 8l-5 8" />
    </>
  ),
  replays: <polygon points="7 4 19 12 7 20 7 4" />,
  frameAnalyzer: (
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="9" y1="9" x2="9" y2="13" />
      <line x1="15" y1="9" x2="15" y2="13" />
    </>
  ),
  tapTrainer: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <circle cx="8" cy="12" r="1.5" />
      <circle cx="13" cy="12" r="1.5" />
      <line x1="17" y1="10" x2="17" y2="14" />
    </>
  ),
  aimTrainer: (
    <>
      <circle cx="12" cy="12" r="8" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </>
  ),
  rhythm: (
    <>
      <path d="M9 21l3-18 3 18" />
      <line x1="7" y1="15" x2="17" y2="15" />
      <line x1="12" y1="9" x2="17" y2="5" />
    </>
  ),
  mapAnalysis: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </>
  ),
  mapLibrary: <path d="M4 5h16M4 12h16M4 19h10" />,
  sessions: <polyline points="3 17 9 11 13 15 21 7" />,
  plan: <polyline points="4 12 9 17 20 6" />,
  goals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  ai: (
    <>
      <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
    </>
  )
};

export function Icon({ id }: { id: ScreenId }) {
  return (
    <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[id]}
    </svg>
  );
}

interface Props {
  current: ScreenId;
  onSelect: (id: ScreenId) => void;
}

export default function Sidebar({ current, onSelect }: Props) {
  const { t, i18n } = useTranslation();
  const [player, setPlayer] = useState<string | null>(null);
  const [auto, setAuto] = useState<boolean | null>(null);

  // nazwa gracza z osu!.db i stan auto-analizy; odświeżane przy zmianie ekranu (np. po wyjściu z Ustawień)
  useEffect(() => {
    void window.api
      .getSettings()
      .then((s) => {
        setPlayer(s.osuDb?.player || null);
        setAuto(s.settings.autoAnalyze);
      })
      .catch(() => undefined);
  }, [current]);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16171a" strokeWidth="2.2">
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-name">{t('app.name')}</div>
          <div className="brand-tag">{player ?? t('app.tagline')}</div>
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
                className={`nav-link${current === id ? ' active' : ''}`}
                aria-current={current === id ? 'page' : undefined}
                onClick={() => onSelect(id)}
              >
                <Icon id={id} />
                {t(`nav.${id}`)}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        {auto !== null && (
          <button type="button" className="auto-status" onClick={() => onSelect('settings')}>
            <span className={`status-dot${auto ? ' on' : ''}`} aria-hidden />
            {auto ? t('app.autoOn') : t('app.autoOff')}
          </button>
        )}
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
      </div>
    </aside>
  );
}
