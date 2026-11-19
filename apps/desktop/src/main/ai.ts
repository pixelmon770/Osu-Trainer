// Połączenie z AI: eksport danych w Markdownie i konfiguracja lokalnego serwera MCP dla Claude Desktop.
// Narzędzia (zestawienia) są w mcp/tools.mjs – te same dla eksportu i dla serwera MCP.

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import type { AiExportOptions, McpInfo } from '../shared/api.ts';
import { flushNow, queryReplays } from './history.ts';
import { getSettings } from './settings.ts';

type Tools = {
  setDbPath: (p: string) => void;
  HANDLERS: Record<string, (args: Record<string, unknown>) => Promise<string>>;
  TOOLS: { name: string; description: string }[];
};

const dbPath = () => join(app.getPath('userData'), 'osu-trainer.sqlite');

/** Folder z serwerem MCP: w wersji zainstalowanej rozpakowany obok app.asar (zwykły Node nie czyta ESM z asar). */
function mcpDir(): string {
  const base = app.getAppPath();
  return join(app.isPackaged ? base.replace(/app\.asar$/, 'app.asar.unpacked') : base, 'mcp');
}

let tools: Tools | null = null;
async function loadTools(): Promise<Tools> {
  if (!tools) {
    tools = (await import(/* @vite-ignore */ pathToFileURL(join(mcpDir(), 'tools.mjs')).href)) as Tools;
    tools.setDbPath(dbPath());
  }
  return tools;
}

const INTRO: Record<string, string> = {
  pl: 'Poniżej są moje dane z programu osu! Trener (analiza replayów i ćwiczeń palców). Przeanalizuj je jak trener osu!: co jest moim największym problemem, co trenować w tym tygodniu (konkretne ćwiczenia, tempo, czas) i po czym poznam postęp. Odpowiadaj po polsku.',
  en: 'Below is my data from the osu! Trener app (replay analysis and finger exercises). Analyze it as an osu! coach: what is my biggest problem, what should I train this week (specific exercises, tempo, duration) and how will I recognize progress.',
  de: 'Unten sind meine Daten aus der App osu! Trener (Replay-Analyse und Fingerübungen). Analysiere sie als osu!-Coach: Was ist mein größtes Problem, was soll ich diese Woche trainieren (konkrete Übungen, Tempo, Dauer) und woran erkenne ich Fortschritt? Antworte auf Deutsch.',
  es: 'Abajo están mis datos de la aplicación osu! Trener (análisis de replays y ejercicios de dedos). Analízalos como un entrenador de osu!: cuál es mi mayor problema, qué debo entrenar esta semana (ejercicios concretos, tempo, duración) y cómo reconoceré el progreso. Responde en español.',
  fr: "Voici mes données de l'application osu! Trener (analyse de replays et exercices de doigts). Analyse-les comme un coach osu! : quel est mon plus gros problème, que dois-je travailler cette semaine (exercices précis, tempo, durée) et comment reconnaîtrai-je mes progrès. Réponds en français.",
  'pt-BR': 'Abaixo estão meus dados do app osu! Trener (análise de replays e exercícios de dedos). Analise como um treinador de osu!: qual é meu maior problema, o que devo treinar esta semana (exercícios concretos, tempo, duração) e como vou reconhecer o progresso. Responda em português.',
  ru: 'Ниже мои данные из приложения osu! Trener (анализ реплеев и упражнения для пальцев). Проанализируй их как тренер по osu!: какая у меня главная проблема, что тренировать на этой неделе (конкретные упражнения, темп, длительность) и как я пойму, что есть прогресс. Отвечай по-русски.'
};

export async function aiExport(o: AiExportOptions): Promise<string> {
  await flushNow(); // najświeższe dane na dysku
  const t = await loadTools();
  const parts = [INTRO[getSettings().language] ?? INTRO.en!, '', await t.HANDLERS.get_profile_summary!({ days: o.days })];
  parts.push('', '## Recent plays', await t.HANDLERS.list_replays!({ days: o.days, limit: o.replays }));
  if (o.details > 0) {
    const latest = (await queryReplays({ sinceDays: o.days, hidePartial: false, limit: o.details })).items;
    for (const r of latest) parts.push('', await t.HANDLERS.get_replay!({ id: r.id }));
  }
  parts.push('', '## Exercises', await t.HANDLERS.list_drills!({ days: o.days, limit: 30 }));
  return parts.join('\n');
}

function claudeConfigPath(): string {
  const roaming = process.env['APPDATA'] ?? join(app.getPath('home'), 'AppData', 'Roaming');
  return process.platform === 'darwin'
    ? join(app.getPath('home'), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    : join(roaming, 'Claude', 'claude_desktop_config.json');
}

function serverEntry() {
  return {
    command: process.execPath,
    args: [join(mcpDir(), 'server.mjs')],
    env: { ELECTRON_RUN_AS_NODE: '1', OSU_TRAINER_DB: dbPath() }
  };
}

export async function mcpInfo(): Promise<McpInfo> {
  const t = await loadTools().catch(() => null);
  const path = claudeConfigPath();
  let installed = false;
  try {
    const cfg = JSON.parse(await readFile(path, 'utf8')) as { mcpServers?: Record<string, unknown> };
    installed = !!cfg.mcpServers?.['osu-trainer'];
  } catch {
    // brak pliku – Claude Desktop nie jest zainstalowany albo nie ma jeszcze konfiguracji
  }
  return {
    config: JSON.stringify({ mcpServers: { 'osu-trainer': serverEntry() } }, null, 2),
    claudeConfigPath: path,
    claudeFound: existsSync(dirname(path)),
    installed,
    tools: (t?.TOOLS ?? []).map((x) => ({ name: x.name, description: x.description }))
  };
}

/** Dopisuje serwer do konfiguracji Claude Desktop (z kopią zapasową poprzedniego pliku). */
export async function installMcp(): Promise<McpInfo> {
  const path = claudeConfigPath();
  let cfg: { mcpServers?: Record<string, unknown> } & Record<string, unknown> = {};
  if (existsSync(path)) {
    const text = await readFile(path, 'utf8');
    try {
      cfg = JSON.parse(text);
    } catch {
      throw new Error('claude-config-invalid');
    }
    await copyFile(path, path + '.backup-osu-trainer');
  } else {
    await mkdir(dirname(path), { recursive: true });
  }
  cfg.mcpServers = { ...(cfg.mcpServers ?? {}), 'osu-trainer': serverEntry() };
  await writeFile(path, JSON.stringify(cfg, null, 2), 'utf8');
  return mcpInfo();
}

export async function uninstallMcp(): Promise<McpInfo> {
  const path = claudeConfigPath();
  if (existsSync(path)) {
    const cfg = JSON.parse(await readFile(path, 'utf8')) as { mcpServers?: Record<string, unknown> };
    if (cfg.mcpServers) delete cfg.mcpServers['osu-trainer'];
    await writeFile(path, JSON.stringify(cfg, null, 2), 'utf8');
  }
  return mcpInfo();
}
