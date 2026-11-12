// История действий (подписи по разнице проектов) и версии проекта (что хранить, снимки на диске).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeChange, historyItems } from '../../src/shared/history';
import { versionsToDrop } from '../../src/shared/versions';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addToMain, mainTrack, setSettings, splitClip, updateClip } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip, Project } from '../../src/shared/types';

const asset = (id: string, name: string): MediaAsset => ({ id, kind: 'video', path: `/${name}`, previewPath: `/${name}`, name, duration: 10, width: 640, height: 360, fps: 30, hasVideo: true, hasAudio: false, size: 1, rotation: 0, proxy: 'none' } as MediaAsset);

describe('подписи шагов истории', () => {
  const p0 = addAsset(newProject('t'), asset('a', 'море.mp4'));
  const p1 = addToMain(p0, 'a', 0).project;
  const c = mainTrack(p1).clips[0] as MediaClip;
  it('добавлен, разрезан, удалён, цвет, формат', () => {
    expect(describeChange(p0, p1)).toBe('Добавлен: море.mp4');
    const p2 = splitClip(p1, c.id, 4).project;
    expect(describeChange(p1, p2)).toBe('Разрезан: море.mp4');
    const p3 = updateClip(p1, c.id, { color: { ...c.color, brightness: 1.3 } });
    expect(describeChange(p1, p3)).toBe('Цвет: море.mp4');
    const p4 = updateClip(p1, c.id, { blurs: [] });
    expect(describeChange(p1, p4)).toBe('Скрытие лиц и номеров: море.mp4');
    const p5 = { ...p1, tracks: p1.tracks.map((t) => ({ ...t, clips: [] })) };
    expect(describeChange(p1, p5)).toBe('Удалён: море.mp4');
    expect(describeChange(p1, setSettings(p1, { aspect: '1:1' }))).toBe('Формат кадра 1:1');
  });
  it('список: начало, шаги, текущий и отменённые', () => {
    const p2 = updateClip(p1, c.id, { volume: 0.5 });
    const items = historyItems([p0, p1], p2, [updateClip(p2, c.id, { speed: 2 })]);
    expect(items.map((x) => x.label)).toEqual(['Начало', 'Добавлен: море.mp4', 'Звук: море.mp4', 'Скорость: море.mp4']);
    expect(items[2].current).toBe(true);
    expect(items[3].future).toBe(true);
  });
});

describe('версии проекта', () => {
  const H = 3_600_000, DAY = 24 * H;
  it('последние за сутки — все (до 40), старше — по одной в день, старше 30 дней — нет', () => {
    const now = Date.UTC(2026, 10, 12, 12);
    const recent = Array.from({ length: 10 }, (_, i) => now - i * 0.2 * H);
    const yesterday = [now - DAY - H, now - DAY - 2 * H, now - DAY - 3 * H];
    const old = [now - 40 * DAY];
    const drop = versionsToDrop([...recent, ...yesterday, ...old], now);
    expect(drop).toContain(old[0]);
    expect(recent.some((t) => drop.includes(t))).toBe(false);
    expect(yesterday.filter((t) => drop.includes(t))).toHaveLength(2); // из вчерашних остаётся одна (самая новая)
    expect(drop).not.toContain(yesterday[0]);
  });

  it('снимок на диске: одинаковый не повторяется, список новыми сверху, чтение', async () => {
    const old = process.env.KADRO_DATA;
    process.env.KADRO_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-ver-'));
    try {
    const { snapshot, listVersions, readVersion } = await import('../../src/main/versions');
    let p: Project = addToMain(addAsset(newProject('Ролик'), asset('a', 'море.mp4')), 'a', 0).project;
    const t0 = Date.now();
    expect(snapshot(p, t0)).toBe(true);
    expect(snapshot({ ...p, updatedAt: 123 }, t0 + 1000)).toBe(false); // только время правки — не изменение
    p = updateClip(p, mainTrack(p).clips[0].id, { volume: 0.4 });
    expect(snapshot(p, t0 + 2000)).toBe(true);
    const list = listVersions(p);
    expect(list).toHaveLength(2);
    expect(list[0].time).toBeGreaterThan(list[1].time);
    expect(list[0].clips).toBe(1);
    expect((readVersion(list[0].file).tracks[0].clips[0] as MediaClip).volume).toBe(0.4);
    expect(() => readVersion('/etc/passwd')).toThrow();
    } finally {
      if (old === undefined) delete process.env.KADRO_DATA; else process.env.KADRO_DATA = old;
    }
  });
});
