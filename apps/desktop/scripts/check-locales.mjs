// Sprawdza tłumaczenia względem angielskiego wzorca:
// - każdy tekst z en istnieje w każdym języku,
// - zmienne {{...}} są te same,
// - teksty z liczbą mają wszystkie formy, których wymaga dany język (Intl.PluralRules),
// - nie ma kluczy, których angielski już nie używa.
// Uruchamiane przez `npm test` w katalogu głównym.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'src', 'locales');
const PLURAL = /_(zero|one|two|few|many|other)$/;

function flat(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flat(v, `${prefix}${k}.`, out);
    else out[prefix + k] = String(v);
  }
  return out;
}
const load = (code) => flat(JSON.parse(readFileSync(join(dir, code, 'translation.json'), 'utf8')));
const vars = (s) => new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const en = load('en');
// klucz bazowy → zmienne (dla liczby mnogiej: suma zmiennych wszystkich form)
const bases = new Map();
for (const [k, v] of Object.entries(en)) {
  const base = k.replace(PLURAL, '');
  const plural = base !== k;
  const prev = bases.get(base) ?? { plural, vars: new Set() };
  for (const x of vars(v)) prev.vars.add(x);
  bases.set(base, prev);
}

let failed = false;
for (const code of readdirSync(dir).filter((d) => d !== 'en').sort()) {
  const tr = load(code);
  const needed = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  const errors = [];
  for (const [base, info] of bases) {
    if (!info.plural) {
      if (!(base in tr)) errors.push(`brak „${base}”`);
      else if (!same(vars(tr[base]), info.vars)) errors.push(`inne zmienne w „${base}”`);
      continue;
    }
    for (const cat of needed) {
      const key = `${base}_${cat}`;
      if (!(key in tr)) errors.push(`brak formy „${key}”`);
      else if ([...vars(tr[key])].some((x) => !info.vars.has(x))) errors.push(`nieznana zmienna w „${key}”`);
    }
  }
  for (const k of Object.keys(tr)) if (!bases.has(k.replace(PLURAL, ''))) errors.push(`zbędny klucz „${k}”`);
  if (errors.length) {
    failed = true;
    console.error(`✗ ${code}: ${errors.length} problemów\n  ${errors.slice(0, 20).join('\n  ')}`);
  } else console.log(`✓ ${code}: ${Object.keys(tr).length} tekstów`);
}
if (failed) process.exit(1);
