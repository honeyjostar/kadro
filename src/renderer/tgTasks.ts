// Задачи из Telegram-бота: видео прислали с телефона — Kadro собирает авто-ролик или субтитры новым проектом
// (прошлый проект сохраняется в «Моих проектах») и отдаёт готовый файл боту. Если человек сейчас работает
// за компьютером (недавно щёлкал или печатал) или Kadro занят экспортом — задача ждёт, пока освободится.
import { tx } from '../shared/i18n';
import { applyBlogStyle, BLOG_STYLES } from '../shared/blogCaptions';
import { newProject } from '../shared/defaults';
import { aspectOf } from '../shared/refEdit';
import type { TgTask } from '../shared/tgbot';
import { buildAutoEdit, exportTo, importPaths, makeCaptions, replaceProject } from './actions';
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

async function run(t: TgTask): Promise<void> {
  await waitIdle();
  const s = getState();
  s.toast(t.kind === 'auto' ? tx('Telegram: собираю авто-ролик ({0} видео)', t.files.length) : tx('Telegram: делаю субтитры'), 'info');
  try {
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
