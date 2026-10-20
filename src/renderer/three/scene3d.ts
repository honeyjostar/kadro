// 3D-объекты на three.js: готовые фигуры и свои модели (GLB, GLTF, OBJ, STL, FBX), движение, материал, свет.
// Одна и та же сцена рисует живое превью в окне настройки и кадры для видео — поэтому в ролике ровно то, что на экране.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { Model3D } from '../../shared/types';

// ---------- готовые фигуры ----------
function extrude(shape: THREE.Shape, depth: number, bevel: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 8, curveSegments: 32 });
  g.center();
  return g;
}
function heart(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(5, 5);
  s.bezierCurveTo(5, 5, 4, 0, 0, 0);
  s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
  s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
  s.bezierCurveTo(16, 7, 16, 0, 10, 0);
  s.bezierCurveTo(7, 0, 5, 5, 5, 5);
  const g = extrude(s, 5, 1.6);
  g.rotateZ(Math.PI); // острием вниз
  return g;
}
function star(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return extrude(s, 0.28, 0.07);
}
function bolt(): THREE.BufferGeometry {
  const pts: [number, number][] = [[0.15, 1], [-0.55, -0.05], [-0.05, -0.05], [-0.3, -1], [0.55, 0.15], [0.05, 0.15], [0.35, 1]];
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return extrude(s, 0.22, 0.05);
}

export const SHAPES: { id: string; label: string; color: string; make: () => THREE.BufferGeometry }[] = [
  { id: 'heart', label: 'Сердце', color: '#ff3d6e', make: heart },
  { id: 'star', label: 'Звезда', color: '#ffcf3d', make: star },
  { id: 'bolt', label: 'Молния', color: '#ffe14d', make: bolt },
  { id: 'cube', label: 'Кубик', color: '#4d8dff', make: () => new RoundedBoxGeometry(1.3, 1.3, 1.3, 6, 0.18) },
  { id: 'sphere', label: 'Шар', color: '#ff7a3d', make: () => new THREE.SphereGeometry(1, 64, 48) },
  { id: 'torus', label: 'Бублик', color: '#ff4fd8', make: () => new THREE.TorusGeometry(0.8, 0.34, 48, 128) },
  { id: 'ring', label: 'Кольцо', color: '#ffd75a', make: () => new THREE.TorusGeometry(0.9, 0.12, 32, 128) },
  { id: 'knot', label: 'Узел', color: '#a78bff', make: () => new THREE.TorusKnotGeometry(0.7, 0.22, 220, 32) },
  { id: 'crystal', label: 'Кристалл', color: '#7cf0ff', make: () => new THREE.IcosahedronGeometry(1, 0) },
  { id: 'coin', label: 'Монета', color: '#ffc93d', make: () => new THREE.CylinderGeometry(1, 1, 0.16, 96).rotateX(Math.PI / 2) },
  { id: 'pyramid', label: 'Пирамида', color: '#3dd6a5', make: () => new THREE.ConeGeometry(1, 1.4, 4, 1) },
  { id: 'capsule', label: 'Капсула', color: '#ff5e87', make: () => new THREE.CapsuleGeometry(0.5, 1, 12, 48) },
];

export function defaultModel(source: string, name: string, hasOwnMaterials = false): Model3D {
  const shape = SHAPES.find((s) => `shape:${s.id}` === source);
  return {
    source, name, motion: 'spin', speed: 1, tiltX: 12, turnY: 0,
    material: hasOwnMaterials ? 'model' : 'gloss', color: shape?.color ?? '#d9d4e6', light: 'studio', duration: 5,
  };
}

// ---------- загрузка своих моделей ----------
const loaded = new Map<string, Promise<{ object: THREE.Object3D; own: boolean }>>();
export function modelExt(p: string): string { return (p.split('.').pop() ?? '').toLowerCase(); }

/** Загрузить фигуру или файл модели; own — у модели свои материалы (их можно оставить). */
export function loadSource(source: string, mediaUrl: (p: string) => string): Promise<{ object: THREE.Object3D; own: boolean }> {
  const hit = loaded.get(source);
  if (hit) return hit.then((r) => ({ object: r.object.clone(true), own: r.own }));
  const p = (async () => {
    if (source.startsWith('shape:')) {
      const sh = SHAPES.find((s) => `shape:${s.id}` === source) ?? SHAPES[0];
      return { object: new THREE.Mesh(sh.make(), new THREE.MeshStandardMaterial()), own: false };
    }
    const dir = source.replace(/[\\/][^\\/]*$/, '');
    const manager = new THREE.LoadingManager();
    // файлы рядом с моделью (текстуры, .bin) — по пути рядом с ней
    manager.setURLModifier((url) => {
      if (url.startsWith('data:') || url.startsWith('blob:')) return url;
      const m = /^kmedia:\/\/f\/(.*)$/.exec(url);
      const rel = m ? decodeURIComponent(m[1]) : url;
      if (/^([a-zA-Z]:[\\/]|\/)/.test(rel)) return mediaUrl(rel);
      return mediaUrl(`${dir}/${decodeURIComponent(rel)}`);
    });
    const url = mediaUrl(source);
    const ext = modelExt(source);
    if (ext === 'glb' || ext === 'gltf') {
      const g = await new GLTFLoader(manager).loadAsync(url);
      return { object: g.scene, own: true };
    }
    if (ext === 'obj') return { object: await new OBJLoader(manager).loadAsync(url), own: false };
    if (ext === 'stl') {
      const geo = await new STLLoader(manager).loadAsync(url);
      geo.computeVertexNormals();
      return { object: new THREE.Mesh(geo, new THREE.MeshStandardMaterial()), own: false };
    }
    if (ext === 'fbx') return { object: await new FBXLoader(manager).loadAsync(url), own: true };
    throw new Error('Этот формат 3D не поддерживается — подойдут GLB, GLTF, OBJ, STL и FBX');
  })();
  loaded.set(source, p);
  p.catch(() => loaded.delete(source));
  return p.then((r) => ({ object: r.object.clone(true), own: r.own }));
}

// ---------- движение ----------
const rad = (d: number) => (d * Math.PI) / 180;
const TAU = Math.PI * 2;
export function pose(m: Model3D, t: number): { rx: number; ry: number; rz: number; y: number; s: number } {
  let rx = rad(m.tiltX);
  let ry = rad(m.turnY);
  let rz = 0;
  let y = 0;
  let s = 1;
  const w = m.speed;
  switch (m.motion) {
    case 'spin': ry += (t * w * TAU) / 4; break;
    case 'sway': ry += Math.sin((t * w * TAU) / 3) * 0.6; rz = Math.sin((t * w * TAU) / 3 + 0.6) * 0.08; break;
    case 'float': y = Math.sin((t * w * TAU) / 2.5) * 0.08; ry += Math.sin((t * w * TAU) / 6) * 0.35; rx += Math.sin((t * w * TAU) / 4) * 0.08; break;
    case 'tumble': rx += (t * w * TAU) / 5; ry += (t * w * TAU) / 3.5; break;
    case 'pulse': s = 1 + 0.08 * (0.5 + 0.5 * Math.sin(t * w * TAU)); ry += Math.sin((t * w * TAU) / 5) * 0.3; break;
    case 'still': break;
  }
  return { rx, ry, rz, y, s };
}

// ---------- сцена ----------
export class Stage3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private pivot = new THREE.Group();
  private holder = new THREE.Group();
  private lights = new THREE.Group();
  private env: THREE.Texture;
  private source = '';
  private own = false;
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private look = '';

  constructor(canvas: HTMLCanvasElement, size: number, pixelRatio = 1) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: true });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(size, size, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.scene.environment = this.env;
    this.camera.position.set(0, 0, 3.4);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.pivot, this.lights);
    this.pivot.add(this.holder);
  }

  async setSource(source: string, mediaUrl: (p: string) => string): Promise<boolean> {
    if (source === this.source) return this.own;
    const { object, own } = await loadSource(source, mediaUrl);
    this.holder.clear();
    this.originals.clear();
    // в центр и в единый размер: описанная сфера радиуса 0.85
    const box = new THREE.Box3().setFromObject(object);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const k = sphere.radius > 0 ? 0.85 / sphere.radius : 1;
    object.position.sub(sphere.center);
    const wrap = new THREE.Group();
    wrap.add(object);
    wrap.scale.setScalar(k);
    this.holder.add(wrap);
    object.traverse((o) => { if ((o as THREE.Mesh).isMesh) this.originals.set(o as THREE.Mesh, (o as THREE.Mesh).material); });
    this.source = source;
    this.own = own;
    this.look = '';
    return own;
  }

  setLook(m: Model3D): void {
    const key = `${m.material}|${m.color}|${m.light}`;
    if (key === this.look) return;
    this.look = key;
    const color = new THREE.Color(m.color);
    const make = (): THREE.Material => {
      switch (m.material) {
        case 'metal': return new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.22 });
        case 'matte': return new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.92 });
        case 'glass': return new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.5, envMapIntensity: 1.6 });
        case 'neon': return new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.25), emissive: color, emissiveIntensity: 1.5, roughness: 0.4 });
        default: return new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
      }
    };
    const mat = m.material === 'model' ? null : make();
    for (const [mesh, orig] of this.originals) mesh.material = mat ?? orig;
    // свет
    this.lights.clear();
    const add = (l: THREE.Light, x: number, y: number, z: number) => { l.position.set(x, y, z); this.lights.add(l); };
    switch (m.light) {
      case 'soft':
        this.scene.environmentIntensity = 0.9;
        this.lights.add(new THREE.HemisphereLight(0xffffff, 0x8a8aa0, 1.2));
        break;
      case 'sunset':
        this.scene.environmentIntensity = 0.35;
        add(new THREE.DirectionalLight(0xffb070, 3), -3, 2, 2.5);
        add(new THREE.DirectionalLight(0x7a4cff, 1.8), 3, -1, 2);
        break;
      case 'neon':
        this.scene.environmentIntensity = 0.15;
        add(new THREE.PointLight(0xff2fa0, 40, 0, 1.6), -2.2, 1, 2);
        add(new THREE.PointLight(0x3dd6ff, 40, 0, 1.6), 2.2, -1, 2);
        break;
      default:
        this.scene.environmentIntensity = 1;
        add(new THREE.DirectionalLight(0xffffff, 1.6), 2, 3, 4);
    }
  }

  /** Нарисовать момент t (секунды от начала). */
  frame(m: Model3D, t: number): void {
    const p = pose(m, t);
    this.pivot.rotation.set(p.rx, p.ry, p.rz, 'XYZ');
    this.pivot.position.set(0, p.y, 0);
    this.pivot.scale.setScalar(p.s);
    this.renderer.render(this.scene, this.camera);
  }

  /** Кадр RGBA снизу вверх, без «умножения на прозрачность» (как ждёт кодировщик). */
  read(buf: Uint8Array): Uint8Array {
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    for (let i = 0; i < buf.length; i += 4) {
      const a = buf[i + 3];
      if (a > 0 && a < 255) {
        const k = 255 / a;
        buf[i] = Math.min(255, buf[i] * k); buf[i + 1] = Math.min(255, buf[i + 1] * k); buf[i + 2] = Math.min(255, buf[i + 2] * k);
      }
    }
    return buf;
  }

  dispose(): void {
    this.env.dispose();
    this.renderer.dispose();
  }
}

/** Есть ли WebGL (без него 3D не нарисовать). */
export function webglOk(): boolean {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

/**
 * Собрать 3D-объект в видео с прозрачным фоном: кадры рисуются здесь же, видео собирает FFmpeg.
 * Возвращает путь к файлу .webm.
 */
export async function renderModelVideo(
  m: Model3D, api: { mediaUrl(p: string): string; m3dBegin(w: number, h: number, fps: number): Promise<string>; m3dFrame(id: string, d: ArrayBuffer): Promise<void>; m3dEnd(id: string): Promise<{ path?: string; error?: string }>; m3dCancel(id: string): void },
  opts: { size?: number; fps?: number; onProgress?: (p: number) => void; cancelled?: () => boolean } = {},
): Promise<string> {
  const size = opts.size ?? 720;
  const fps = opts.fps ?? 30;
  const canvas = document.createElement('canvas');
  const stage = new Stage3D(canvas, size, 1);
  try {
    await stage.setSource(m.source, api.mediaUrl);
    stage.setLook(m);
    const id = await api.m3dBegin(size, size, fps);
    const n = Math.max(1, Math.round(m.duration * fps));
    const buf = new Uint8Array(size * size * 4);
    for (let i = 0; i < n; i++) {
      if (opts.cancelled?.()) { api.m3dCancel(id); throw new DOMException('Отменено', 'AbortError'); }
      stage.frame(m, i / fps);
      stage.read(buf);
      await api.m3dFrame(id, buf.slice().buffer);
      opts.onProgress?.((i + 1) / n);
    }
    const r = await api.m3dEnd(id);
    if (!r.path) throw new Error(r.error ?? 'Не получилось собрать 3D');
    return r.path;
  } finally {
    stage.dispose();
  }
}
