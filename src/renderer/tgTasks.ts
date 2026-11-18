// Задачи из Telegram-бота: видео прислали с телефона — Kadro собирает авто-ролик, субтитры или шортсы новым проектом
// (прошлый проект сохраняется в «Моих проектах») и отдаёт готовый файл боту. Если человек сейчас работает
// за компьютером (недавно щёлкал или печатал) или Kadro занят экспортом — задача ждёт, пока освободится.
import { tx } from '../shared/i18n';
import { applyBlogStyle, BLOG_STYLES } from '../shared/blogCaptions';
import { newProject } from '../shared/defaults';
import { aspectOf } from '../shared/refEdit';
import type { TgTask } from '../shared/tgbot';
import { shortProject } from '../shared/shorts';
import { buildAutoEdit, exportTo, findShortMoments, importPaths, makeCaptions, replaceProject } from './actions';
import { api, getState } from './store';

/** Сколько ждать после последнего щелчка или нажатия (автотесты ставят window.__kadroTgIdle = 0). */
const idleMs = () => (window as unknown as { __kadroTgIdle?: number }).__kadroTgIdle ?? 45_000;
let lastInput = 0;
const queue: TgTask[] = [];
let busy = false;

function kadroBusy(): boolean {
  const s = getState();
  return Object.keys(s.jobs).length > 0 || !!s.exportOpen || !!s.autoOpen || !!s.shortsOpen || !!s.reachOpen;
}

async function waitIdle(): Promise<void> {
  // человек за компьютером — не перехватываем его проект; ждём до 30 минут
  const until = Date.now() + 30 * 60_000;
  while (Date.now() < until && (Date.now() - lastInput < idleMs() || kadroBusy())) await new Promise((r) => setTimeout(r, 2000));
}

/** Шортсы: лучшие моменты по речи (до трёх по 15–35 с), каждый — отдельным роликом и проектом в «Моих проектах». */
async function runShorts(t: TgTask): Promise<void> {
  const { assets } = await api.importMedia(t.files);
  const asset = assets.find((a) => a.kind === 'video');
  if (!asset) { await api.tgResult(t.id, { error: tx('видео не открылось') }); return; }
  const ms = await findShortMoments(asset, { len: 'short', count: 3, model: 'multi' }, () => undefined);
  if (!ms?.length) { await api.tgResult(t.id, { error: tx('в видео мало речи для шортсов — пришли видео от минуты, где говорят') }); return; }
  const projects = ms.map((m, i) => shortProject(asset, m, i + 1, BLOG_STYLES[0]));
  await api.saveShorts(projects, asset.name.replace(/\.[^.]+$/, '')).catch(() => null);
  const files: string[] = [];
  for (const [i, p] of projects.entries()) {
    await replaceProject(p);
    const r = await exportTo(t.out.replace(/\.mp4$/i, `_${i + 1}.mp4`), 720, 30);
    if (r.ok && r.path) files.push(r.path);
  }
  if (!files.length) { await api.tgResult(t.id, { error: tx('экспорт не получился') }); return; }
  await api.tgResult(t.id, { files, note: tx('Шортсы из Kadro — они и в «Моих проектах» на компьютере, там их можно поправить.') });
  getState().toast(tx('Telegram: шортсы отправлены ({0})', files.length), 'ok');
}

async function run(t: TgTask): Promise<void> {
  await waitIdle();
  const s = getState();
  s.toast(t.kind === 'auto' ? tx('Telegram: собираю авто-ролик ({0} видео)', t.files.length) : t.kind === 'shorts' ? tx('Telegram: режу шортсы') : tx('Telegram: делаю субтитры'), 'info');
  try {
    if (t.kind === 'shorts') { await runShorts(t); return; }
    if (t.kind === 'auto') {
      const sum = await buildAutoEdit({ files: t.files, music: null, style: 'energy', aspect: '9:16', length: 'auto', title: '', videoSound: 'on', hook: true }, { fresh: true });
      if (!sum) { await api.tgResult(t.id, { error: tx('ролик не собрался — открой Kadro на компьютере') }); return; }
    } else {
      const info = await api.probeVideo(t.files[0]);
      const name = t.files[0].split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? tx('Ролик');
      await replaceProject(newProject(name, info ? aspectOf(info.width, info.height) : '9:16'));
      await importPaths(t.files, { mode: 'main', at: 0 });
      if (!(await makeCaptions('multi', false))) { await api.tgResult(t.id, { error: tx('в видео не нашлась речь или модель субтитров не скачалась') }); return; }
      const vertical = getState().project.settings.height > getState().project.settings.width;
      getState().commit((p) => applyBlogStyle(p, BLOG_STYLES[0], vertical));
    }
    const r = await exportTo(t.out, 720, 30);
    if (!r.ok || !r.path) { await api.tgResult(t.id, { error: r.error ?? tx('экспорт не получился') }); return; }
    await api.tgResult(t.id, { file: r.path, note: t.kind === 'auto' ? tx('Авто-ролик из Kadro. Поправить можно на компьютере — проект открыт.') : tx('Субтитры из Kadro. Поправить можно на компьютере — проект открыт.') });
    getState().toast(tx('Telegram: ролик отправлен'), 'ok');
  } catch (e) {
    await api.tgResult(t.id, { error: e instanceof Error ? e.message : String(e) });
  }
}

async function pump(): Promise<void> {
  if (busy) return;
  busy = true;
  try { while (queue.length) await run(queue.shift()!); } finally { busy = false; }
}

/** Слушать задачи бота (один раз при запуске окна). */
export function initTgTasks(): () => void {
  const mark = () => { lastInput = Date.now(); };
  window.addEventListener('pointerdown', mark, true);
  window.addEventListener('keydown', mark, true);
  const off = api.onTgTask((t) => { queue.push(t); void pump(); });
  return () => { off(); window.removeEventListener('pointerdown', mark, true); window.removeEventListener('keydown', mark, true); };
}
