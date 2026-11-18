import { useTranslation } from 'react-i18next';
import type { ScreenId } from '../components/Sidebar.tsx';

export default function Dashboard({ onOpen }: { onOpen: (screen: ScreenId) => void }) {
  const { t } = useTranslation();
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>{t('dashboard.title')}</h1>
        <p className="muted">{t('dashboard.subtitle')}</p>
      </header>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => onOpen('replays')}>
          {t('dashboard.openReplay')}
        </button>
        <button type="button" className="btn" onClick={() => onOpen('mapAnalysis')}>
          {t('dashboard.openAnalyzer')}
        </button>
      </div>
    </div>
  );
}
