// Версии проекта на диске: папка версий у каждого проекта (по времени создания проекта — оно не меняется при «Сохранить как»).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { projectDuration } from '../shared/timeline';
import type { Project } from '../shared/types';
import { versionFile, versionsToDrop, type VersionInfo } from '../shared/versions';
import { dataDir } from './bins';

const dirFor = (p: Pick<Project, 'createdAt'>): string => path.join(dataDir(), 'versions', String(p.createdAt || 0));
const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex');
const lastHash = new Map<string, string>();

/** Снять версию, если с прошлой проект изменился. true — снята. */
export function snapshot(p: Project, now = Date.now()): boolean {
  const dir = dirFor(p);
  // время правки не считается изменением
  const body = JSON.stringify({ ...p, updatedAt: 0 });
  const h = hash(body);
  if (lastHash.get(dir) === h) return false;
  fs.mkdirSync(dir, { recursive: true });
  const list = fs.readdirSync(dir).filter((f) => f.endsWith('.kadro')).sort();
  const last = list[list.length - 1];
  if (last) {
    try { if (hash(JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(dir, last), 'utf8')), updatedAt: 0 })) === h) { lastHash.set(dir, h); return false; } } catch { /* битый — пишем новый */ }
  }
  const file = path.join(dir, versionFile(now));
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(p));
  fs.renameSync(`${file}.tmp`, file);
  lastHash.set(dir, h);
  prune(dir, now);
  return true;
}

function timeOf(f: string): number {
  const iso = f.replace(/\.kadro$/, '').replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');
  return Date.parse(iso) || 0;
}

function prune(dir: string, now: number): void {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.kadro'));
  const drop = new Set(versionsToDrop(files.map(timeOf), now));
  for (const f of files) if (drop.has(timeOf(f))) fs.rmSync(path.join(dir, f), { force: true });
}

/** Версии проекта, новые сверху. */
export function listVersions(p: Pick<Project, 'createdAt'>): VersionInfo[] {
  const dir = dirFor(p);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.kadro')).sort().reverse().flatMap((f) => {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Project;
      return [{ file: path.join(dir, f), time: timeOf(f), name: v.name, clips: v.tracks.reduce((n, t) => n + t.clips.length, 0), duration: projectDuration(v) }];
    } catch { return []; }
  });
}

export function readVersion(file: string): Project {
  const root = path.resolve(dataDir(), 'versions');
  if (!path.resolve(file).startsWith(root)) throw new Error('not a version file');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Project;
}
