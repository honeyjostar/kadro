// Звуки мем-кнопок — сочинены формулой (aevalsrc), без чужих файлов и мелодий:
//   meme-drama — «дун-дун-дууун»: три удара медных вниз (ля, соль-диез, фа) с тремоло и низом;
//   meme-tbc   — своя фанковая басовая партия с барабанами для «Продолжение следует…»;
//   meme-drop  — басовый «дроп» 808 для басс-буста.
// node scripts/make-memes.mjs → resources/demo/meme-*.m4a (нужен ffmpeg).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = process.env.KADRO_FFMPEG || 'ffmpeg';
const SR = 48000;
const C = '\\,'; // запятая внутри выражения
const noise = '(random(0)*2-1)';

// ---- «дун-дун-дууун» ----
const brass = (t0, f, k, len) => {
  const d = `(t-${t0})`;
  const tone = [1, 0.5, 0.33, 0.22].map((a, i) => `${a}*sin(${2 * (i + 1)}*PI*${f}*${d})`).join('+');
  return `between(t${C}${t0}${C}${t0 + len})*min(1${C}${d}/0.012)*exp(-${d}*${k})*tanh(2.4*(${tone}))`;
};
const drama = [
  brass(0, 110, 4.5, 0.42),
  brass(0.45, 103.83, 4.5, 0.42),
  `${brass(0.9, 87.31, 0.9, 1.9)}*(1+0.3*sin(2*PI*5.5*(t-0.9)))`,
  `0.7*between(t${C}0.9${C}2.8)*exp(-(t-0.9)*1.2)*sin(2*PI*43.65*(t-0.9))`,
  `0.3*${noise}*(between(t${C}0${C}0.4)*exp(-t*30)+between(t${C}0.45${C}0.85)*exp(-(t-0.45)*30)+between(t${C}0.9${C}1.6)*exp(-(t-0.9)*12))`,
].join('+');

// ---- «Продолжение следует…»: бас по восьмым (0,22 с), бочка на четверти, малый на 2 и 4, хэт ----
const S = 0.22;
const seq = [82.41, 82.41, 0, 98, 110, 0, 123.47, 110, 98, 82.41, 73.42];
const pluck = (f, t0, k) => {
  const d = `(t-${t0.toFixed(3)})`;
  return `exp(-${d}*${k})*min(1${C}${d}/0.006)*(sin(2*PI*${f}*${d})+0.6*sin(4*PI*${f}*${d})+0.35*sin(6*PI*${f}*${d}))`;
};
const bassLine = seq.map((f, i) => (f ? `between(t${C}${(i * S).toFixed(3)}${C}${((i + 1) * S).toFixed(3)})*${pluck(f, i * S, 5)}` : ''))
  .filter(Boolean).concat(`between(t${C}${(seq.length * S).toFixed(3)}${C}3.6)*${pluck(82.41, seq.length * S, 1.6)}`).join('+');
const END = (seq.length * S).toFixed(3);
const kick = `between(t${C}0${C}${END})*0.7*sin(2*PI*(50*mod(t${C}0.44)+40*(1-exp(-mod(t${C}0.44)*30))/30))*exp(-mod(t${C}0.44)*14)`;
const snare = `between(t${C}0.44${C}${END})*0.18*${noise}*exp(-mod(t-0.44${C}0.88)*26)`;
const hat = `between(t${C}0${C}${END})*0.06*${noise}*exp(-mod(t${C}0.22)*120)`;
const sting = `between(t${C}${END}${C}3.6)*0.35*sin(2*PI*659.3*(t-${END}))*exp(-(t-${END})*2.5)`;
const tbc = `tanh(1.3*(0.75*(${bassLine})+${kick}+${snare}+${hat}+${sting}))`;

// ---- «дроп» 808 ----
const drop = `tanh(2.5*sin(2*PI*(38*t+90*(1-exp(-t*4))/4)))*exp(-t*1.1)*min(1${C}t/0.005)+0.4*${noise}*exp(-t*200)`;

const SOUNDS = {
  'meme-drama': { d: 2.8, expr: drama, af: 'lowpass=f=2800,aecho=0.8:0.7:50|90:0.25|0.15,volume=0.9' },
  'meme-tbc': { d: 3.6, expr: tbc, af: 'lowpass=f=6000,volume=0.9' },
  'meme-drop': { d: 2.0, expr: drop, af: 'lowpass=f=1500,volume=1.1' },
};

for (const [id, s] of Object.entries(SOUNDS)) {
  const out = path.join(ROOT, 'resources', 'demo', `${id}.m4a`);
  const r = spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=exprs='${s.expr}|${s.expr}':s=${SR}:d=${s.d}`,
    '-af', `${s.af},alimiter=limit=0.95,afade=t=out:st=${(s.d - 0.05).toFixed(3)}:d=0.05`, '-c:a', 'aac', '-b:a', '160k', out], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(id, r.stderr); process.exit(1); }
  console.log('готово', path.relative(ROOT, out));
}
