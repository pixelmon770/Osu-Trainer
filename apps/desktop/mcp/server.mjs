#!/usr/bin/env node
// Lokalny serwer MCP osu! Trenera dla Claude Desktop (i innych klientów MCP przez stdio).
// Tylko CZYTA bazę historii – niczego nie zmienia i nie wysyła do internetu.
//
// Uruchamiany przez Electron jako Node (ELECTRON_RUN_AS_NODE=1), więc nie wymaga osobnej instalacji Node.js.
// Konfigurację dla Claude Desktop generuje program: Połączenie z AI → Claude Desktop → Kopiuj konfigurację.

import readline from 'node:readline';
import { HANDLERS, TOOLS } from './tools.mjs';

const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];

// ---------- JSON-RPC przez stdio (jedna wiadomość = jedna linia) ----------

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // powiadomienia (np. notifications/initialized) – bez odpowiedzi
  try {
    if (method === 'initialize') {
      const requested = params?.protocolVersion;
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: SUPPORTED.includes(requested) ? requested : SUPPORTED[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'osu-trainer', version: '0.8.0' },
          instructions:
            'Data from the osu! Trener desktop app: analyzed osu! replays and finger exercises of this player. Start with get_profile_summary. Answer as a practical osu! coach.'
        }
      });
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      const fn = HANDLERS[params?.name];
      if (!fn) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
      try {
        const text = await fn(params.arguments ?? {});
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
      } catch (e) {
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(e?.message ?? e) }], isError: true } });
      }
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (e) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(e?.message ?? e) } });
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    void handle(JSON.parse(line));
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
});
