import { tx } from '../../shared/i18n';
import { useEffect, useRef } from 'react';
import { deleteSelection, dropOnHome, dropPaths, duplicateSelection, openFiles, reportMissing, saveProject, splitAtPlayhead, groupSelection, addMarkerAtPlayhead, jumpMarker, copyClipAttrs, openPasteAttrs, ungroupSelection } from '../actions';
import { api, getState, useStore } from '../store';
import { ExportDialog } from './ExportDialog';
import { Home } from './Home';
import { Model3DDialog } from './Objects3D';
import { AutoEditDialog } from './AutoEdit';
import { SettingsDialog } from './Settings';
import { SourceView } from './SourceView';
import { ScriptDialog } from './ScriptDialog';
import { BugDialog } from './BugDialog';
import { PluginCatalog, reportInstall } from './PluginCatalog';
import { UpdateCard, useUpdateFeed } from './Update';
import { PasteAttrsDialog } from './PasteAttrs';
import { ShortcutsDialog } from './Shortcuts';
import { ChromaPaintDialog } from './ChromaPaint';
import { RefEditDialog } from './RefEdit';
import { Inspector } from './Inspector';
import { LeftPanel, Rail } from './LeftPanel';
import { Jobs, Toasts } from './Overlays';
import { Player } from './Player';
import { Timeline } from './Timeline';
import { TopBar } from './TopBar';
import { projectDuration } from '../../shared/timeline';
import { initFonts, reportFontInstall } from '../userFonts';

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
  const autoOpen = useStore((s) => s.autoOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const sourceView = useStore((s) => s.sourceView);
  const scriptOpen = useStore((s) => s.scriptOpen);
  const bugOpen = useStore((s) => s.bugOpen);
  const catalogOpen = useStore((s) => s.pluginCatalogOpen);
  useUpdateFeed();
  useEffect(initFonts, []);
  const pasteOpen = useStore((s) => s.pasteOpen);
  const copiedAttrs = useStore((s) => s.copiedAttrs);
  const chromaPaintClip = useStore((s) => s.chromaPaintClip);
  const refOpen = useStore((s) => s.refOpen);
  const keysOpen = useStore((s) => s.keysOpen);
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
    let since = 0; // когда появились несохранённые изменения
    const save = () => { since = 0; api.autosave(getState().project, getState().projectPath); };
    const unsub = useStore.subscribe((s, prev) => {
      if (s.project !== prev.project || s.projectPath !== prev.projectPath || s.dirty !== prev.dirty) {
        api.setTitle(`${s.project.name}${s.dirty ? ' •' : ''} — Kadro`);
      }
      if (s.project === prev.project || !loaded.current) return;
      clearTimeout(timer);
      // через 1,2 с после последней правки, но не реже раза в 3 с: пока в фоне идут миниатюры и прокси,
      // проект меняется постоянно — без этого черновик не сохранялся бы, пока они не доделаются
      const now = Date.now();
      if (!since) since = now;
      if (now - since > 3000) { save(); return; }
      timer = setTimeout(save, 1200);
    });
    // закрыли окно раньше, чем сработал таймер, — сохраняем сразу
    const onClose = () => {
      if (!since) return;
      clearTimeout(timer);
      since = 0;
      api.autosaveNow(getState().project, getState().projectPath);
    };
    window.addEventListener('beforeunload', onClose);
    return () => { unsub(); clearTimeout(timer); window.removeEventListener('beforeunload', onClose); };
  }, []);

  // горячие клавиши
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = getState();
      // окно со всеми клавишами — отовсюду, и с главного экрана, и из поля ввода (F1 и Ctrl+/ текст не печатают)
      if (e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.code === 'Slash')) { e.preventDefault(); s.setKeysOpen(!s.keysOpen); return; }
      if (isTyping(e)) return;
      if (s.home) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const fps = s.project.settings.fps;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') { e.preventDefault(); s.setPlaying(!s.playing); return; }
      if (ctrl && (k === 'z' || k === 'я') && !e.shiftKey) { e.preventDefault(); s.undo(); return; }
      if (ctrl && ((k === 'z' || k === 'я') && e.shiftKey || k === 'y' || k === 'н')) { e.preventDefault(); s.redo(); return; }
      if (ctrl && (k === 's' || k === 'ы')) { e.preventDefault(); void saveProject(e.shiftKey); return; }
      if (ctrl && (k === 'e' || k === 'у')) { e.preventDefault(); s.setExportOpen(true); return; }
      // параметры клипа: Ctrl+Shift+C — скопировать, Ctrl+Shift+V — вставить (по клавише — в любой раскладке)
      if (ctrl && e.shiftKey && e.code === 'KeyC') { e.preventDefault(); copyClipAttrs(); return; }
      if (ctrl && e.shiftKey && e.code === 'KeyV') { e.preventDefault(); openPasteAttrs(); return; }
      if (ctrl && (k === 'd' || k === 'в')) { e.preventDefault(); duplicateSelection(); return; }
      if (ctrl && (k === 'b' || k === 'и')) { e.preventDefault(); splitAtPlayhead(); return; }
      if (ctrl && (k === 'a' || k === 'ф')) { e.preventDefault(); s.select(s.project.tracks.flatMap((t) => t.clips.map((c) => c.id))); return; }
      if (ctrl && (k === 'g' || k === 'п')) { e.preventDefault(); if (e.shiftKey) ungroupSelection(); else void groupSelection(); return; }
      if (!ctrl && (k === 's' || k === 'ы')) { e.preventDefault(); splitAtPlayhead(); return; }
      // маркеры: M — поставить, Shift+M — к следующему, Ctrl+Shift+M — к предыдущему
      if (k === 'm' || k === 'ь' || e.code === 'KeyM') {
        e.preventDefault();
        if (ctrl && e.shiftKey) jumpMarker(-1); else if (e.shiftKey) jumpMarker(1); else if (!ctrl) addMarkerAtPlayhead();
        return;
      }
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
      let paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
      // шейдеры .glsl — это плагины: ставим в папку плагинов
      const shaders = paths.filter((p) => /\.(glsl|frag)$/i.test(p));
      if (shaders.length) { void api.installPluginFiles(shaders).then(reportInstall); paths = paths.filter((p) => !shaders.includes(p)); }
      // шрифты — ставим в «Мои шрифты»
      const fonts = paths.filter((p) => /\.(ttf|otf|ttc|otc|woff2?)$/i.test(p));
      if (fonts.length) { void api.installFonts(fonts).then(reportFontInstall); paths = paths.filter((p) => !fonts.includes(p)); }
      if (!paths.length) return;
      // на главный экран — новым проектом (текущий не трогаем), в редактор — в текущий
      if (getState().home) { void dropOnHome(paths); return; }
      void dropPaths(paths);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    // Kadro открыли с файлом («Открыть с помощью», двойной щелчок по проекту) или передали файл уже запущенному
    void api.pendingFiles().then((files) => { if (files.length) void openFiles(files, { fresh: true }); });
    const offOpen = api.onOpenFiles((files) => void openFiles(files, { fresh: getState().home }));
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); offOpen(); };
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
      <div className="splitter" onMouseDown={onSplitter} title={tx('Потяни, чтобы изменить высоту таймлайна')} />
      <Timeline />
      {exportOpen && <ExportDialog />}
      {home && <Home />}
      {m3d && <Model3DDialog key={`${m3d.init.source}-${m3d.clipId ?? ''}`} />}
      {autoOpen && <AutoEditDialog />}
      {settingsOpen && <SettingsDialog />}
      {sourceView && <SourceView />}
      {scriptOpen && <ScriptDialog />}
      {catalogOpen && <PluginCatalog />}
      {pasteOpen && copiedAttrs && <PasteAttrsDialog attrs={copiedAttrs} />}
      {keysOpen && <ShortcutsDialog />}
      {chromaPaintClip && <ChromaPaintDialog key={chromaPaintClip} clipId={chromaPaintClip} />}
      {refOpen && <RefEditDialog />}
      {bugOpen && <BugDialog initial={bugOpen.what} onClose={() => getState().setBugOpen(null)} />}
      <UpdateCard />
      <Jobs />
      <Toasts />
    </div>
  );
}
