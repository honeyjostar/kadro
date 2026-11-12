// Окно «Обложка»: Kadro сам находит лучшие кадры ролика, ставит заголовок — остаётся нажать «Сохранить».
import { ImageDown, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { tx } from '../../shared/i18n';
import { pickFrames, type CoverFormat, type CoverStyle } from '../../shared/cover';
import { coverFrames, saveCover, type CoverFrame } from '../actions';
import { coverBlob, coverFontsReady, drawCover } from '../coverDraw';
import { getState, useStore } from '../store';
import { Field, Seg } from './controls';

let lastLook: { format: CoverFormat; style: CoverStyle } | null = null;

export function CoverDialog() {
  const project = useStore((s) => s.project);
  const close = () => getState().setCoverOpen(false);
  const vertical = project.settings.height > project.settings.width;
  const [format, setFormat] = useState<CoverFormat>(lastLook?.format ?? (vertical ? 'vertical' : 'youtube'));
  const [style, setStyle] = useState<CoverStyle>(lastLook?.style ?? 'bright');
  const [title, setTitle] = useState(project.name);
  const [frames, setFrames] = useState<CoverFrame[] | null>(null);
  const [pick, setPick] = useState(0);
  const [fontsOk, setFontsOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => { lastLook = { format, style }; }, [format, style]);
  useEffect(() => {
    let alive = true;
    void coverFontsReady().then(() => alive && setFontsOk(true));
    void coverFrames().then((all) => { if (alive) setFrames(pickFrames(all, 6)); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const frame = frames?.[pick] ?? null;
  useEffect(() => {
    if (ref.current) drawCover(ref.current, frame?.img ?? null, { title, format, style });
  }, [frame, title, format, style, fontsOk]);

  const save = async (fmts: CoverFormat[]) => {
    setSaving(true);
    try {
      for (const f of fmts) {
        const cv = document.createElement('canvas');
        drawCover(cv, frame?.img ?? null, { title, format: f, style });
        const blob = await coverBlob(cv);
        if (blob) await saveCover(`${project.name} — ${f === 'youtube' ? tx('обложка YouTube') : tx('обложка TikTok')}`, blob);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal cover-modal" role="dialog" aria-label={tx('Обложка')} data-testid="cover-dialog">
        <div className="modal-head">
          <h3>{tx('Обложка')}</h3>
          <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>
        </div>
        <div className="cover-body">
          <div className={`cover-preview ${format}`}>
            <canvas ref={ref} data-testid="cover-canvas" />
            {!frames && <div className="cover-wait hint">{tx('Ищу лучшие кадры…')}</div>}
          </div>
          <div className="cover-side">
            <Field label={tx('Для чего')}>
              <Seg value={format} onChange={setFormat} testId="cover-format"
                options={[{ value: 'youtube', label: tx('YouTube 16:9') }, { value: 'vertical', label: tx('TikTok 9:16') }]} />
            </Field>
            <Field label={tx('Заголовок')}>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} data-testid="cover-title" />
              <p className="hint small">{tx('Коротко и крупно — 2–5 слов. *Слово* в звёздочках выделится цветом, иначе — самое длинное.')}</p>
            </Field>
            <Field label={tx('Стиль')}>
              <Seg value={style} onChange={setStyle} testId="cover-style"
                options={[{ value: 'bright', label: tx('Ярко') }, { value: 'clean', label: tx('Чисто') }, { value: 'plate', label: tx('Плашка') }]} />
            </Field>
            <div className="section-title">{tx('Кадр')}</div>
            <div className="cover-frames" data-testid="cover-frames">
              {frames?.map((f, i) => (
                <button key={f.file} className={i === pick ? 'active' : ''} onClick={() => setPick(i)} data-testid="cover-frame" title={tx('Кадр на {0} с', f.t.toFixed(1))}>
                  <img src={f.url} alt="" />
                </button>
              ))}
              {frames && !frames.length && <p className="hint small">{tx('В ролике нет видео или фото — обложка будет с заголовком на тёмном фоне.')}</p>}
            </div>
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => void save(format === 'youtube' ? ['youtube', 'vertical'] : ['vertical', 'youtube'])} disabled={saving} data-testid="cover-save-both">{tx('Сохранить обе')}</button>
          <button className="btn primary" onClick={() => void save([format])} disabled={saving} data-testid="cover-save"><ImageDown size={15} />{tx('Сохранить PNG')}</button>
        </div>
      </div>
    </div>
  );
}
