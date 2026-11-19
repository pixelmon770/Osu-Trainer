import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Błąd na jednym ekranie nie wyłącza całego programu: pokazujemy opis i drogę powrotu. */
class Boundary extends Component<{ children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('Błąd ekranu:', error);
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error, () => this.setState({ error: null })) : this.props.children;
  }
}

export default function ErrorBoundary({ children, onHome }: { children: ReactNode; onHome: () => void }) {
  const { t } = useTranslation();
  return (
    <Boundary
      fallback={(error, reset) => (
        <div className="screen">
          <div className="card error-screen">
            <h2>{t('error.title')}</h2>
            <p className="muted">{t('error.body')}</p>
            <pre className="code">{String(error?.stack ?? error).slice(0, 1200)}</pre>
            <div className="row">
              <button type="button" className="btn primary" onClick={reset}>
                {t('error.retry')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  reset();
                  onHome();
                }}
              >
                {t('error.home')}
              </button>
            </div>
          </div>
        </div>
      )}
    >
      {children}
    </Boundary>
  );
}
