// Натягивание картинки на четырёхугольник (перспектива) на видеокарте: для каждого пикселя кадра —
// обратное проективное преобразование в картинку. Та же математика, что у фильтра perspective в экспорте.
import { applyH, homography, invertH, type Quad } from '../../shared/perspective';

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D tex;
uniform mat3 inv;   // пиксель кадра → пиксель картинки (с полями)
uniform vec2 srcSize;
uniform float outH;
out vec4 o;
void main() {
  vec2 d = vec2(gl_FragCoord.x, outH - gl_FragCoord.y);
  vec3 s = inv * vec3(d, 1.0);
  if (s.z <= 0.0) { o = vec4(0.0); return; }
  vec2 uv = (s.xy / s.z) / srcSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { o = vec4(0.0); return; }
  o = texture(tex, uv);
}`;

const PAD = 2; // прозрачные поля вокруг картинки — мягкий край, как в экспорте

export class Warper {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private padded = document.createElement('canvas');
  private flat = document.createElement('canvas');

  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
    if (this.gl) { try { this.init(this.gl); } catch { this.gl = null; } }
  }

  get ok(): boolean { return !!this.gl && !!this.prog; }
  get gpu(): boolean { return this.ok; }

  private init(gl: WebGL2RenderingContext): void {
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Картинка src (её углы: верх-лево, верх-право, низ-лево, низ-право) → четырёхугольник quad на кадре W×H. */
  warp(src: CanvasImageSource & { width: number; height: number }, quad: Quad, W: number, H: number): HTMLCanvasElement | null {
    const gl = this.gl;
    const sw = Math.max(1, Math.round(src.width));
    const sh = Math.max(1, Math.round(src.height));
    const pc = this.padded;
    if (pc.width !== sw + 2 * PAD || pc.height !== sh + 2 * PAD) { pc.width = sw + 2 * PAD; pc.height = sh + 2 * PAD; }
    const pctx = pc.getContext('2d')!;
    pctx.clearRect(0, 0, pc.width, pc.height);
    pctx.drawImage(src, PAD, PAD, sw, sh);
    // картинка (без полей) → четырёхугольник; поля продолжают ту же плоскость
    const h = homography([[PAD, PAD], [PAD + sw, PAD], [PAD, PAD + sh], [PAD + sw, PAD + sh]], quad);
    const inv = invertH(h);
    if (!gl || !this.prog) return this.cpuWarp(pc, h, inv, W, H);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pc);
    // mat3 в GLSL — по столбцам
    gl.uniformMatrix3fv(gl.getUniformLocation(this.prog, 'inv'), false, [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]]);
    gl.uniform2f(gl.getUniformLocation(this.prog, 'srcSize'), pc.width, pc.height);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'outH'), H);
    gl.uniform1i(gl.getUniformLocation(this.prog, 'tex'), 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }

  private cpu = document.createElement('canvas');
  /** Без видеокарты (WebGL2 недоступен): то же обратное преобразование на процессоре, с билинейной выборкой. */
  private cpuWarp(pc: HTMLCanvasElement, h: number[], inv: number[], W: number, H: number): HTMLCanvasElement {
    const out = this.cpu;
    if (out.width !== W || out.height !== H) { out.width = W; out.height = H; }
    const octx = out.getContext('2d')!;
    octx.clearRect(0, 0, W, H);
    const pw = pc.width; const ph = pc.height;
    const corners = [applyH(h, 0, 0), applyH(h, pw, 0), applyH(h, 0, ph), applyH(h, pw, ph)];
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
    const x1 = Math.min(W, Math.ceil(Math.max(...corners.map((c) => c[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
    const y1 = Math.min(H, Math.ceil(Math.max(...corners.map((c) => c[1]))));
    if (x1 <= x0 || y1 <= y0 || !corners.every((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))) return out;
    const sd = pc.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, pw, ph).data;
    const bw = x1 - x0;
    const img = octx.createImageData(bw, y1 - y0);
    const d = img.data;
    const texel = (ix: number, iy: number, k: number) => (ix < 0 || iy < 0 || ix >= pw || iy >= ph ? 0 : sd[(iy * pw + ix) * 4 + k]);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const X = x + 0.5; const Y = y + 0.5;
        const w = inv[6] * X + inv[7] * Y + inv[8];
        if (w <= 0) continue;
        const sx = (inv[0] * X + inv[1] * Y + inv[2]) / w - 0.5;
        const sy = (inv[3] * X + inv[4] * Y + inv[5]) / w - 0.5;
        if (sx < -1 || sy < -1 || sx > pw || sy > ph) continue;
        const ix = Math.floor(sx); const iy = Math.floor(sy);
        const fx = sx - ix; const fy = sy - iy;
        const wts = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
        const pts = [[ix, iy], [ix + 1, iy], [ix, iy + 1], [ix + 1, iy + 1]];
        let r = 0; let g = 0; let b = 0; let a = 0;
        for (let q = 0; q < 4; q++) {
          const al = texel(pts[q][0], pts[q][1], 3) * wts[q];
          if (!al) continue;
          r += texel(pts[q][0], pts[q][1], 0) * al;
          g += texel(pts[q][0], pts[q][1], 1) * al;
          b += texel(pts[q][0], pts[q][1], 2) * al;
          a += al;
        }
        if (a <= 0) continue;
        const o = ((y - y0) * bw + (x - x0)) * 4;
        d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; d[o + 3] = a;
      }
    }
    octx.putImageData(img, x0, y0);
    return out;
  }

  /** Для текста: нарисовать плоский текст в кадр W×H и натянуть весь этот кадр на quad. */
  warpDrawn(W: number, H: number, draw: (ctx: CanvasRenderingContext2D) => void, quad: Quad): HTMLCanvasElement | null {
    const fc = this.flat;
    if (fc.width !== W || fc.height !== H) { fc.width = W; fc.height = H; }
    const ctx = fc.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    draw(ctx);
    return this.warp(fc, quad, W, H);
  }
}

let shared: Warper | null = null;
export function warper(): Warper {
  shared ??= new Warper();
  return shared;
}
