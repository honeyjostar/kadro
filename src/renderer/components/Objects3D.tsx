// Раздел «3D» и окно настройки 3D-объекта: живое превью, движение, угол, материал, свет, длительность.
// three.js загружается только здесь (отдельным куском), чтобы не замедлять запуск программы.
import { tx } from '../../shared/i18n';
import { txj } from '../txj';
import { Box, FolderOpen, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Model3D, Model3DLight, Model3DMaterial, Model3DMotion } from '../../shared/types';
import { place3D } from '../actions';
import { api, getState, useStore } from '../store';
import { ColorField, Progress, Slider } from './controls';

type Scene3D = typeof import('../three/scene3d');
let mod: Promise<Scene3D> | null = null;
const scene3d = () => (mod ??= import('../three/scene3d'));

const MOTIONS: { id: Model3DMotion; label: string }[] = [
  { id: 'spin', label: tx('Вращение') }, { id: 'sway', label: tx('Покачивание') }, { id: 'float', label: tx('Парит') },
  { id: 'tumble', label: tx('Кувырок') }, { id: 'pulse', label: tx('Пульс') }, { id: 'still', label: tx('Стоит') },
];
const MATERIALS: { id: Model3DMaterial; label: string }[] = [
  { id: 'model', label: tx('Как в модели') }, { id: 'gloss', label: tx('Глянец') }, { id: 'metal', label: tx('Металл') },
  { id: 'matte', label: tx('Матовый') }, { id: 'glass', label: tx('Стекло') }, { id: 'neon', label: tx('Неон') },
];
const LIGHTS: { id: Model3DLight; label: string }[] = [
  { id: 'studio', label: tx('Студия') }, { id: 'soft', label: tx('Мягкий') }, { id: 'sunset', label: tx('Закат') }, { id: 'neon', label: tx('Неон') },
];

// ---------- раздел слева ----------
const thumbs = new Map<string, string>();

export function Objects3DPanel() {
  const [shapes, setShapes] = useState<{ id: string; label: string }[]>([]);
  const [gl, setGl] = useState(true);
  const [, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void scene3d().then(async (s) => {
      if (!alive) return;
      setShapes(s.SHAPES.map((x) => ({ id: x.id, label: x.label })));
      const ok = s.webglOk();
      setGl(ok);
      if (!ok) return;
      // картинки фигур — той же сценой, что и видео
      const cv = document.createElement('canvas');
      const stage = new s.Stage3D(cv, 160, 1);
      try {
        for (const sh of s.SHAPES) {
          if (thumbs.has(sh.id) || !alive) continue;
          const m = s.defaultModel(`shape:${sh.id}`, sh.label);
          await stage.setSource(m.source, api.mediaUrl);
          stage.setLook(m);
          stage.frame(m, 0.55);
          thumbs.set(sh.id, cv.toDataURL('image/png'));
          setTick((n) => n + 1);
        }
      } finally { stage.dispose(); }
    });
    return () => { alive = false; };
  }, []);
  const open = async (source: string, name: string, own = false) => {
    const s = await scene3d();
    getState().setModel3dEdit({ init: s.defaultModel(source, name, own) });
  };
  const openFile = async () => {
    const p = await api.pickModel();
    if (!p) return;
    const name = p.split(/[\\/]/).pop() ?? tx('3D-модель');
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    await open(p, name.replace(/\.[^.]+$/, ''), ext === 'glb' || ext === 'gltf' || ext === 'fbx');
  };
  return (
    <>
      <div className="panel-head">{tx('3D-объекты')}</div>
      <div className="panel-body">
        <p className="hint">{tx('Объёмная фигура или своя 3D-модель — с движением, светом и материалом. Встаёт поверх видео с прозрачным фоном.')}</p>
        {!gl && <div className="warn"><TriangleAlert size={15} /><span>{tx('Видеокарта не даёт рисовать 3D (нет WebGL). Обнови драйвер видеокарты.')}</span></div>}
        <button className="btn primary block" onClick={() => void openFile()} disabled={!gl} data-testid="m3d-open-file"><FolderOpen size={15} />{tx('Открыть свою модель…')}</button>
        <p className="hint small">{tx('GLB, GLTF, OBJ, STL, FBX — например, из Blender или Sketchfab.')}</p>
        <div className="sub-head">{tx('Готовые фигуры')}</div>
        <div className="m3d-grid">
          {shapes.map((sh) => (
            <button key={sh.id} className="tile m3d-tile" disabled={!gl} onClick={() => void open(`shape:${sh.id}`, sh.label)} data-testid={`m3d-${sh.id}`}>
              <div className="m3d-thumb">{thumbs.get(sh.id) ? <img src={thumbs.get(sh.id)} alt="" /> : <Box size={22} />}</div>
              <span className="label">{sh.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- окно настройки ----------
export function Model3DDialog() {
  const edit = useStore((s) => s.model3dEdit);
  const [m, setM] = useState<Model3D | null>(edit?.init ?? null);
  const [own, setOwn] = useState(edit?.init.material === 'model');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ m: Model3D | null }>({ m: null });
  const cancelled = useRef(false);
  live.current.m = m;
  const close = () => { if (progress === null) getState().setModel3dEdit(null); else cancelled.current = true; };

  // живое превью
  useEffect(() => {
    if (!edit) return;
    let alive = true;
    let raf = 0;
    let stage: InstanceType<Scene3D['Stage3D']> | null = null;
    void scene3d().then(async (s) => {
      if (!alive || !canvasRef.current) return;
      try {
        stage = new s.Stage3D(canvasRef.current, 340, Math.min(2, window.devicePixelRatio || 1));
        const hasOwn = await stage.setSource(edit.init.source, api.mediaUrl);
        setOwn(hasOwn);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
      const t0 = performance.now();
      const loop = () => {
        if (!alive || !stage) return;
        const cur = live.current.m;
        if (cur) {
          stage.setLook(cur);
          stage.frame(cur, ((performance.now() - t0) / 1000) % Math.max(0.5, cur.duration));
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    });
    return () => { alive = false; cancelAnimationFrame(raf); stage?.dispose(); };
  }, [edit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!edit || !m) return null;
  const set = (patch: Partial<Model3D>) => setM({ ...m, ...patch });
  const go = async () => {
    setError('');
    setProgress(0);
    cancelled.current = false;
    try {
      const ok = await place3D(m, edit.clipId, (p) => setProgress(p), () => cancelled.current);
      if (ok) getState().setModel3dEdit(null);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };
  const mats = MATERIALS.filter((x) => x.id !== 'model' || own);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal m3d-modal" role="dialog" aria-label={tx('3D-объект')} data-testid="m3d-dialog">
        <div className="modal-head">
          <h3>3D: {m.name}</h3>
          <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>
        </div>
        <div className="m3d-body">
          <div className="m3d-stage"><canvas ref={canvasRef} style={{ width: 340, height: 340 }} data-testid="m3d-canvas" /></div>
          <div className="m3d-controls">
            <div className="section-title">{tx('Движение')}</div>
            <div className="chips">{MOTIONS.map((x) => <button key={x.id} className={m.motion === x.id ? 'active' : ''} onClick={() => set({ motion: x.id })} data-testid={`m3d-motion-${x.id}`}>{x.label}</button>)}</div>
            {m.motion !== 'still' && <Slider label={tx('Скорость')} min={0.25} max={3} step={0.05} value={m.speed} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ speed: v })} onReset={() => set({ speed: 1 })} />}
            <Slider label={tx('Наклон к зрителю')} min={-60} max={60} step={1} value={m.tiltX} format={(v) => `${Math.round(v)}°`} onChange={(v) => set({ tiltX: v })} onReset={() => set({ tiltX: 12 })} />
            <Slider label={tx('Поворот')} min={-180} max={180} step={1} value={m.turnY} format={(v) => `${Math.round(v)}°`} onChange={(v) => set({ turnY: v })} onReset={() => set({ turnY: 0 })} />
            <div className="section-title">{tx('Материал')}</div>
            <div className="chips">{mats.map((x) => <button key={x.id} className={m.material === x.id ? 'active' : ''} onClick={() => set({ material: x.id })} data-testid={`m3d-mat-${x.id}`}>{x.label}</button>)}</div>
            {m.material !== 'model' && <ColorField label={tx('Цвет')} value={m.color} onChange={(v) => set({ color: v })} />}
            <div className="section-title">{tx('Свет')}</div>
            <div className="chips">{LIGHTS.map((x) => <button key={x.id} className={m.light === x.id ? 'active' : ''} onClick={() => set({ light: x.id })}>{x.label}</button>)}</div>
            <Slider label={tx('Длительность')} min={1} max={20} step={0.5} value={m.duration} format={(v) => tx('{0} с', v.toFixed(1))} onChange={(v) => set({ duration: v })} />
          </div>
        </div>
        {error && <div className="warn"><TriangleAlert size={15} /><span>{error}</span></div>}
        {progress !== null && (<><p className="hint">{txj('Собираю 3D в видео… {0}%', Math.round(progress * 100))}</p><Progress value={progress} /></>)}
        <div className="actions">
          <button className="btn" onClick={close}>{progress !== null ? tx('Остановить') : tx('Отмена')}</button>
          <button className="btn primary" disabled={progress !== null} onClick={() => void go()} data-testid="m3d-place">{edit.clipId ? tx('Обновить 3D на таймлайне') : tx('Добавить на таймлайн')}</button>
        </div>
      </div>
    </div>
  );
}
