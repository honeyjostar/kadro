// Значки lucide (те же, что в Kadro) → ломаные для рисования без SVG (веб-установщик рисует их сам, через GDI+).
// Каждый значок — набор фигур { closed, pts: [x0, y0, x1, y1, …] } в квадрате 24×24, обводка 2.
import fs from 'node:fs';
import path from 'node:path';

const STEP = 10; // градусов на отрезок дуги
const CURVE = 12; // отрезков на кривую Безье

function arcPoints(x1, y1, rx, ry, phi, large, sweep, x2, y2) {
  // SVG: дуга по конечным точкам → центр и углы (W3C SVG, приложение F.6)
  if (rx === 0 || ry === 0) return [[x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const p = (phi * Math.PI) / 180, cp = Math.cos(p), sp = Math.sin(p);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let k = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) k = -k;
  const cxp = (k * rx * y1p) / ry, cyp = (-k * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs((dt * 180) / Math.PI) / STEP));
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    out.push([cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp]);
  }
  return out;
}

function pathFigures(d) {
  const toks = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? [];
  const figs = [];
  let fig = null, i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lq = null;
  const num = () => Number(toks[i++]);
  const flag = () => {
    // флаги дуги бывают слитно: «a2 2 0 011 1»
    const t = toks[i];
    if (t.length > 1 && /^[01]/.test(t)) { toks[i] = t.slice(1); return Number(t[0]); }
    i++; return Number(t);
  };
  const start = (nx, ny) => { fig = { closed: false, pts: [[nx, ny]] }; figs.push(fig); sx = nx; sy = ny; };
  const line = (nx, ny) => { fig.pts.push([nx, ny]); };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toLowerCase()) {
      case 'm': { x = ox + num(); y = oy + num(); start(x, y); cmd = rel ? 'l' : 'L'; lq = null; lcx = x; lcy = y; break; }
      case 'l': { x = ox + num(); y = oy + num(); line(x, y); lq = null; lcx = x; lcy = y; break; }
      case 'h': { x = ox + num(); line(x, y); lq = null; lcx = x; lcy = y; break; }
      case 'v': { y = oy + num(); line(x, y); lq = null; lcx = x; lcy = y; break; }
      case 'c': case 's': {
        let c1x, c1y;
        if (cmd.toLowerCase() === 'c') { c1x = ox + num(); c1y = oy + num(); } else { c1x = 2 * x - lcx; c1y = 2 * y - lcy; }
        const c2x = ox + num(), c2y = oy + num(), ex = ox + num(), ey = oy + num();
        for (let k = 1; k <= CURVE; k++) {
          const t = k / CURVE, u = 1 - t;
          line(u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex, u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey);
        }
        lcx = c2x; lcy = c2y; x = ex; y = ey; lq = null; break;
      }
      case 'q': case 't': {
        let qx, qy;
        if (cmd.toLowerCase() === 'q') { qx = ox + num(); qy = oy + num(); } else { [qx, qy] = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y]; }
        const ex = ox + num(), ey = oy + num();
        for (let k = 1; k <= CURVE; k++) {
          const t = k / CURVE, u = 1 - t;
          line(u * u * x + 2 * u * t * qx + t * t * ex, u * u * y + 2 * u * t * qy + t * t * ey);
        }
        lq = [qx, qy]; x = ex; y = ey; lcx = x; lcy = y; break;
      }
      case 'a': {
        const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag();
        const ex = ox + num(), ey = oy + num();
        for (const [px, py] of arcPoints(x, y, rx, ry, rot, large, sweep, ex, ey)) line(px, py);
        x = ex; y = ey; lq = null; lcx = x; lcy = y; break;
      }
      case 'z': { fig.closed = true; x = sx; y = sy; lq = null; lcx = x; lcy = y; break; }
      default: throw new Error(`путь: неизвестная команда ${cmd}`);
    }
  }
  return figs;
}

function ellipse(cx, cy, rx, ry) {
  const pts = [];
  for (let a = 0; a < 360; a += STEP) pts.push([cx + rx * Math.cos((a * Math.PI) / 180), cy + ry * Math.sin((a * Math.PI) / 180)]);
  return { closed: true, pts };
}

function rect(x, y, w, h, rx = 0, ry = rx) {
  if (!rx) return { closed: true, pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] };
  const pts = [];
  const corner = (cx, cy, a0) => { for (let a = a0; a <= a0 + 90; a += STEP) pts.push([cx + rx * Math.cos((a * Math.PI) / 180), cy + ry * Math.sin((a * Math.PI) / 180)]); };
  corner(x + w - rx, y + ry, -90); corner(x + w - rx, y + h - ry, 0); corner(x + rx, y + h - ry, 90); corner(x + rx, y + ry, 180);
  return { closed: true, pts };
}

/** Значок по имени файла lucide (например, «graduation-cap»). */
export function lucideFigures(root, name) {
  const src = fs.readFileSync(path.join(root, 'node_modules', 'lucide-react', 'dist', 'esm', 'icons', `${name}.mjs`), 'utf8');
  // старое имя — ссылка на новое
  const alias = /export \{ default \} from '\.\/([\w-]+)\.mjs'/.exec(src);
  if (alias) return lucideFigures(root, alias[1]);
  const at = src.indexOf('[', src.indexOf('node:'));
  if (at < 0) throw new Error(`lucide: не разобрал ${name}`);
  let depth = 0, end = at;
  for (; end < src.length; end++) {
    if (src[end] === '[') depth++;
    else if (src[end] === ']' && --depth === 0) break;
  }
  // eslint-disable-next-line no-new-func
  const node = Function(`return ${src.slice(at, end + 1)}`)();
  const figs = [];
  for (const [tag, a] of node) {
    const n = (k, d = 0) => (a[k] === undefined ? d : Number(a[k]));
    if (tag === 'path') figs.push(...pathFigures(a.d));
    else if (tag === 'circle') figs.push(ellipse(n('cx'), n('cy'), n('r'), n('r')));
    else if (tag === 'ellipse') figs.push(ellipse(n('cx'), n('cy'), n('rx'), n('ry')));
    else if (tag === 'rect') figs.push(rect(n('x'), n('y'), n('width'), n('height'), n('rx'), n('ry', n('rx'))));
    else if (tag === 'line') figs.push({ closed: false, pts: [[n('x1'), n('y1')], [n('x2'), n('y2')]] });
    else if (tag === 'polyline' || tag === 'polygon') {
      const v = a.points.trim().split(/[\s,]+/).map(Number);
      const pts = [];
      for (let k = 0; k < v.length; k += 2) pts.push([v[k], v[k + 1]]);
      figs.push({ closed: tag === 'polygon', pts });
    } else throw new Error(`lucide ${name}: неизвестный элемент ${tag}`);
  }
  return figs.map((f) => ({ closed: f.closed, pts: f.pts.flat().map((v) => Math.round(v * 100) / 100) }));
}
