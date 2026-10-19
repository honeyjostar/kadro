// Файлы LUT (.cube): копируем в папку данных программы, читаем для экспорта и превью.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseCube, type CubeLut } from '../shared/grade';
import type { Project } from '../shared/types';
import { dataDir } from './bins';

export function lutsDir(): string {
  const d = path.join(dataDir(), 'luts');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Проверяет файл и кладёт копию в папку LUT (одинаковые файлы — одна копия). */
export function importLutFile(src: string): { path: string; name: string } {
  const text = fs.readFileSync(src, 'utf8');
  const lut = parseCube(text); // бросит понятную ошибку, если файл не LUT
  const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 10);
  const base = path.basename(src, path.extname(src)).replace(/[^\p{L}\p{N} ._-]+/gu, '_').slice(0, 60) || 'lut';
  const dst = path.join(lutsDir(), `${base}_${hash}.cube`);
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
  return { path: dst, name: lut.title || path.basename(src, path.extname(src)) };
}

export function listLutFiles(): { path: string; name: string }[] {
  return fs.readdirSync(lutsDir()).filter((f) => f.toLowerCase().endsWith('.cube'))
    .map((f) => ({ path: path.join(lutsDir(), f), name: f.replace(/_[0-9a-f]{10}\.cube$/i, '').replace(/\.cube$/i, '') }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Все LUT, на которые ссылаются клипы проекта (пропавшие файлы пропускаем). */
export function loadLuts(p: Project): Record<string, CubeLut> {
  const out: Record<string, CubeLut> = {};
  for (const t of p.tracks) {
    for (const c of t.clips) {
      const lp = c.type === 'media' ? c.grade?.lut?.path : undefined;
      if (!lp || out[lp]) continue;
      try { out[lp] = parseCube(fs.readFileSync(lp, 'utf8')); } catch { /* файла нет — без LUT */ }
    }
  }
  return out;
}
