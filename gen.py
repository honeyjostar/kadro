# Озвучка промо Kadro: Vosk TTS (Apache-2.0) и Chatterbox Multilingual (MIT) — несколько голосов, все фразы.
import json, os, sys, time, unicodedata
from pathlib import Path
import numpy as np
import soundfile as sf

OUT = Path('out'); OUT.mkdir(exist_ok=True)
LINES = json.load(open('script.json'))
BUDGET = float(os.environ.get('BUDGET_MIN', '110')) * 60
T0 = time.time()
log = open(OUT / 'log.txt', 'a')
def say(*a):
    s = ' '.join(str(x) for x in a); print(s, flush=True); log.write(s + '\n'); log.flush()

plain = lambda s: s.replace('+', '')
REF_TEXT = 'Прив+ет! Сег+одня покаж+у, как я монт+ирую р+олики. +Это совс+ем не сл+ожно, +если знать п+ару приёмов.'

# ---------- Vosk ----------
import traceback
nspk = 0
try:
  from vosk_tts import Model, Synth
  vm = Model(lang='ru')
  vs = Synth(vm)
  cfg = vm.config
  nspk = cfg.get('num_speakers') or len(cfg.get('speaker_id_map', {})) or 5
  say('vosk модель', getattr(vm, 'model_path', '?'), 'голосов', nspk, 'тип', cfg.get('model_type'))
  for spk in range(min(nspk, 6)):
      d = OUT / f'vosk-s{spk}'; d.mkdir(exist_ok=True)
      for lid, text in LINES:
          a = vs.synth_audio(text, speaker_id=spk)
          sf.write(d / f'{lid}.wav', np.asarray(a, dtype=np.int16), cfg['audio']['sample_rate'])
      a = vs.synth_audio(REF_TEXT, speaker_id=spk)
      sf.write(f'refs/vosk-s{spk}.wav', np.asarray(a, dtype=np.int16), cfg['audio']['sample_rate'])
      say('vosk голос', spk, 'готов', round(time.time() - T0), 'с')
except Exception:
  say('vosk не вышел:', traceback.format_exc()[-1500:])
  nspk = 0

# ---------- Chatterbox ----------
import torch
torch.set_num_threads(os.cpu_count() or 4)
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
cb = ChatterboxMultilingualTTS.from_pretrained(device='cpu')
vocab = cb.tokenizer.tokenizer.get_vocab()
acute = any('́' in k for k in vocab)
say('chatterbox: знак ударения в словаре:', acute, 'частота', cb.sr)
def cb_text(s):
    if not acute: return plain(s)
    out, i = [], 0
    while i < len(s):
        if s[i] == '+' and i + 1 < len(s): out.append(s[i + 1] + '́'); i += 2
        else: out.append(s[i]); i += 1
    return ''.join(out)
say('пример:', cb_text(LINES[2][1]), '→', cb.tokenizer.preprocess_text(cb_text(LINES[2][1])))
voices = [('cb-dmitri', 'refs/piper-dmitri.wav'), ('cb-denis', 'refs/piper-denis.wav'), ('cb-ruslan', 'refs/piper-ruslan.wav'), ('cb-builtin', None)]
voices += [(f'cb-vosk{s}', f'refs/vosk-s{s}.wav') for s in range(min(nspk, 6)) if os.path.exists(f'refs/vosk-s{s}.wav')]
def gen(name, ref, lid, text, take, seed):
    torch.manual_seed(seed)
    t = time.time()
    kw = dict(language_id='ru', exaggeration=0.55, cfg_weight=0.45, temperature=0.8)
    if ref: kw['audio_prompt_path'] = ref
    wav = cb.generate(cb_text(text), **kw)
    d = OUT / name; d.mkdir(exist_ok=True)
    sf.write(d / f'{lid}.t{take}.wav', wav.squeeze(0).numpy(), cb.sr)
    return time.time() - t, wav.shape[-1] / cb.sr
# сначала по одному дублю всех голосов, потом вторые дубли — пока есть время
for take in (1, 2, 3):
    for name, ref in voices:
        if time.time() - T0 > BUDGET: break
        tot = [0, 0]
        for k, (lid, text) in enumerate(LINES):
            if time.time() - T0 > BUDGET: break
            try:
                dt, dur = gen(name, ref, lid, text, take, 1000 * take + k)
                tot[0] += dt; tot[1] += dur
            except Exception as e:
                say('ошибка', name, lid, repr(e)[:200])
        say('chatterbox', name, 'дубль', take, f'{tot[1]:.1f} с звука за {tot[0]:.0f} с', round(time.time() - T0))
say('всё', round(time.time() - T0), 'с')
