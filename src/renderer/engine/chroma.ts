// Хромакей в превью на видеокарте (WebGL). Формула — как у фильтра chromakey в FFmpeg:
// расстояние по цветовым каналам U/V (BT.601), среднее по окну 3×3, мягкость края — линейная.
import type { ChromaKey } from '../../shared/types';

const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.0,1.0); }`;
const FS = `precision highp float;
uniform sampler2D tex; uniform vec2 texel; uniform vec2 keyUV; uniform float sim; uniform float soft;
uniform sampler2D paint; uniform float hasPaint;
varying vec2 uv;
vec2 toUV(vec3 c){
  float u = 128.0 + (-0.16874*c.r - 0.33126*c.g + 0.5*c.b) * 224.0/255.0;
  float v = 128.0 + (0.5*c.r - 0.41869*c.g - 0.08131*c.b) * 224.0/255.0;
  return floor(vec2(u, v) + 0.5);
}
void main(){
  float diff = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 q = clamp(uv + vec2(float(dx), float(dy)) * texel, texel * 0.5, 1.0 - texel * 0.5);
      vec2 d = toUV(floor(texture2D(tex, q).rgb * 255.0 + 0.5)) - keyUV;
      diff += sqrt((d.x*d.x + d.y*d.y) / (255.0*255.0*2.0));
    }
  }
  diff /= 9.0;
  float a = soft > 0.0001 ? clamp((diff - sim) / soft, 0.0, 1.0) : (diff > sim ? 1.0 : 0.0);
  if (hasPaint > 0.5) {
    // кисть: ниже 128 — стереть, выше — вернуть (так же считает экспорт: умножение, затем «светлее»)
    float m = floor(texture2D(paint, uv).r * 255.0 + 0.5);
    a = max(a * min(1.0, m / 128.0), clamp((m - 128.0) / 127.0, 0.0, 1.0));
  }
  vec3 rgb = texture2D(tex, uv).rgb;
  gl_FragColor = vec4(rgb * a, a);
}`;

/** Прозрачность с учётом кисти: a — от хромакея (0..1), m — значение карты кисти (0..255). */
export function paintAlpha(a: number, m: number): number {
  return Math.max(a * Math.min(1, m / 128), Math.min(1, Math.max(0, (m - 128) / 127)));
}

/** U/V ключевого цвета — как RGB_TO_U_CCIR / RGB_TO_V_CCIR в FFmpeg. */
export function keyUV(hex: string): [number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  const u = 128 + (-0.16874 * r - 0.33126 * g + 0.5 * b) * 224 / 255;
  const v = 128 + (0.5 * r - 0.41869 * g - 0.08131 * b) * 224 / 255;
  return [Math.round(u), Math.round(v)];
}

export class ChromaKeyer {
  readonly canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext | null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private paintTex: WebGLTexture | null = null;
  private paintSrc: TexImageSource | null = null;
  private paintVer = -1;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor() {
    this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
    const gl = this.gl;
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { this.gl = null; return; }
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.paintTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.paintTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    for (const n of ['tex', 'texel', 'keyUV', 'sim', 'soft', 'paint', 'hasPaint']) this.loc[n] = gl.getUniformLocation(prog, n);
  }

  private cpu = document.createElement('canvas');
  private cpuPaint = document.createElement('canvas');
  private diff = new Float32Array(0);

  /** Без видеокарты (WebGL выключен): то же самое на процессоре, в уменьшенном размере. */
  private processCpu(src: TexImageSource, w: number, h: number, key: ChromaKey, paint: TexImageSource | null): HTMLCanvasElement {
    const k = Math.min(1, 960 / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * k));
    const ch = Math.max(1, Math.round(h * k));
    const cv = this.cpu;
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(src as CanvasImageSource, 0, 0, cw, ch);
    const img = ctx.getImageData(0, 0, cw, ch);
    const d = img.data;
    const n = cw * ch;
    if (this.diff.length !== n) this.diff = new Float32Array(n);
    const df = this.diff;
    const [ku, kv] = keyUV(key.color);
    for (let i = 0; i < n; i++) {
      const r = d[i * 4]; const g = d[i * 4 + 1]; const b = d[i * 4 + 2];
      const du = Math.round(128 + (-0.16874 * r - 0.33126 * g + 0.5 * b) * 224 / 255) - ku;
      const dv = Math.round(128 + (0.5 * r - 0.41869 * g - 0.08131 * b) * 224 / 255) - kv;
      df[i] = Math.sqrt((du * du + dv * dv) / (255 * 255 * 2));
    }
    const sim = Math.max(0.01, key.similarity);
    const soft = Math.max(0, key.smoothness);
    let pm: Uint8ClampedArray | null = null;
    if (paint) {
      const pc = this.cpuPaint;
      if (pc.width !== cw || pc.height !== ch) { pc.width = cw; pc.height = ch; }
      const px = pc.getContext('2d', { willReadFrequently: true })!;
      px.drawImage(paint as CanvasImageSource, 0, 0, cw, ch);
      pm = px.getImageData(0, 0, cw, ch).data;
    }
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        let sum = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const yy = Math.min(ch - 1, Math.max(0, y + oy)) * cw;
          for (let ox = -1; ox <= 1; ox++) sum += df[yy + Math.min(cw - 1, Math.max(0, x + ox))];
        }
        const m = sum / 9;
        let a = soft > 0.0001 ? Math.min(1, Math.max(0, (m - sim) / soft)) : m > sim ? 1 : 0;
        if (pm) a = paintAlpha(a, pm[(y * cw + x) * 4]);
        d[(y * cw + x) * 4 + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /**
   * Кадр с вырезанным цветом (прозрачность в альфе). paint — карта кисти во весь кадр (серая картинка),
   * paintVer — её версия: картинка загружается в видеокарту заново, только когда версия сменилась.
   */
  process(src: TexImageSource, w: number, h: number, key: ChromaKey, paint: TexImageSource | null = null, paintVer = 0): HTMLCanvasElement | null {
    const gl = this.gl;
    if (!gl || !this.prog) return this.processCpu(src, w, h, key, paint);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const [u, v] = keyUV(key.color);
    gl.uniform1i(this.loc.tex, 0);
    gl.uniform2f(this.loc.texel, 1 / w, 1 / h);
    gl.uniform2f(this.loc.keyUV, u, v);
    gl.uniform1f(this.loc.sim, Math.max(0.01, key.similarity));
    gl.uniform1f(this.loc.soft, Math.max(0, key.smoothness));
    gl.uniform1f(this.loc.hasPaint, paint ? 1 : 0);
    gl.uniform1i(this.loc.paint, 1);
    if (paint) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.paintTex);
      if (paint !== this.paintSrc || paintVer !== this.paintVer) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paint);
        this.paintSrc = paint;
        this.paintVer = paintVer;
      }
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}
