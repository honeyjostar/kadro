// Шейдеры на видеокарте (WebGL): переходы gl-transitions и эффекты-плагины.
// Один общий холст WebGL на всё приложение: плеер, миниатюры и экспорт рисуют по очереди (синхронно),
// результат тут же копируется на свой холст 2D. Ошибка в шейдере не роняет программу — запоминается и
// показывается в интерфейсе, а кадр рисуется без шейдера.
import { effectFragment, transitionFragment, type GlDef, type GlParam, type GlValue } from '../../shared/gl/glsl';

const VERT = `attribute vec2 _p;
varying vec2 _uv;
void main() { gl_Position = vec4(_p, 0.0, 1.0); _uv = _p * 0.5 + 0.5; }`;

interface Prog { prog: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> }
type Src = TexImageSource;

export class GlRunner {
  readonly canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext | null = null;
  private progs = new Map<string, Prog | { error: string }>();
  private tex: WebGLTexture[] = [];
  private buf: WebGLBuffer | null = null;
  private lost = false;
  /** Сообщения об ошибках шейдеров: id → текст (для окна настроек и подсказок). */
  readonly errors = new Map<string, string>();
  onError?: (id: string, message: string) => void;

  constructor() {
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); });
    this.init();
  }

  private init(): void {
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: true });
    this.gl = gl;
    this.progs.clear();
    this.tex = [];
    if (!gl) return;
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.tex.push(t);
    }
  }

  get available(): boolean { return !!this.gl && !this.lost; }

  /** Скомпилировать (или взять готовую) программу. Ключ — id + текст: правка файла плагина даёт новую программу. */
  compile(def: GlDef): Prog | null {
    const gl = this.gl;
    if (!gl || this.lost) return null;
    const key = `${def.id}\n${def.glsl}`;
    const hit = this.progs.get(key);
    if (hit) return 'prog' in hit ? hit : null;
    const frag = def.kind === 'transition' ? transitionFragment(def.glsl) : effectFragment(def.glsl);
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s) ?? 'ошибка'; gl.deleteShader(s); throw new Error(log.trim()); }
      return s;
    };
    try {
      const prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
      gl.bindAttribLocation(prog, 0, '_p');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error((gl.getProgramInfoLog(prog) ?? 'ошибка сборки').trim());
      const p: Prog = { prog, loc: new Map() };
      this.progs.set(key, p);
      this.errors.delete(def.id);
      return p;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.progs.set(key, { error: msg });
      this.errors.set(def.id, msg);
      this.onError?.(def.id, msg);
      return null;
    }
  }

  private uni(p: Prog, name: string): WebGLUniformLocation | null {
    if (!p.loc.has(name)) p.loc.set(name, this.gl!.getUniformLocation(p.prog, name));
    return p.loc.get(name)!;
  }

  private setParam(p: Prog, prm: GlParam, v: GlValue | undefined): void {
    const gl = this.gl!;
    const l = this.uni(p, prm.name);
    if (!l) return;
    const val = v ?? prm.value;
    const arr = Array.isArray(val) ? val : [typeof val === 'boolean' ? (val ? 1 : 0) : val];
    switch (prm.type) {
      case 'float': gl.uniform1f(l, arr[0]); break;
      case 'int': case 'bool': gl.uniform1i(l, Math.round(arr[0])); break;
      case 'vec2': gl.uniform2fv(l, arr.slice(0, 2)); break;
      case 'vec3': gl.uniform3fv(l, arr.slice(0, 3)); break;
      case 'vec4': gl.uniform4fv(l, arr.slice(0, 4)); break;
      case 'ivec2': gl.uniform2iv(l, arr.slice(0, 2).map(Math.round)); break;
      case 'ivec3': gl.uniform3iv(l, arr.slice(0, 3).map(Math.round)); break;
      case 'ivec4': gl.uniform4iv(l, arr.slice(0, 4).map(Math.round)); break;
    }
  }

  private upload(i: number, src: Src): void {
    const gl = this.gl!;
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  private draw(p: Prog, w: number, h: number): HTMLCanvasElement {
    const gl = this.gl!;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }

  /** Кадр перехода: from → to при progress 0..1. null — шейдер не собрался или нет WebGL. */
  transition(def: GlDef, progress: number, from: Src, to: Src, w: number, h: number, params?: Record<string, GlValue>): HTMLCanvasElement | null {
    const p = this.compile(def);
    if (!p) return null;
    const gl = this.gl!;
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    gl.useProgram(p.prog);
    this.upload(0, from);
    this.upload(1, to);
    gl.uniform1i(this.uni(p, 'from'), 0);
    gl.uniform1i(this.uni(p, 'to'), 1);
    gl.uniform1f(this.uni(p, 'progress'), Math.min(1, Math.max(0, progress)));
    gl.uniform1f(this.uni(p, 'ratio'), w / h);
    for (const prm of def.params) this.setParam(p, prm, params?.[prm.name]);
    return this.draw(p, w, h);
  }

  /** Кадр эффекта поверх картинки слоя. */
  effect(def: GlDef, image: Src, w: number, h: number, amount: number, time: number, progress: number, params?: Record<string, GlValue>): HTMLCanvasElement | null {
    const p = this.compile(def);
    if (!p) return null;
    const gl = this.gl!;
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    gl.useProgram(p.prog);
    this.upload(0, image);
    gl.uniform1i(this.uni(p, 'image'), 0);
    gl.uniform1f(this.uni(p, 'progress'), Math.min(1, Math.max(0, progress)));
    gl.uniform1f(this.uni(p, 'ratio'), w / h);
    gl.uniform1f(this.uni(p, 'time'), time);
    gl.uniform1f(this.uni(p, 'amount'), amount);
    gl.uniform2f(this.uni(p, 'resolution'), w, h);
    for (const prm of def.params) this.setParam(p, prm, params?.[prm.name]);
    return this.draw(p, w, h);
  }
}

let runner: GlRunner | null = null;
export function glRunner(): GlRunner { runner ??= new GlRunner(); return runner; }
