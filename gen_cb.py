# Озвучка ролика Kadro v5 на Chatterbox Multilingual (MIT): ударение в каждом слове ставим сами (знак ударения
# после гласной — как модель видела при обучении), голос — образцы из refs/ (придуманные голоса).
# Плюс проверочные фразы: одно слово с правильным и с неправильным ударением — слушается ли модель ударений.
import json, os, time
from pathlib import Path
import soundfile as sf
import torch

SHARD, NSH = int(os.environ['SHARD']), int(os.environ['NSHARDS'])
SCRIPT = json.load(open('script5.json'))
OUT = Path('out'); OUT.mkdir(exist_ok=True)
log = open(OUT / f'log-c-{SHARD}.txt', 'w')
def say(*a):
    s = ' '.join(str(x) for x in a); print(s, flush=True); log.write(s + '\n'); log.flush()

def acc(s):
    out, i = [], 0
    while i < len(s):
        if s[i] == '+' and i + 1 < len(s):
            out.append(s[i + 1] + '́'); i += 2
        else:
            out.append(s[i]); i += 1
    return ''.join(out)

refs = os.environ.get('REFS', 'S.r0,M.r0,M.r1').split(',')
takes = int(os.environ.get('TAKES', '3'))
units = [(f"c.{lid}.{ref.replace('.r', '')}.t{take}", ref, st) for take in range(1, takes + 1) for ref in refs for lid, _, st in SCRIPT['lines']]
car = SCRIPT['calib_carrier']
for take in (1, 2):
    for ref in refs[:2]:
        for cid, good, bad in SCRIPT['calib']:
            units.append((f"c.cal-{cid}-ok.{ref.replace('.r', '')}.t{take}", ref, car.replace('{w}', good)))
            units.append((f"c.cal-{cid}-bad.{ref.replace('.r', '')}.t{take}", ref, car.replace('{w}', bad)))
mine = [u for k, u in enumerate(units) if k % NSH == SHARD]

torch.set_num_threads(os.cpu_count() or 4)
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
T0 = time.time()
cb = ChatterboxMultilingualTTS.from_pretrained(device='cpu')
say('загружено', round(time.time() - T0))
for k, (name, ref, text) in enumerate(mine):
    torch.manual_seed(1009 * k + 17 * SHARD + 3)
    t = time.time()
    try:
        wav = cb.generate(acc(text), language_id='ru', audio_prompt_path=f'refs/{ref}.wav',
                          exaggeration=float(os.environ.get('EX', '0.6')), cfg_weight=float(os.environ.get('CFG', '0.35')),
                          temperature=float(os.environ.get('TEMP', '0.75')))
        sf.write(OUT / f'{name}.wav', wav.squeeze(0).numpy(), cb.sr)
        say(name, f'{wav.shape[-1] / cb.sr:.1f} с за {time.time() - t:.0f} с')
    except Exception as e:
        say('ошибка', name, repr(e)[:400])
say('всё', round(time.time() - T0))
