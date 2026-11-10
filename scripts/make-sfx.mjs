// Звуки на переходах: свуш, щелчок, «бум» — сочинены формулой (aevalsrc), без чужих файлов.
// node scripts/make-sfx.mjs → resources/demo/sfx-*.m4a (нужен ffmpeg). Длительности — как в src/shared/sfx.ts.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = process.env.KADRO_FFMPEG || 'ffmpeg';
const SR = 48000;

// свуш: шум с огибающей (медленно нарастает, быстро спадает) и проездом слева направо
const whooshD = 0.7;
const env = `pow(sin(PI*min(1\\,t/0.48)/2)\\,2)*exp(-max(0\\,t-0.48)*14)`;
const noise = '(random(0)*2-1)';
const whoosh = [`${noise}*${env}*(1-0.6*t/${whooshD})`, `${noise}*${env}*(0.4+0.6*t/${whooshD})`];
// щелчок: короткий тон и всплеск шума
const click = `(0.8*sin(2*PI*2400*t)*exp(-t*90)+0.5*(random(0)*2-1)*exp(-t*260))`;
// «бум»: низкий тон, сползающий вниз, с хлопком в начале
const boom = `(tanh(1.6*sin(2*PI*(38*t+60*(1-exp(-t*9))/9))*exp(-t*3.2))+0.35*(random(0)*2-1)*exp(-t*40))*0.9`;

const phase = `sin(PI*min(1\\,pts/(${whooshD}*sr)))`;
const band = `exp(-pow((b*sr/(2*nb)-(350+2600*${phase}))/(500+700*${phase})\\,2))`;

const SOUNDS = {
  // полоса частот «проезжает» вверх и обратно — как мимо пролетело: гауссова полоса вокруг f(t) на спектре шума
  whoosh: { d: whooshD, exprs: `${whoosh[0]}|${whoosh[1]}`, af: `afftfilt=real='re*${band}':imag='im*${band}':win_size=1024,highpass=f=200,volume=4` },
  click: { d: 0.18, exprs: `${click}|${click}`, af: 'highpass=f=400,volume=1.2' },
  boom: { d: 1.1, exprs: `${boom}|${boom}`, af: 'lowpass=f=900,volume=1.3' },
};

for (const [id, s] of Object.entries(SOUNDS)) {
  const out = path.join(ROOT, 'resources', 'demo', `sfx-${id}.m4a`);
  const r = spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=exprs='${s.exprs}':s=${SR}:d=${s.d}`,
    '-af', `${s.af},alimiter=limit=0.95,afade=t=out:st=${(s.d - 0.04).toFixed(3)}:d=0.04`, '-c:a', 'aac', '-b:a', '160k', out], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(id, r.stderr); process.exit(1); }
  console.log('готово', path.relative(ROOT, out));
}
