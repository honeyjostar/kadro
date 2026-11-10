// «Скоро в Kadro»: раз в несколько часов берём docs/next.json с GitHub (без интернета — последний сохранённый).
import fs from 'node:fs';
import path from 'node:path';
import { app, net } from 'electron';
import { NEXT_URL, parseNext, type NextInfo } from '../shared/next';
import { dataDir } from './bins';

const EVERY = 6 * 3600 * 1000;
const file = () => path.join(dataDir(), 'next.json');
interface Saved { at?: number; next?: NextInfo | null }
const read = (): Saved => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) as Saved; } catch { return {}; } };

/** Последний сохранённый анонс. */
export const savedNext = (): NextInfo | null => read().next ?? null;

/** Проверить, не поменялся ли анонс; поменялся — onChange. В разработке и автотестах — только если задан адрес. */
export async function refreshNext(onChange: (n: NextInfo | null) => void, log: (...a: unknown[]) => void): Promise<void> {
  const url = process.env.KADRO_NEXT_URL || NEXT_URL;
  const s = read();
  if (!process.env.KADRO_NEXT_URL && (!app.isPackaged || Date.now() - (s.at ?? 0) < EVERY)) return;
  try {
    let raw: unknown;
    if (url.startsWith('file:') && process.env.KADRO_NEXT_URL) raw = JSON.parse(fs.readFileSync(new URL(url), 'utf8'));
    else {
      const r = await net.fetch(url, { headers: { 'User-Agent': `Kadro/${app.getVersion()}`, 'Cache-Control': 'no-cache' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      raw = await r.json();
    }
    const next = parseNext(raw);
    fs.writeFileSync(file(), JSON.stringify({ at: Date.now(), next }));
    if (JSON.stringify(next) !== JSON.stringify(s.next ?? null)) onChange(next);
  } catch (e) {
    log('next.json', e instanceof Error ? e.message : e);
  }
}
