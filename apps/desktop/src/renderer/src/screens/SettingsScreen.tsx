import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportProgress, Settings, SettingsStatus } from '../../../shared/api.ts';
import Toggle from '../components/Toggle.tsx';
import { makeFormatters } from '../format.ts';
import { LANGUAGES, setLanguage, type LanguageCode } from '../i18n.ts';

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
