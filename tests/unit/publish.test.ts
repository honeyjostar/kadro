// «Опубликовать»: хэштеги из названия и субтитров, заголовок, подпись по правилам площадки, ссылки только на загрузку.
import { describe, expect, it } from 'vitest';
import { newProject, newTextClip, newTrack } from '../../src/shared/defaults';
import { isKadroUrl } from '../../src/shared/links';
import { hashtagsOf, postFor, publishWarn, PUBLISH_TARGETS, titleOf } from '../../src/shared/publish';

function proj(name: string, caps: string[]) {
  const p = newProject(name, '9:16');
  const t = newTrack('text');
  caps.forEach((c, i) => t.clips.push(newTextClip(i * 2, c, {}, 'caption')));
  p.tracks.push(t);
  return p;
}
const T = (id: string) => PUBLISH_TARGETS.find((t) => t.id === id)!;

describe('опубликовать', () => {
  it('хэштеги: частые длинные слова из субтитров и названия, без «короче», «это», «просто»', () => {
    const p = proj('Поездка в Карелию', ['Короче, это просто Карелия', 'Карелия и озёра, водопад Кивач', 'водопад огромный, озёра чистые']);
    const tags = hashtagsOf(p);
    expect(tags[0]).toBe('#карелия');
    expect(tags).toEqual(expect.arrayContaining(['#водопад', '#озера', '#поездка']));
    expect(tags.join(' ')).not.toMatch(/#короче|#это|#просто/);
  });
  it('заголовок: своё название, а «Новый проект» — первая фраза субтитров', () => {
    expect(titleOf(proj('Мой влог', ['Привет'])).trim()).toBe('Мой влог');
    expect(titleOf(proj('Новый проект', ['Сегодня мы едем на Байкал.', 'Там холодно']))).toBe('Сегодня мы едем на Байкал.');
  });
  it('YouTube Shorts: #shorts в названии, остальное — в описании; TikTok — одна подпись с тегами', () => {
    const s = postFor(T('shorts'), 'Байкал зимой', ['#байкал', '#лед', '#зима', '#путешествие']);
    expect(s.title).toBe('Байкал зимой #shorts');
    expect(s.text).toBe('#байкал #лед #зима #shorts');
    const t = postFor(T('tiktok'), 'Байкал зимой', ['#байкал']);
    expect(t.title).toBe('');
    expect(t.text).toBe('Байкал зимой\n\n#байкал');
  });
  it('длинный заголовок обрезается по слову', () => {
    const r = postFor(T('rutube'), 'слово '.repeat(40).trim(), []);
    expect(r.title.length).toBeLessThanOrEqual(100);
    expect(r.title.endsWith('…')).toBe(true);
  });
  it('замечания: длина и горизонталь для вертикальной ленты', () => {
    expect(publishWarn(T('reels'), 200, 1080, 1920)).toContain('180');
    expect(publishWarn(T('tiktok'), 30, 1920, 1080)).toContain('Горизонтальное');
    expect(publishWarn(T('vkvideo'), 1200, 1920, 1080)).toBeNull();
  });
  it('Kadro открывает только страницы загрузки площадок, а не любые адреса', () => {
    for (const t of PUBLISH_TARGETS) expect(isKadroUrl(t.url)).toBe(true);
    expect(isKadroUrl('https://www.tiktok.com/@someone')).toBe(false);
    expect(isKadroUrl('https://vk.com/clips?x=1')).toBe(false);
  });
});
