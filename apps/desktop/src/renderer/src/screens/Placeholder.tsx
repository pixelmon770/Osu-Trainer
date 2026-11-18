import { useTranslation } from 'react-i18next';

export default function Placeholder({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>{title}</h1>
      </header>
      <div className="card soon-card">
        <div className="pill">{t('common.comingSoon')}</div>
        <p className="muted">{t('common.comingSoonBody')}</p>
      </div>
    </div>
  );
}
