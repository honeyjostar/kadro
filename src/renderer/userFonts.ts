// Свои и системные шрифты в окне: список (для выбора шрифта текста), загрузка в документ через FontFace —
// тогда шрифт одинаково виден в плеере, в превью списка и при экспорте (текст рисуется здесь же, на canvas).
import { create } from 'zustand';
import { FONTS } from '../shared/defaults';
import { tx } from '../shared/i18n';
import type { FontFile, FontInstallResult, ProjectExtras } from '../shared/ipc';
import type { Project } from '../shared/types';
import { api, getState, useStore } from './store';

export interface FontFamily { family: string; files: FontFile[]; source: 'user' | 'system' }

interface FontsState {
  user: FontFamily[];
  system: FontFamily[] | null;   // null — ещё не читали
  systemLoading: boolean;
}
export const useFonts = create<FontsState>(() => ({ user: [], system: null, systemLoading: false }));

const BUILTIN = new Set(FONTS.map((f) => f.family.toLowerCase()));
const key = (f: string) => f.trim().toLowerCase();

function group(files: FontFile[], source: 'user' | 'system'): FontFamily[] {
  const m = new Map<string, FontFamily>();
  for (const f of files) {
    const k = key(f.family);
    if (!m.has(k)) m.set(k, { family: f.family, files: [], source });
    m.get(k)!.files.push(f);
  }
  return [...m.values()].sort((a, b) => a.family.localeCompare(b.family));
}

// загруженные в документ начертания: файл#номер → FontFace
const faces = new Map<string, FontFace>();

const adding = new Map<string, Promise<void>>();
function addFace(f: FontFile, family: string): Promise<void> {
  const id = `${f.file}#${f.index}`;
  let p = adding.get(id);
  if (!p) {
    p = (async () => {
      const src = /\.(ttc|otc)$/i.test(f.file) ? await api.fontFace(f.file, f.index) : f.file;
      const face = new FontFace(family, `url("${api.mediaUrl(src)}")`, {
        weight: f.variable ? '1 1000' : String(f.weight),
        style: f.italic ? 'italic' : 'normal',
      });
      faces.set(id, face);
      document.fonts.add(face); // грузится, когда понадобится (или по document.fonts.load)
    })();
    adding.set(id, p);
    p.catch(() => adding.delete(id));
  }
  return p;
}

let userIds = new Set<string>();
function setUser(list: FontFile[]): void {
  const fams = group(list, 'user');
  useFonts.setState({ user: fams });
  const next = new Set(list.map((f) => `${f.file}#${f.index}`));
  // удалённые свои шрифты — из документа прочь
  for (const id of userIds) {
    if (next.has(id)) continue;
    const face = faces.get(id);
    if (face) { document.fonts.delete(face); faces.delete(id); }
    adding.delete(id);
  }
  userIds = next;
  // свои — сразу в документ (загрузятся, когда их покажут)
  for (const fam of fams) for (const f of fam.files) void addFace(f, fam.family).catch(() => undefined);
}

/** Системные шрифты: читаются один раз (при первом открытии списка шрифтов или проверке перед экспортом). */
export async function loadSystemFonts(): Promise<FontFamily[]> {
  const s = useFonts.getState();
  if (s.system) return s.system;
  if (!s.systemLoading) {
    useFonts.setState({ systemLoading: true });
    try {
      const list = await api.fontsSystem();
      useFonts.setState({ system: group(list, 'system'), systemLoading: false });
    } catch {
      useFonts.setState({ system: [], systemLoading: false });
    }
  }
  while (useFonts.getState().systemLoading) await new Promise((r) => setTimeout(r, 50));
  return useFonts.getState().system ?? [];
}

export function findFamily(family: string): FontFamily | undefined {
  const k = key(family);
  const s = useFonts.getState();
  return s.user.find((f) => key(f.family) === k) ?? s.system?.find((f) => key(f.family) === k);
}

/** Подключить семейство к документу (системное — по запросу, своё — уже подключено). */
export async function ensureFamily(family: string): Promise<boolean> {
  if (BUILTIN.has(key(family))) return true;
  let fam = findFamily(family);
  if (!fam && !useFonts.getState().system) { await loadSystemFonts(); fam = findFamily(family); }
  if (!fam) return false;
  await Promise.all(fam.files.map((f) => addFace(f, fam!.family).catch(() => undefined)));
  return true;
}

/** Шрифты текстов проекта. */
export function projectFamilies(p: Project): string[] {
  const out = new Set<string>();
  for (const t of p.tracks) for (const c of t.clips) if (c.type === 'text' && c.style?.font) out.add(c.style.font);
  return [...out];
}

/** Шрифты проекта, которых нет ни в Kadro, ни на компьютере. */
export async function missingFonts(p: Project): Promise<string[]> {
  const fams = projectFamilies(p).filter((f) => !BUILTIN.has(key(f)));
  if (!fams.length) return [];
  const out: string[] = [];
  for (const f of fams) if (!(await ensureFamily(f))) out.push(f);
  return out;
}

export function fontAvailableNow(family: string): boolean {
  return BUILTIN.has(key(family)) || !!findFamily(family);
}

export function reportFontInstall(r: FontInstallResult): void {
  const s = getState();
  const fams = [...new Set(r.installed.map((i) => i.family))];
  if (fams.length) s.toast(fams.length === 1 ? tx('Шрифт «{0}» установлен — он в списке шрифтов, раздел «Мои шрифты»', fams[0]) : tx('Установлены шрифты: {0}. Они в разделе «Мои шрифты»', fams.join(', ')), 'ok');
  else if (r.already.length) s.toast(tx('Уже установлен: {0}', r.already.join(', ')), 'info');
  for (const e of r.errors) s.toast(tx('Шрифт не установлен: {0}', e), 'err');
}

function reportExtras(x: ProjectExtras): void {
  const s = getState();
  if (x.relinked) s.toast(tx('Файлы проекта нашлись рядом с ним: {0}', x.relinked), 'ok');
  if (x.fonts.length) s.toast(tx('Из папки проекта установлены шрифты: {0}', x.fonts.join(', ')), 'ok');
  if (x.plugins.length) s.toast(tx('Из папки проекта установлены плагины: {0}', x.plugins.join(', ')), 'ok');
}

let started = false;
/** Один раз при запуске окна: свои шрифты, подписки, подключение шрифтов открытого проекта. */
export function initFonts(): void {
  if (started) return;
  started = true;
  void api.fontsList().then(setUser).catch(() => undefined);
  api.onFontsChanged(setUser);
  api.onProjectExtras(reportExtras);
  // в проекте системный шрифт — подключаем его, как только проект открыт или шрифт выбран
  let last = '';
  const check = (p: Project) => {
    const fams = projectFamilies(p).filter((f) => !BUILTIN.has(key(f)));
    const sig = fams.join('|');
    if (sig === last) return;
    last = sig;
    for (const f of fams) void ensureFamily(f);
  };
  check(getState().project);
  useStore.subscribe((s, prev) => { if (s.project !== prev.project) check(s.project); });
}
