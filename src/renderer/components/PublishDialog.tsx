// Окно «Опубликовать»: для каждой площадки — готовая подпись с хэштегами и страница загрузки в один щелчок.
// Kadro не входит в аккаунты: текст копируется, файл показывается в папке, страница загрузки открывается в браузере.
import { Copy, ExternalLink, FolderOpen, ImageDown, Share2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { tx } from '../../shared/i18n';
import { hashtagsOf, postFor, publishWarn, PUBLISH_TARGETS, titleOf, type PublishTarget } from '../../shared/publish';
import { api, getState, useStore } from '../store';

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function PublishDialog() {
  const open = useStore((s) => s.publishOpen)!;
  const project = useStore((s) => s.project);
  const close = () => getState().setPublishOpen(null);
  const [file, setFile] = useState<string | null>(open.file);
  const fromProject = !!open.file;
  const [title, setTitle] = useState(() => (fromProject ? titleOf(project) : ''));
  const [tags, setTags] = useState(() => (fromProject ? hashtagsOf(project).join(' ') : ''));
  const [info, setInfo] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => { if (file) void api.probeVideo(file).then(setInfo); }, [file]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tagList = useMemo(() => tags.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`)), [tags]);
  const pick = async () => {
    const files: string[] | null = await api.pickMedia();
    const f = files?.find((x) => /\.(mp4|mov|m4v|webm)$/i.test(x)) ?? files?.[0];
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };
  const post = (t: PublishTarget) => postFor(t, title.trim(), tagList);
  const go = async (t: PublishTarget) => {
    if (!file) return;
    const p = post(t);
    const ok = await copy(p.title || p.text);
    api.showInFolder(file);
    await api.openUrl(t.url);
    api.track(`publish/${t.id}`);
    setDone((d) => ({ ...d, [t.id]: true }));
    getState().toast(ok
      ? (p.title ? tx('Название скопировано — вставь его (Ctrl+V). Файл — в открывшейся папке: перетащи его на страницу загрузки.') : tx('Подпись скопирована — вставь её (Ctrl+V). Файл — в открывшейся папке: перетащи его на страницу загрузки.'))
      : tx('Файл — в открывшейся папке: перетащи его на страницу загрузки.'), 'ok');
  };
  const name = file?.split(/[\\/]/).pop() ?? '';

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal publish-modal" role="dialog" aria-label={tx('Опубликовать')} data-testid="publish-dialog">
        <div className="modal-head">
          <h3><Share2 size={18} className="reach-ico" />{tx('Опубликовать')}</h3>
          <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>
        </div>
        <p className="hint">{tx('Подпись с хэштегами для каждой площадки и страница загрузки в один щелчок. Kadro не входит в твои аккаунты: текст копируется, файл показывается в папке — остаётся перетащить его и вставить текст.')}</p>

        <div className="reach-file">
          {file ? <span className="reach-name" title={file}>{name}</span> : <span className="hint">{tx('Ролик не выбран')}</span>}
          {file && <button className="btn small ghost" onClick={() => api.showInFolder(file)}><FolderOpen size={13} />{tx('Показать')}</button>}
          <button className="btn small" onClick={() => void pick()} data-testid="publish-pick"><FolderOpen size={13} />{file ? tx('Другой ролик…') : tx('Выбрать ролик…')}</button>
        </div>

        <div className="publish-fields">
          <label className="field">
            <span className="field-row"><span>{tx('Название')}</span></span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder={tx('О чём ролик — коротко')} data-testid="publish-title" />
          </label>
          <label className="field">
            <span className="field-row"><span>{tx('Хэштеги')}</span><span className="hint small">{tx('из названия и субтитров — поправь')}</span></span>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={tx('#монтаж #влог')} data-testid="publish-tags" />
          </label>
          {fromProject && <button className="btn small" onClick={() => { close(); getState().setCoverOpen(true); }}><ImageDown size={13} />{tx('Сделать обложку')}</button>}
        </div>

        <div className="publish-grid" data-testid="publish-grid">
          {PUBLISH_TARGETS.map((t) => {
            const p = post(t);
            const warn = info ? publishWarn(t, info.duration, info.width, info.height) : null;
            return (
              <div key={t.id} className={`publish-card ${done[t.id] ? 'done' : ''}`} data-testid={`publish-${t.id}`}>
                <div className="publish-card-head"><b>{t.label}</b>{done[t.id] && <span className="reach-done">{tx('открыто')}</span>}</div>
                {warn && <div className="publish-warn"><TriangleAlert size={12} />{warn}</div>}
                {p.title && <div className="publish-line"><span className="hint small">{tx('Название')}</span><span className="publish-text" data-testid="publish-title-text">{p.title || '—'}</span></div>}
                <div className="publish-line"><span className="hint small">{p.title ? tx('Описание') : tx('Подпись')}</span><span className="publish-text" data-testid="publish-text">{p.text || '—'}</span></div>
                <p className="hint small publish-how">{t.how}</p>
                <div className="publish-btns">
                  {p.title && <button className="btn small ghost" onClick={() => void copy(p.text).then((ok) => ok && getState().toast(tx('Описание скопировано'), 'ok'))}><Copy size={12} />{tx('Описание')}</button>}
                  <button className="btn small primary" disabled={!file} onClick={() => void go(t)} data-testid={`publish-go-${t.id}`}><ExternalLink size={12} />{tx('Выложить')}</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="actions">
          <button className="btn" onClick={close}>{tx('Готово')}</button>
        </div>
      </div>
    </div>
  );
}
