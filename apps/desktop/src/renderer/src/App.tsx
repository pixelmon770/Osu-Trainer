import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { makeFormatters } from './format.ts';
import type { ReplaySummary } from '../../shared/api.ts';
import Sidebar, { type ScreenId } from './components/Sidebar.tsx';
import Toasts, { type Toast } from './components/Toasts.tsx';
import Dashboard from './screens/Dashboard.tsx';
import MapAnalysis from './screens/MapAnalysis.tsx';
import Placeholder from './screens/Placeholder.tsx';
import ReplayScreen from './screens/ReplayScreen.tsx';
import SettingsScreen from './screens/SettingsScreen.tsx';

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('dashboard');
  const [openReplayId, setOpenReplayId] = useState<string | null>(null);
  const [latest, setLatest] = useState<ReplaySummary | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { t, i18n } = useTranslation();

  const push = (toast: Omit<Toast, 'id'>) => setToasts((list) => [...list.slice(-3), { ...toast, id: Date.now() + Math.random() }]);

  useEffect(() => {
    const f = makeFormatters(i18n.language);
    const offAdded = window.api.onReplayAdded((s) => {
      setLatest(s);
      push({
        tone: 'info',
        title: t('toast.newReplay'),
        body: `${s.title} [${s.version}] · ${f.num(s.accuracy, 2)}% · UR ${f.num(s.ur)}`,
        action: {
          label: t('toast.open'),
          run: () => {
            setOpenReplayId(s.id);
            setScreen('replays');
          }
        }
      });
    });
    const offFailed = window.api.onReplayFailed((info) => {
      const name = info.file.split(/[\\/]/).pop() ?? info.file;
      push({
        tone: 'warn',
        title: t('toast.replayFailed'),
        body: info.error === 'map-not-found' ? t('toast.mapNotFound', { file: name }) : `${name}: ${info.error}`
      });
    });
    return () => {
      offAdded();
      offFailed();
    };
  }, [t, i18n.language]);

  let content;
  switch (screen) {
    case 'dashboard':
      content = <Dashboard onOpen={setScreen} />;
      break;
    case 'mapAnalysis':
      content = <MapAnalysis />;
      break;
    case 'replays':
      content = <ReplayScreen openId={openReplayId} onOpened={() => setOpenReplayId(null)} latest={latest} />;
      break;
    case 'settings':
      content = <SettingsScreen />;
      break;
    default:
      content = <Placeholder title={t(`nav.${screen}`)} />;
  }

  return (
    <div className="app">
      <Sidebar current={screen} onSelect={setScreen} />
      <main className="content" key={screen}>
        {content}
      </main>
      <Toasts toasts={toasts} onClose={(id) => setToasts((list) => list.filter((x) => x.id !== id))} />
    </div>
  );
}
