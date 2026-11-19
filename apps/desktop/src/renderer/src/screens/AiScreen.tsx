import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { McpInfo } from '../../../shared/api.ts';

export default function AiScreen() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [details, setDetails] = useState(2);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [mcp, setMcp] = useState<McpInfo | null>(null);
  const [mcpNote, setMcpNote] = useState<string | null>(null);

  useEffect(() => {
    void window.api.mcpInfo().then(setMcp);
  }, []);

  async function generate() {
    setBusy(true);
    setNote(null);
    try {
      setText(await window.api.aiExport({ days, replays: 15, details }));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, details]);

  const copy = async (value: string, done: (s: string) => void) => {
    await window.api.copyText(value);
    done(t('ai.copied'));
  };

  return (
    <div className="screen ai">
      <header className="screen-head">
        <h1>{t('ai.title')}</h1>
        <p className="muted">{t('ai.subtitle')}</p>
      </header>

      <section className="card settings-section">
        <h3>{t('ai.export.title')}</h3>
        <p className="muted small">{t('ai.export.hint')}</p>
        <div className="controls-row">
          <label className="field">
            <span>{t('replay.filter.period')}</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[7, 14, 30, 90, 365].map((d) => (
                <option key={d} value={d}>
                  {t('stats.days', { count: d })}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('ai.export.details')}</span>
            <select value={details} onChange={(e) => setDetails(Number(e.target.value))}>
              {[0, 1, 2, 3, 5].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn primary" disabled={busy || !text} onClick={() => void copy(text, setNote)}>
            {t('ai.export.copy')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !text}
            onClick={async () => {
              const path = await window.api.saveText(text, `osu-trener-${new Date().toISOString().slice(0, 10)}.md`);
              if (path) setNote(t('ai.saved', { path }));
            }}
          >
            {t('ai.export.save')}
          </button>
          {note && <span className="good-text small">{note}</span>}
        </div>
        <textarea className="export-preview" readOnly value={busy ? t('ai.export.generating') : text} aria-label={t('ai.export.preview')} />
        <p className="muted small">{t('ai.export.privacy')}</p>
      </section>

      <section className="card settings-section">
        <h3>{t('ai.claude.title')}</h3>
        <p className="muted small">{t('ai.claude.hint')}</p>
        {mcp && (
          <>
            <ul className="status-list">
              <li className={mcp.claudeFound ? 'ok' : 'bad'}>{mcp.claudeFound ? t('ai.claude.found') : t('ai.claude.notFound')}</li>
              <li className={mcp.installed ? 'ok' : 'bad'}>{mcp.installed ? t('ai.claude.installed') : t('ai.claude.notInstalled')}</li>
            </ul>
            <div className="row">
              {mcp.installed ? (
                <button type="button" className="btn" onClick={async () => { setMcp(await window.api.uninstallMcp()); setMcpNote(t('ai.claude.removed')); }}>
                  {t('ai.claude.remove')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  onClick={async () => {
                    try {
                      setMcp(await window.api.installMcp());
                      setMcpNote(t('ai.claude.added'));
                    } catch (e) {
                      setMcpNote(t('ai.claude.addFailed', { error: String((e as Error).message) }));
                    }
                  }}
                >
                  {t('ai.claude.add')}
                </button>
              )}
              <button type="button" className="btn" onClick={() => void copy(mcp.config, setMcpNote)}>
                {t('ai.claude.copyConfig')}
              </button>
              {mcpNote && <span className="good-text small">{mcpNote}</span>}
            </div>
            <ol className="steps small">
              <li>{t('ai.claude.step1')}</li>
              <li>{t('ai.claude.step2')}</li>
              <li>{t('ai.claude.step3')}</li>
            </ol>
            <details>
              <summary className="small">{t('ai.claude.manual', { path: mcp.claudeConfigPath })}</summary>
              <pre className="code">{mcp.config}</pre>
            </details>
            <h4>{t('ai.claude.tools')}</h4>
            <ul className="plain-list small">
              {mcp.tools.map((tool) => (
                <li key={tool.name}>
                  <code>{tool.name}</code>
                  <span className="muted">{t(`ai.tool.${tool.name}`, { defaultValue: tool.description })}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card settings-section">
        <h3>{t('ai.others.title')}</h3>
        <p className="muted small">{t('ai.others.hint')}</p>
      </section>
    </div>
  );
}
