import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportProgress, Settings, SettingsStatus } from '../../../shared/api.ts';
import Toggle from '../components/Toggle.tsx';
import { makeFormatters } from '../format.ts';
import { LANGUAGES, setLanguage, type LanguageCode } from '../i18n.ts';
import { keyLabel } from '../drill/engine.ts';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const [st, setSt] = useState<SettingsStatus | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [version, setVersion] = useState('');

  useEffect(() => {
    void window.api.getSettings().then(setSt);
    void window.api.version().then(setVersion);
    return window.api.onImportProgress(setProgress);
  }, []);

  if (!st) return null;
  const s = st.settings;
  const update = async (patch: Partial<Settings>) => setSt(await window.api.updateSettings(patch));
  const pickFolder = () => window.api.pickFolder({ pickFolder: t('settings.pickFolder') });

  async function runImport() {
    setProgress({ done: 0, total: 0, imported: 0, skipped: 0, failed: 0, finished: false, folders: [] });
    setProgress(await window.api.importReplays(30, 200));
    setSt(await window.api.getSettings());
  }

  const kindLabel = (kind: string) => t(`settings.folderKind.${kind}`);

  return (
    <div className="screen settings">
      <header className="screen-head">
        <h1>{t('settings.title')}</h1>
        <p className="muted">{t('settings.subtitle')}</p>
      </header>

      <section className="card settings-section">
        <h3>{t('settings.osu.title')}</h3>
        <div className="setting-row">
          <div>
            <div className="setting-label">{t('settings.osu.folder')}</div>
            <div className="path">{s.osuFolder ?? t('settings.osu.notFound')}</div>
          </div>
          <div className="row">
            {s.osuFolder && (
              <button type="button" className="btn small ghost" onClick={() => void window.api.openPath(s.osuFolder!)}>
                {t('settings.open')}
              </button>
            )}
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                const p = await pickFolder();
                if (p) await update({ osuFolder: p });
              }}
            >
              {t('settings.change')}
            </button>
          </div>
        </div>
        <ul className="status-list">
          <li className={st.songsFolder ? 'ok' : 'bad'}>
            {st.songsFolder ? t('settings.osu.songs', { path: st.songsFolder }) : t('settings.osu.noSongs')}
          </li>
          <li className={st.osuDb && !st.osuDb.error ? 'ok' : 'bad'}>
            {!st.osuDb
              ? t('settings.osu.noDb')
              : st.osuDb.error
                ? t('settings.osu.dbError', { error: st.osuDb.error })
                : t('settings.osu.db', { maps: f.num(st.osuDb.maps), player: st.osuDb.player || '—' })}
          </li>
        </ul>
        <p className="muted small">{t('settings.osu.hint')}</p>

        <div className="setting-row">
          <div>
            <div className="setting-label">{t('settings.lazer.folder')}</div>
            <div className="path">{s.lazerFolder ?? t('settings.lazer.notFound')}</div>
          </div>
          <div className="row">
            {s.lazerFolder && (
              <button type="button" className="btn small ghost" onClick={() => void window.api.openPath(s.lazerFolder!)}>
                {t('settings.open')}
              </button>
            )}
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                const p = await pickFolder();
                if (p) await update({ lazerFolder: p });
              }}
            >
              {t('settings.change')}
            </button>
          </div>
        </div>
        {st.lazer.found && (
          <ul className="status-list">
            <li className="ok">
              {st.lazer.indexing
                ? t('settings.lazer.indexing', { maps: f.num(st.lazer.indexedMaps) })
                : t('settings.lazer.indexed', { maps: f.num(st.lazer.indexedMaps) })}
            </li>
          </ul>
        )}
        <p className="muted small">{t('settings.lazer.hint')}</p>
      </section>

      <section className="card settings-section">
        <h3>{t('settings.replays.title')}</h3>
        <ul className="folder-list">
          {st.folders.map((folder) => (
            <li key={folder.path} className="setting-row">
              <div>
                <div className="setting-label">
                  {kindLabel(folder.kind)}
                  {!folder.exists && <span className="tag warn">{t('settings.replays.missing')}</span>}
                </div>
                <div className="path">{folder.path}</div>
              </div>
              {folder.kind === 'extra' ? (
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => void update({ extraFolders: s.extraFolders.filter((p) => p !== folder.path) })}
                >
                  {t('settings.remove')}
                </button>
              ) : (
                <Toggle
                  checked={folder.enabled}
                  label={t('settings.replays.watch')}
                  onChange={(v) =>
                    void update(folder.kind === 'data-r' ? { watchDataR: v } : folder.kind === 'lazer' ? { watchLazer: v } : { watchReplays: v })
                  }
                />
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn small"
          onClick={async () => {
            const p = await pickFolder();
            if (p && !s.extraFolders.includes(p)) await update({ extraFolders: [...s.extraFolders, p] });
          }}
        >
          {t('settings.replays.addFolder')}
        </button>

        <div className="setting-row">
          <div>
            <div className="setting-label">{t('settings.replays.auto')}</div>
            <div className="muted small">{t('settings.replays.autoHint')}</div>
          </div>
          <Toggle checked={s.autoAnalyze} label={t('settings.replays.auto')} onChange={(v) => void update({ autoAnalyze: v })} />
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">{t('settings.replays.notify')}</div>
            <div className="muted small">{t('settings.replays.notifyHint')}</div>
          </div>
          <Toggle checked={s.notifications} label={t('settings.replays.notify')} onChange={(v) => void update({ notifications: v })} />
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">{t('settings.replays.import')}</div>
            <div className="muted small">
              {t('settings.replays.importHint', { count: st.historyCount })}
            </div>
            {progress && (
              <div className="import-progress">
                <div className="bar">
                  <span className="bar-fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : progress.finished ? 100 : 5}%` }} />
                </div>
                <span className="muted small">
                  {progress.finished
                    ? t('settings.replays.importDone', { imported: progress.imported, skipped: progress.skipped, failed: progress.failed })
                    : t('settings.replays.importProgress', { done: progress.done, total: progress.total })}
                </span>
                {progress.finished && progress.folders.length > 0 && (
                  <ul className="status-list small">
                    {progress.folders.map((x) => (
                      <li key={x.path} className={x.found ? 'ok' : 'bad'}>
                        {t('settings.replays.folderFound', { name: kindLabel(x.kind), count: x.found })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button type="button" className="btn small" disabled={!!progress && !progress.finished} onClick={() => void runImport()}>
            {t('settings.replays.importButton')}
          </button>
        </div>
      </section>

      <section className="card settings-section">
        <h3>{t('settings.keys.title')}</h3>
        <p className="muted small">{t('settings.keys.hint')}</p>
        {(['keyK1', 'keyK2'] as const).map((k) => (
          <div key={k} className="setting-row">
            <div className="setting-label">{k === 'keyK1' ? 'K1 (L)' : 'K2 (P)'}</div>
            <KeyCapture
              code={s[k]}
              waitingLabel={t('settings.keys.press')}
              onCapture={(code) => void update({ [k]: code } as Partial<Settings>)}
            />
          </div>
        ))}
        <div className="setting-row">
          <div>
            <div className="setting-label">{t('settings.keys.volume')}</div>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            aria-label={t('settings.keys.volume')}
            onChange={(e) => void update({ volume: Number(e.target.value) })}
          />
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">{t('settings.keys.offset')}</div>
            <div className="muted small">{t('settings.keys.offsetHint')}</div>
          </div>
          <input
            type="number"
            className="num-input"
            value={s.audioOffsetMs}
            step={1}
            onChange={(e) => void update({ audioOffsetMs: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">{t('settings.fps.mode')}</div>
            <div className="muted small">{t('settings.fps.hint')}</div>
            {s.frameRate !== st.frameRateActive && (
              <div className="warn-text small fps-restart">
                {t('settings.fps.restart')}{' '}
                <button type="button" className="btn small" onClick={() => void window.api.relaunch()}>
                  {t('settings.fps.restartNow')}
                </button>
              </div>
            )}
          </div>
          <select value={s.frameRate} onChange={(e) => void update({ frameRate: e.target.value as Settings['frameRate'] })}>
            <option value="vsync">{t('settings.fps.vsync')}</option>
            <option value="unlimited">{t('settings.fps.unlimited')}</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">{t('settings.fps.show')}</div>
            <div className="muted small">{t('settings.fps.showHint')}</div>
          </div>
          <Toggle checked={s.showFps} onChange={(v) => void update({ showFps: v })} label={t('settings.fps.show')} />
        </div>
      </section>

      <section className="card settings-section">
        <h3>{t('settings.app.title')}</h3>
        <div className="setting-row">
          <div>
            <div className="setting-label">{t('common.language')}</div>
          </div>
          <select value={i18n.resolvedLanguage} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">{t('settings.app.autostart')}</div>
            <div className="muted small">{st.canAutostart ? t('settings.app.autostartHint') : t('settings.app.autostartDev')}</div>
          </div>
          <Toggle
            checked={s.openAtLogin}
            disabled={!st.canAutostart}
            label={t('settings.app.autostart')}
            onChange={(v) => void update({ openAtLogin: v })}
          />
        </div>
        <p className="muted small">{t('settings.app.version', { version })}</p>
      </section>
    </div>
  );
}

/** Pole „kliknij i naciśnij klawisz”. */
function KeyCapture({ code, onCapture, waitingLabel }: { code: string; onCapture: (code: string) => void; waitingLabel: string }) {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') onCapture(e.code);
      setWaiting(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [waiting, onCapture]);
  return (
    <button type="button" className={`btn small key-capture${waiting ? ' waiting' : ''}`} onClick={() => setWaiting(true)}>
      {waiting ? waitingLabel : keyLabel(code)}
    </button>
  );
}
