import { useTranslation } from 'react-i18next';

export default function Dashboard({ onOpenAnalyzer }: { onOpenAnalyzer: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>{t('dashboard.title')}</h1>
        <p className="muted">{t('dashboard.subtitle')}</p>
      </header>
      <button type="button" className="btn primary" onClick={onOpenAnalyzer}>
        {t('dashboard.openAnalyzer')}
      </button>
    </div>
  );
}
