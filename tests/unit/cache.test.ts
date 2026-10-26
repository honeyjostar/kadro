import { describe, expect, it } from 'vitest';
import { collectPaths, fmtBytes, normPath, planCleanup, summarize, type CacheFile } from '../../src/shared/cache';
import { Queue, backgroundLimit } from '../../src/shared/queue';
import { RESOLUTIONS, shortSideOf, sizeFor } from '../../src/shared/defaults';

const H = 60 * 60_000;

describe('очередь фоновых задач', () => {
  it('выполняет не больше limit одновременно и все до конца, по порядку', async () => {
    const q = new Queue(2);
    let now = 0;
    let peak = 0;
    const order: number[] = [];
    const task = (i: number) => q.run(async () => {
      now++; peak = Math.max(peak, now);
      await new Promise((r) => setTimeout(r, 5 + (i % 3) * 3));
      order.push(i);
      now--;
      return i * 10;
    });
    const res = await Promise.all([0, 1, 2, 3, 4, 5, 6].map(task));
    expect(res).toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(peak).toBe(2);
    expect(order).toHaveLength(7);
    expect(q.size).toEqual({ running: 0, waiting: 0 });
  });
  it('ошибка задачи не останавливает очередь', async () => {
    const q = new Queue(1);
    const a = q.run(async () => { throw new Error('битый файл'); });
    const b = q.run(async () => 'ok');
    await expect(a).rejects.toThrow('битый файл');
    await expect(b).resolves.toBe('ok');
    expect(q.size.running).toBe(0);
  });
  it('сколько одновременно: четверть ядер, 1…3', () => {
    expect([1, 2, 4, 8, 12, 16, 32].map(backgroundLimit)).toEqual([1, 1, 1, 2, 3, 3, 3]);
  });
});

describe('кэш', () => {
  const now = 1_800_000_000_000;
  const files: CacheFile[] = [
    { path: 'C:\\Users\\T\\.kadro\\cache\\proxy\\a.mp4', size: 100, mtime: now - 2 * H, dir: 'proxy' },
    { path: 'C:\\Users\\T\\.kadro\\cache\\proxy\\b.mp4', size: 200, mtime: now - 2 * H, dir: 'proxy' },
    { path: 'C:\\Users\\T\\.kadro\\cache\\proxy\\c.part.mp4', size: 50, mtime: now - 60_000, dir: 'proxy' },       // ещё пишется
    { path: 'C:\\Users\\T\\.kadro\\cache\\thumbs\\k\\t0.jpg', size: 5, mtime: now - 2 * H, dir: 'thumbs' },
    { path: 'C:\\Users\\T\\.kadro\\cache\\tmp\\rt_1\\x.wav', size: 70, mtime: now - 30 * 60_000, dir: 'tmp' },       // идёт задача
    { path: 'C:\\Users\\T\\.kadro\\cache\\export\\job_1\\a.png', size: 30, mtime: now - 3 * H, dir: 'export' },
    { path: 'C:\\Users\\T\\.kadro\\cache\\clips\\rev_1.mp4', size: 1000, mtime: now - 48 * H, dir: 'clips' },
    { path: 'C:\\Users\\T\\.kadro\\cache\\ai\\nobg_1.webm', size: 2000, mtime: now - 48 * H, dir: 'ai' },
    { path: 'C:\\Users\\T\\.kadro\\cache\\ai\\voice_2.flac', size: 300, mtime: now - 2 * H, dir: 'ai' },           // свежий
    { path: 'C:\\Users\\T\\.kadro\\cache\\recordings\\voice.webm', size: 400, mtime: now - 99 * H, dir: 'recordings' },
  ];

  it('размер по группам', () => {
    expect(summarize(files)).toEqual({ preview: 455, derived: 3300, kept: 400, total: 4155 });
    expect(fmtBytes(5 * 1024)).toBe('5 КБ');
    expect(fmtBytes(300 * 1024 * 1024)).toBe('300 МБ');
    expect(fmtBytes(2.5 * 1024 ** 3)).toBe('2,5 ГБ');
  });

  it('пути из проекта: строки с разделителями, регистр и слэши не важны', () => {
    const p = { assets: [{ path: 'D:\\Видео\\a.mp4', previewPath: 'C:/Users/T/.kadro/cache/proxy/A.mp4', thumbs: ['C:\\Users\\T\\.kadro\\cache\\thumbs\\k\\t0.jpg'], name: 'a.mp4' }],
      tracks: [{ clips: [{ retime: { path: 'C:\\Users\\T\\.kadro\\cache\\clips\\rev_1.mp4' } }] }] };
    const refs = collectPaths(p);
    expect(refs.has(normPath('C:\\Users\\T\\.kadro\\cache\\proxy\\a.mp4'))).toBe(true);
    expect(refs.has('a.mp4')).toBe(false); // просто имя — не путь
    expect(refs.size).toBe(4);
  });

  it('очистка превью: нужное открытому проекту и свежее остаётся, записи голоса — никогда', () => {
    const keep = new Set([normPath('c:/users/t/.kadro/cache/proxy/a.mp4')]);
    const del = planCleanup(files, keep, 'preview', now).map((f) => f.path.split('\\').slice(-2).join('/'));
    expect(del).toEqual(['proxy/b.mp4', 'k/t0.jpg', 'job_1/a.png']);
    expect(planCleanup(files, new Set(), 'kept', now)).toEqual([]);
  });

  it('служебные копии: только старше суток и не нужные ни одному проекту', () => {
    const keep = new Set([normPath('C:\\Users\\T\\.kadro\\cache\\clips\\rev_1.mp4')]);
    expect(planCleanup(files, keep, 'derived', now).map((f) => f.dir + ':' + f.size)).toEqual(['ai:2000']);
  });
});

describe('разрешение проекта', () => {
  it('размер кадра по формату и короткой стороне, стороны чётные', () => {
    expect(sizeFor('9:16', 1080)).toEqual({ width: 1080, height: 1920 });
    expect(sizeFor('9:16', 720)).toEqual({ width: 720, height: 1280 });
    expect(sizeFor('16:9', 2160)).toEqual({ width: 3840, height: 2160 });
    expect(sizeFor('21:9', 1440)).toEqual({ width: 3360, height: 1440 });
    expect(sizeFor('4:5', 720)).toEqual({ width: 720, height: 900 });
    for (const r of RESOLUTIONS) for (const a of ['9:16', '16:9', '1:1', '4:5', '3:4', '4:3', '21:9'] as const) {
      const s = sizeFor(a, r.short);
      expect(s.width % 2 + s.height % 2).toBe(0);
      expect(shortSideOf(s)).toBe(r.short);
    }
    expect(shortSideOf({ width: 1000, height: 1800 })).toBe(1080);
  });
});

describe('экран проектов', async () => {
  const { copyName, filterProjects, safeFileName } = await import('../../src/shared/projects');
  it('имя файла без запрещённых символов', () => {
    expect(safeFileName('Влог: день 1 / море?')).toBe('Влог день 1 море');
    expect(safeFileName('  ...  ')).toBe('Проект');
    expect(safeFileName('CON')).toBe('CON_');
    expect(safeFileName('Свадьба.')).toBe('Свадьба');
  });
  it('копия: «(копия)», потом «(копия 2)», у копии копии — без «(копия) (копия)»', () => {
    const have = new Set(['Влог (копия)']);
    expect(copyName('Влог', (n) => have.has(n))).toBe('Влог (копия 2)');
    expect(copyName('Влог (копия)', (n) => have.has(n))).toBe('Влог (копия 2)');
    expect(copyName('Отпуск', () => false)).toBe('Отпуск (копия)');
  });
  it('поиск без учёта регистра и «ё», порядок по дате и по названию', () => {
    const l = [
      { name: 'Ёлка', mtime: 1, path: 'a' }, { name: 'отпуск 2', mtime: 3, path: 'b' }, { name: 'Отпуск 10', mtime: 2, path: 'c' },
    ];
    expect(filterProjects(l, 'елк', 'date').map((p) => p.path)).toEqual(['a']);
    expect(filterProjects(l, 'ОТПУСК', 'date').map((p) => p.path)).toEqual(['b', 'c']);
    expect(filterProjects(l, '', 'name').map((p) => p.name)).toEqual(['Ёлка', 'отпуск 2', 'Отпуск 10']);
  });
});
