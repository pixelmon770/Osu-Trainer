import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { makeFormatters } from './format.ts';
import type { ReplaySummary } from '../../shared/api.ts';
import Sidebar, { type ScreenId } from './components/Sidebar.tsx';
import Toasts, { type Toast } from './components/Toasts.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import Dashboard from './screens/Dashboard.tsx';
import MapAnalysis from './screens/MapAnalysis.tsx';
import Placeholder from './screens/Placeholder.tsx';
import ReplayScreen from './screens/ReplayScreen.tsx';
import SettingsScreen from './screens/SettingsScreen.tsx';
import StatsScreen, { type OpenMap } from './screens/StatsScreen.tsx';
import RhythmScreen from './screens/RhythmScreen.tsx';
import TrainerScreen from './screens/TrainerScreen.tsx';
import SessionsScreen from './screens/SessionsScreen.tsx';
import FrameAnalyzerScreen from './screens/FrameAnalyzerScreen.tsx';
import AiScreen from './screens/AiScreen.tsx';
import RoadmapScreen from './screens/RoadmapScreen.tsx';
import GoalsScreen from './screens/GoalsScreen.tsx';
import PlanScreen from './screens/PlanScreen.tsx';
import AimScreen from './screens/AimScreen.tsx';
import LibraryScreen from './screens/LibraryScreen.tsx';
import type { Recommendation } from '../../shared/api.ts';

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('dashboard');
  const [openReplayId, setOpenReplayId] = useState<string | null>(null);
  const [openMap, setOpenMap] = useState<OpenMap | null>(null);
  const [preset, setPreset] = useState<Recommendation | null>(null);
  const [frameId, setFrameId] = useState<string | null>(null);
  const [libraryMap, setLibraryMap] = useState<{ md5: string; to: 'analysis' | 'trainer' } | null>(null);
  const openReplay = (id: string) => {
    setOpenReplayId(id);
    setScreen('replays');
  };
  const [latest, setLatest] = useState<ReplaySummary | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { t, i18n } = useTranslation();

  const push = (toast: Omit<Toast, 'id'>) =>
    setToasts((list) => [...list.slice(-3), { ...toast, id: Date.now() + Math.random(), createdAt: Date.now() }]);

  useEffect(() => {
    const f = makeFormatters(i18n.language);
    const offAdded = window.api.onReplayAdded((s) => {
      setLatest(s);
      const openThis = () => {
        setOpenReplayId(s.id);
        setScreen('replays');
      };
      setToasts((list) => {
        // kilka replayów w krótkim czasie = jedno powiadomienie z licznikiem
        const recent = list.find((x) => x.group === 'replays' && Date.now() - (x.createdAt ?? 0) < 10_000);
        if (recent) {
          const count = (recent.count ?? 1) + 1;
          return list.map((x) =>
            x === recent
              ? {
                  ...x,
                  count,
                  title: t('toast.newReplays', { count }),
                  body: t('toast.newest', { map: `${s.title} [${s.version}]` }),
                  action: { label: t('toast.open'), run: openThis }
                }
              : x
          );
        }
        return [
          ...list.slice(-3),
          {
            id: Date.now() + Math.random(),
            createdAt: Date.now(),
            group: 'replays',
            count: 1,
            tone: 'info',
            title: t('toast.newReplay'),
            body: `${s.title} [${s.version}] · ${f.num(s.accuracy, 2)}% · UR ${f.num(s.ur)}`,
            action: { label: t('toast.open'), run: openThis }
          }
        ];
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
      content = (
        <Dashboard
          onOpen={setScreen}
          onOpenReplay={openReplay}
          onStartRecommendation={(r) => {
            setPreset(r);
            setScreen(r.screen === 'rhythm' ? 'rhythm' : 'tapTrainer');
          }}
        />
      );
      break;
    case 'mapAnalysis':
      content = (
        <MapAnalysis md5={libraryMap?.to === 'analysis' ? libraryMap.md5 : null} onUsed={() => setLibraryMap(null)} />
      );
      break;
    case 'mapLibrary':
      content = (
        <LibraryScreen
          onAnalyze={(md5) => {
            setLibraryMap({ md5, to: 'analysis' });
            setScreen('mapAnalysis');
          }}
          onTrain={(md5) => {
            setLibraryMap({ md5, to: 'trainer' });
            setScreen('tapTrainer');
          }}
          onOpenPlays={(m) => {
            setOpenMap(m);
            setScreen('replays');
          }}
        />
      );
      break;
    case 'replays':
      content = (
        <ReplayScreen
          openId={openReplayId}
          onOpened={() => setOpenReplayId(null)}
          openMap={openMap}
          onMapOpened={() => setOpenMap(null)}
          latest={latest}
          onOpenFrames={(id) => {
            setFrameId(id);
            setScreen('frameAnalyzer');
          }}
        />
      );
      break;
    case 'stats':
      content = (
        <StatsScreen
          onOpenMap={(m) => {
            setOpenMap(m);
            setScreen('replays');
          }}
        />
      );
      break;
    case 'settings':
      content = <SettingsScreen />;
      break;
    case 'rhythm':
      content = <RhythmScreen preset={preset?.screen === 'rhythm' ? preset : null} onPresetUsed={() => setPreset(null)} />;
      break;
    case 'tapTrainer':
      content = (
        <TrainerScreen
          preset={preset?.screen === 'trainer' ? preset : null}
          onPresetUsed={() => setPreset(null)}
          mapMd5={libraryMap?.to === 'trainer' ? libraryMap.md5 : null}
          onMapUsed={() => setLibraryMap(null)}
        />
      );
      break;
    case 'frameAnalyzer':
      content = <FrameAnalyzerScreen openId={frameId} onOpened={() => setFrameId(null)} />;
      break;
    case 'aimTrainer':
      content = <AimScreen />;
      break;
    case 'goals':
      content = <GoalsScreen />;
      break;
    case 'plan':
      content = (
        <PlanScreen
          onStartRecommendation={(r) => {
            setPreset(r);
            setScreen(r.screen === 'rhythm' ? 'rhythm' : 'tapTrainer');
          }}
        />
      );
      break;
    case 'roadmap':
      content = <RoadmapScreen />;
      break;
    case 'ai':
      content = <AiScreen />;
      break;
    case 'sessions':
      content = <SessionsScreen onOpenReplay={openReplay} />;
      break;
    default:
      content = <Placeholder title={t('common.comingSoon')} />;
  }

  return (
    <div className="app">
      <Sidebar current={screen} onSelect={setScreen} />
      <main className="content" key={screen}>
        <ErrorBoundary onHome={() => setScreen('dashboard')}>{content}</ErrorBoundary>
      </main>
      <Toasts toasts={toasts} onClose={(id) => setToasts((list) => list.filter((x) => x.id !== id))} />
    </div>
  );
}
