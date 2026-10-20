import { useEffect, useRef } from 'react';
import { deleteSelection, dropPaths, duplicateSelection, reportMissing, saveProject, splitAtPlayhead, groupSelection, ungroupSelection } from '../actions';
import { api, getState, useStore } from '../store';
import { ExportDialog } from './ExportDialog';
import { Home } from './Home';
import { Model3DDialog } from './Objects3D';
import { Inspector } from './Inspector';
import { LeftPanel, Rail } from './LeftPanel';
import { Jobs, Toasts } from './Overlays';
import { Player } from './Player';
import { Timeline } from './Timeline';
import { TopBar } from './TopBar';
import { projectDuration } from '../../shared/timeline';

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'TEXTAREA' || (tag === 'INPUT' && !['range', 'checkbox', 'color', 'button'].includes((t as HTMLInputElement).type)) || tag === 'SELECT' || t.isContentEditable;
}

export function App() {
  const tlHeight = useStore((s) => s.tlHeight);
  const exportOpen = useStore((s) => s.exportOpen);
  const home = useStore((s) => s.home);
  const m3d = useStore((s) => s.model3dEdit);
  const loaded = useRef(false);

  // восстановление последнего проекта, обновления файлов из главного процесса
  useEffect(() => {
    const off = api.onAssetUpdate((id, patch) => getState().patchAsset(id, patch));
    api.loadLast().then((r) => {
      if (r?.project?.tracks) { getState().replace(r.project, r.path); reportMissing(r.project); }
      loaded.current = true;
    }).catch(() => { loaded.current = true; });
    // главный экран при запуске (можно выключить на нём самом)
    api.homeInfo().then((i) => { getState().setDemo(i.demo); if (i.autoOpen) getState().setHome(true); }).catch(() => undefined);
    return off;
  }, []);

  // автосохранение и заголовок окна
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.project !== prev.project || s.projectPath !== prev.projectPath || s.dirty !== prev.dirty) {
        api.setTitle(`${s.project.name}${s.dirty ? ' •' : ''} — Kadro`);
      }
      if (s.project === prev.project || !loaded.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => api.autosave(getState().project, getState().projectPath), 1200);
    });
    return () => { unsub(); clearTimeout(timer); };
  }, []);

  // горячие клавиши
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = getState();
      if (s.home) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const fps = s.project.settings.fps;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') { e.preventDefault(); s.setPlaying(!s.playing); return; }
      if (ctrl && (k === 'z' || k === 'я') && !e.shiftKey) { e.preventDefault(); s.undo(); return; }
      if (ctrl && ((k === 'z' || k === 'я') && e.shiftKey || k === 'y' || k === 'н')) { e.preventDefault(); s.redo(); return; }
      if (ctrl && (k === 's' || k === 'ы')) { e.preventDefault(); void saveProject(e.shiftKey); return; }
      if (ctrl && (k === 'e' || k === 'у')) { e.preventDefault(); s.setExportOpen(true); return; }
      if (ctrl && (k === 'd' || k === 'в')) { e.preventDefault(); duplicateSelection(); return; }
      if (ctrl && (k === 'b' || k === 'и')) { e.preventDefault(); splitAtPlayhead(); return; }
      if (ctrl && (k === 'g' || k === 'п')) { e.preventDefault(); if (e.shiftKey) ungroupSelection(); else void groupSelection(); return; }
      if (!ctrl && (k === 's' || k === 'ы')) { e.preventDefault(); splitAtPlayhead(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); s.setPlaying(false); s.setPlayhead(Math.max(0, s.playhead - (e.shiftKey ? 1 : 1 / fps))); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); s.setPlaying(false); s.setPlayhead(Math.min(projectDuration(s.project), s.playhead + (e.shiftKey ? 1 : 1 / fps))); return; }
      if (e.key === 'Home') { s.setPlayhead(0); return; }
      if (e.key === 'End') { s.setPlayhead(projectDuration(s.project)); return; }
      if (e.key === 'Escape') { s.select([]); return; }
      if (e.key === '+' || e.key === '=') { s.setZoom(s.pxPerSec * 1.25); return; }
      if (e.key === '-') { s.setZoom(s.pxPerSec / 1.25); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // файлы, брошенные в окно
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
      getState().setHome(false);
      void dropPaths(paths);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, []);

  const onSplitter = (e: React.MouseEvent) => {
    const startY = e.clientY;
    const startH = getState().tlHeight;
    const move = (ev: MouseEvent) => getState().setTlHeight(startH - (ev.clientY - startY));
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div className="app" style={{ ['--tl-h' as string]: `${tlHeight}px` }}>
      <TopBar />
      <div className="workspace">
        <Rail />
        <LeftPanel />
        <Player />
        <Inspector />
      </div>
      <div className="splitter" onMouseDown={onSplitter} title="Потяни, чтобы изменить высоту таймлайна" />
      <Timeline />
      {exportOpen && <ExportDialog />}
      {home && <Home />}
      {m3d && <Model3DDialog key={`${m3d.init.source}-${m3d.clipId ?? ''}`} />}
      <Jobs />
      <Toasts />
    </div>
  );
}
