// Импорт: «Открыть» принимает видео (не только проект), Kadro открывается с файлом («Открыть с помощью»),
// разные форматы видео, фото и звука добавляются как обычно.
import { expect, test } from '@playwright/test';
import { ff, launch, media, project, solidVideo, state, type Kadro } from './kadro';

test.setTimeout(150_000);

const vertical = () => media('vertical.mp4', (f) => ff(['-f', 'lavfi', '-i', 'color=c=purple:s=360x640:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=2',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f]));
const square = () => media('square.png', (f) => ff(['-f', 'lavfi', '-i', 'color=c=orange:s=500x500', '-frames:v', '1', f]));

let K: Kadro | undefined;
test.afterEach(async () => {
  const errs = K?.errors ?? [];
  await K?.app.close();
  K = undefined;
  expect(errs, `ошибки в окне:\n${errs.join('\n')}`).toEqual([]);
});

test('«Открыть» на главном экране: видео → новый проект под формат видео', async () => {
  const wide = solidVideo('red3.mp4', 'red', 3);
  K = await launch({ env: { KADRO_SKIP_HOME: '', KADRO_TEST_OPEN: [vertical(), wide].join('|') } });
  const win = K.win;
  await expect(win.getByTestId('home')).toBeVisible();
  await win.getByTestId('home-open').click();
  await expect(win.getByTestId('home')).toHaveCount(0);
  await expect.poll(async () => (await project(win)).tracks[0].clips.length, { timeout: 30_000 }).toBe(2);
  const p = await project(win);
  // формат — по первому видео (вертикальное 360×640 → 9:16)
  expect(p.settings.aspect).toBe('9:16');
  expect(p.assets.map((a) => a.kind)).toEqual(['video', 'video']);
  // у видео со звуком звук на месте (дорожка звука — внутри клипа или отдельная)
  expect(p.tracks[0].clips.every((c) => c.type === 'media')).toBe(true);
});

test('Kadro открыт с файлами («Открыть с помощью» в Проводнике) — сразу на таймлайне', async () => {
  const wide = solidVideo('blue3.mp4', 'blue', 3);
  K = await launch({ env: { KADRO_SKIP_HOME: '', KADRO_OPEN_FILES: [wide, square()].join('|') } });
  const win = K.win;
  await expect(win.getByTestId('home')).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(async () => (await project(win)).tracks[0].clips.length, { timeout: 30_000 }).toBe(2);
  const p = await project(win);
  expect(p.settings.aspect).toBe('16:9');
  expect(p.settings.width).toBe(1920);
  expect(await state<boolean>(win, '(s) => s.home')).toBe(false);
});

test('форматы: mkv, mov, webm, avi, flv, ts, m4v, webp, bmp, tiff, flac, ogg, m4a, opus — все добавляются', async () => {
  K = await launch({ env: { KADRO_SKIP_HOME: '1' } });
  const win = K.win;
  const v = (ext: string, codec: string[]) => media(`fmt.${ext}`, (f) => ff(['-f', 'lavfi', '-i', 'testsrc=s=320x240:r=25:d=1', '-f', 'lavfi', '-i', 'sine=duration=1', ...codec, '-shortest', f]));
  const img = (ext: string) => media(`fmt-img.${ext}`, (f) => ff(['-f', 'lavfi', '-i', 'testsrc=s=320x240', '-frames:v', '1', f]));
  const aud = (ext: string, codec: string[]) => media(`fmt-aud.${ext}`, (f) => ff(['-f', 'lavfi', '-i', 'sine=duration=1', ...codec, f]));
  const files = [
    v('mkv', ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac']),
    v('mov', ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac']),
    v('webm', ['-c:v', 'libvpx', '-deadline', 'realtime', '-b:v', '300k', '-c:a', 'libopus']),
    v('avi', ['-c:v', 'mpeg4', '-c:a', 'mp3']),
    v('flv', ['-c:v', 'flv', '-c:a', 'mp3', '-ar', '44100']),
    v('ts', ['-c:v', 'mpeg2video', '-c:a', 'mp2']),
    v('m4v', ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac']),
    img('webp'), img('bmp'), img('tiff'),
    aud('flac', ['-c:a', 'flac']), aud('ogg', ['-c:a', 'libvorbis']), aud('m4a', ['-c:a', 'aac']), aud('opus', ['-c:a', 'libopus']),
  ];
  const ids = await win.evaluate((f) => (window as any).__kadro.actions.importPaths(f), files);
  expect(ids).toHaveLength(files.length);
  const p = await project(win);
  const kinds = Object.fromEntries(p.assets.map((a) => [a.path.split('.').pop(), a.kind]));
  expect(kinds).toEqual({
    mkv: 'video', mov: 'video', webm: 'video', avi: 'video', flv: 'video', ts: 'video', m4v: 'video',
    webp: 'image', bmp: 'image', tiff: 'image',
    flac: 'audio', ogg: 'audio', m4a: 'audio', opus: 'audio',
  });
  for (const a of p.assets) if (a.kind !== 'image') expect(a.duration, a.path).toBeGreaterThan(0.5);
});
