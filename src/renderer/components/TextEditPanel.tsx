// «Монтаж текстом»: расшифровка ролика словами. Выдели слова и нажми Delete — этот кусок вырезан из видео,
// субтитры сдвинулись. Щелчок по слову — плеер на этом месте. Сверху — команды словами: «убери паузы, музыку тише».
import { Scissors, Sparkles, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { tx } from '../../shared/i18n';
import { cutLength, cutRanges, fillerIndices, transcriptWords } from '../../shared/textEdit';
import { autoZoomWords, cutWords, ensureTranscript, removeAutoZoom, runCommands } from '../actions';
import { useJobRunning } from '../hooks';
import { getState, useStore } from '../store';
import { txj } from '../txj';

export function TextEditPanel() {
  const project = useStore((s) => s.project);
  const playhead = useStore((s) => s.playhead);
  const words = useMemo(() => transcriptWords(project), [project]);
  const fillers = useMemo(() => new Set(fillerIndices(words)), [words]);
  const [sel, setSel] = useState<number[]>([]);
  const anchor = useRef<number | null>(null);
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const capRunning = useJobRunning('cap_');
  const silRunning = useJobRunning('sil_');
  const running = capRunning || silRunning;
  const close = () => getState().setTextEditOpen(false);
  // после правки номера слов другие — выделение сбрасываем
  useEffect(() => { setSel([]); anchor.current = null; }, [words]);

  const cut = () => { if (sel.length) cutWords(sel); };
  // Delete / Backspace здесь — вырезать слова (а не удалять клип), Esc — снять выделение
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) { e.preventDefault(); e.stopPropagation(); cut(); }
      else if (e.key === 'Escape' && sel.length) { e.preventDefault(); e.stopPropagation(); setSel([]); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const onWord = (i: number, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current !== null) {
      const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)];
      setSel(Array.from({ length: b - a + 1 }, (_, k) => a + k));
    } else if (e.ctrlKey || e.metaKey) {
      setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
      anchor.current = i;
    } else {
      setSel([i]);
      anchor.current = i;
    }
    const s = getState();
    s.setPlaying(false);
    s.setPlayhead(words[i].start);
  };
  const doCmd = async () => {
    if (!cmd.trim()) return;
    setBusy(true);
    try { const r = await runCommands(cmd); if (!r.unknown.length) setCmd(''); } finally { setBusy(false); }
  };
  const recognize = async () => { setBusy(true); try { await ensureTranscript(); } finally { setBusy(false); } };

  const current = words.findIndex((w) => playhead >= w.start && playhead < w.end);
  const hasZoom = project.tracks.some((t) => t.clips.some((c) => c.type === 'media' && !!c.autoZoom?.length));
  const selSec = sel.length ? cutLength(cutRanges(words, sel)) : 0;
  // абзацы — по фразам субтитров
  const paras: number[][] = [];
  words.forEach((w, i) => { const last = paras[paras.length - 1]; if (last && words[last[0]].clipId === w.clipId) last.push(i); else paras.push([i]); });

  return (
    <aside className="panel textedit" data-testid="textedit">
      <div className="panel-head">
        <span>{tx('Монтаж текстом')}</span>
        <button className="icon-btn" onClick={close} title={tx('Закрыть')} data-testid="textedit-close"><X size={16} /></button>
      </div>
      <div className="panel-body">
        <form className="textedit-cmd" onSubmit={(e) => { e.preventDefault(); void doCmd(); }}>
          <Sparkles size={15} />
          <input className="input" value={cmd} onChange={(e) => setCmd(e.target.value)} disabled={busy || running} data-testid="textedit-cmd"
            placeholder={tx('Скажи, что сделать: «убери паузы, музыку тише»')} aria-label={tx('Команда словами')} />
          <button className="btn small primary" disabled={!cmd.trim() || busy || running} data-testid="textedit-run">{tx('Сделать')}</button>
        </form>
        <p className="hint small">{tx('Понимает: убери паузы, убери слова-паразиты, добавь или спрячь субтитры, музыку тише / громче, голос громче, чистый голос, 9:16 / 16:9 / квадрат, ускорь в 2 раза, убери фон, скрой лица, автозум, обложка, экспорт.')}</p>

        {words.length === 0 ? (
          <div className="textedit-empty">
            <p className="hint">{tx('Kadro распознает речь в ролике и покажет её текстом. Удалишь слово — вырежется и кусок видео.')}</p>
            <button className="btn primary block" onClick={() => void recognize()} disabled={busy || running} data-testid="textedit-recognize"><Wand2 size={14} />{tx('Распознать речь')}</button>
          </div>
        ) : (
          <>
            <div className="textedit-tools">
              <button className="btn small" disabled={!fillers.size} onClick={() => setSel([...fillers])} data-testid="textedit-fillers"
                title={tx('Э-э, ну, типа, короче, как бы — выделить, а удалить — Delete')}>{txj('Паразиты: {0}', fillers.size)}</button>
              <button className="btn small primary" disabled={!sel.length} onClick={cut} data-testid="textedit-cut"><Scissors size={13} />{tx('Вырезать')}</button>
              {sel.length > 0 && <span className="hint small">{txj('Выделено: {0} · −{1} с', sel.length, selSec.toFixed(1))}</span>}
            </div>
            <div className="textedit-zoom" data-testid="textedit-zoom">
              <span className="hint small">{tx('Автозум на важных словах:')}</span>
              {(['soft', 'mid', 'strong'] as const).map((k) => (
                <button key={k} className="btn small" disabled={busy || running} onClick={() => void autoZoomWords(k)} data-testid={`zoom-${k}`}>
                  {k === 'soft' ? tx('Мягко') : k === 'mid' ? tx('Средне') : tx('Сильно')}
                </button>
              ))}
              {hasZoom && <button className="btn small ghost" onClick={removeAutoZoom} data-testid="zoom-off">{tx('Убрать')}</button>}
            </div>
            <div className="textedit-text" data-testid="textedit-text">
              {paras.map((p) => (
                <p key={p[0]}>
                  {p.map((i) => (
                    <span key={i} className={`tw ${sel.includes(i) ? 'sel' : ''} ${fillers.has(i) ? 'filler' : ''} ${i === current ? 'cur' : ''}`}
                      onClick={(e) => onWord(i, e)} data-testid="tw">{words[i].text}</span>
                  ))}
                </p>
              ))}
            </div>
            <p className="hint small">{tx('Щелчок — к слову, Shift — выделить до слова, Ctrl — добавить слово. Delete — вырезать, Ctrl+Z — вернуть.')}</p>
          </>
        )}
      </div>
    </aside>
  );
}
