// Кривые / HSL / LUT в превью: одна 3D-таблица (shared/grade.ts), трилинейно, с обрезкой вниз — как haldclut в FFmpeg.
// На видеокарте — WebGL2 с 3D-текстурой; без неё — то же самое на процессоре.
import { GRADE_N, applyTable, gradeActive, gradeTable, parseCube, type CubeLut } from '../../shared/grade';
import { filterLook } from '../../shared/color';
import type { ColorAdjust, Grade } from '../../shared/types';

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.0,1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler2D src; uniform sampler3D lut; uniform float n;
in vec2 uv; out vec4 o;
void main(){
  vec4 c = texture(src, uv);
  vec3 q = (floor(c.rgb * 255.0 + 0.5) / 255.0) * (n - 1.0);
  vec3 v = texture(lut, (q + 0.5) / n).rgb;
  v = max(floor(v * 255.0 - 0.0001), 0.0) / 255.0;
  o = vec4(v * c.a, c.a);
}`;

// ---------- загрузка файлов LUT ----------
const luts = new Map<string, CubeLut | 'loading' | 'missing'>();
let onLutLoaded: (() => void) | null = null;
export function setLutListener(cb: () => void): void { onLutLoaded = cb; }
/** Дождаться загрузки LUT (для экспорта по кадрам: кадр должен быть сразу с LUT). */
export async function preloadLuts(paths: string[], read: (p: string) => Promise<string | null>): Promise<void> {
  for (const p of paths) {
    lutFor(p, read);
    for (let i = 0; i < 200 && luts.get(p) === 'loading'; i++) await new Promise((r) => setTimeout(r, 10));
  }
}
/** LUT по пути: null — ещё грузится или нет файла (тогда без него). */
export function lutFor(path: string | undefined, read: (p: string) => Promise<string | null>): CubeLut | null {
  if (!path) return null;
  const v = luts.get(path);
  if (v === 'loading' || v === 'missing') return null;
  if (v) return v;
  luts.set(path, 'loading');
  void read(path).then((text) => {
    try { luts.set(path, text ? parseCube(text) : 'missing'); } catch { luts.set(path, 'missing'); }
    onLutLoaded?.();
  });
  return null;
}

export class GradeProcessor {
  private canvas = document.createElement('canvas');
  private gl: WebGL2RenderingContext | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private tex2: WebGLTexture | null = null;
  private tex3: WebGLTexture | null = null;
  private lutKey = '';
  private tables = new Map<string, Uint8Array>();

  constructor() {
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    this.tex2 = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex2);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.tex3 = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.tex3);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
    for (const n of ['src', 'lut', 'n']) this.loc[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(this.loc.src, 0);
    gl.uniform1i(this.loc.lut, 1);
    gl.uniform1f(this.loc.n, GRADE_N);
    this.gl = gl;
  }

  /** Таблица для клипа (кэш по содержимому настроек). */
  table(g: Grade, cube: CubeLut | null, color?: ColorAdjust): { key: string; t: Uint8Array } {
    const fl = filterLook(color);
    const key = JSON.stringify([g.curves ?? null, g.hsl ?? null, cube && g.lut ? [g.lut.path, g.lut.amount] : null, fl ? [fl.id, fl.k] : null]);
    let t = this.tables.get(key);
    if (!t) {
      if (this.tables.size > 24) this.tables.clear();
      t = gradeTable(g, cube, GRADE_N, color);
      this.tables.set(key, t);
    }
    return { key, t };
  }

  /** Применяет коррекцию к слою (на месте). */
  apply(layer: HTMLCanvasElement, g: Grade, cube: CubeLut | null, color?: ColorAdjust): void {
    if (!gradeActive(g, !!cube, color)) return;
    const { key, t } = this.table(g, cube, color);
    this.applyTable(layer, key, t);
  }

  /** Любая таблица N³ (цветокоррекция, образы-эффекты) к слою на месте; key — для кэша текстуры. */
  applyTable(layer: HTMLCanvasElement, key: string, t: Uint8Array): void {
    const w = layer.width; const h = layer.height;
    const lc = layer.getContext('2d', { willReadFrequently: true })!;
    const gl = this.gl;
    if (!gl) {
      const img = lc.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const o = applyTable(t, GRADE_N, d[i], d[i + 1], d[i + 2]);
        d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2];
      }
      lc.putImageData(img, 0, 0);
      return;
    }
    if (this.lutKey !== key) {
      // RGB → RGBA для 3D-текстуры
      const N = GRADE_N;
      const rgba = new Uint8Array(N * N * N * 4);
      for (let i = 0, j = 0; i < t.length; i += 3, j += 4) { rgba[j] = t[i]; rgba[j + 1] = t[i + 1]; rgba[j + 2] = t[i + 2]; rgba[j + 3] = 255; }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, this.tex3);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, N, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      this.lutKey = key;
    }
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex2);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    lc.save();
    lc.globalCompositeOperation = 'copy';
    lc.drawImage(this.canvas, 0, 0);
    lc.restore();
  }
}
