import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Sidebar, { type ScreenId } from './components/Sidebar.tsx';
import Dashboard from './screens/Dashboard.tsx';
import MapAnalysis from './screens/MapAnalysis.tsx';
import Placeholder from './screens/Placeholder.tsx';
import ReplayScreen from './screens/ReplayScreen.tsx';

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('dashboard');
  const { t } = useTranslation();

  let content;
  switch (screen) {
    case 'dashboard':
      content = <Dashboard onOpen={setScreen} />;
      break;
    case 'mapAnalysis':
      content = <MapAnalysis />;
      break;
    case 'replays':
      content = <ReplayScreen />;
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
    </div>
  );
}
