# Озвучка ролика Kadro v5 на Qwen3-TTS (Apache-2.0). Голоса только придуманные по описанию (VoiceDesign), не чужие.
# MODE=design — образцы голоса M по описанию; MODE=lines — все фразы голосами из refs/.
import json, os, time
from pathlib import Path
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

torch.set_num_threads(os.cpu_count() or 4)
MODE = os.environ['MODE']
VOICES = json.load(open('voices.json'))
SCRIPT = json.load(open('script5.json'))
Path('out').mkdir(exist_ok=True); Path('refs').mkdir(exist_ok=True)
log = open(f"out/log-q-{MODE}-{os.environ.get('SHARD', '')}.txt", 'w')
def say(*a):
    s = ' '.join(str(x) for x in a); print(s, flush=True); log.write(s + '\n'); log.flush()

T0 = time.time()
if MODE == 'design':
    m = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', device_map='cpu', dtype=torch.float32)
    say('загружено', round(time.time() - T0))
    for vid, v in VOICES.items():
        if not v['instruct']:
            continue
        for s in range(int(os.environ.get('NREF', '2'))):
            torch.manual_seed(100 + s); t = time.time()
            wavs, sr = m.generate_voice_design(text=v['ref_text'], language='Russian', instruct=v['instruct'])
            sf.write(f'refs/{vid}.r{s}.wav', wavs[0], sr)
            say(vid, s, f'{len(wavs[0]) / sr:.1f} с за {time.time() - t:.0f} с')
else:
    SHARD, NSH = int(os.environ['SHARD']), int(os.environ['NSHARDS'])
    refs = os.environ.get('REFS', 'S.r0,M.r0,M.r1').split(',')
    takes = int(os.environ.get('TAKES', '3'))
    units = [(lid, ref, plain, take) for take in range(1, takes + 1) for ref in refs for lid, plain, _ in SCRIPT['lines']]
    mine = [u for k, u in enumerate(units) if k % NSH == SHARD]
    m = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-Base', device_map='cpu', dtype=torch.float32)
    say('загружено', round(time.time() - T0))
    prompts = {}
    for k, (lid, ref, text, take) in enumerate(mine):
        if ref not in prompts:
            vid = ref.split('.')[0]
            prompts[ref] = m.create_voice_clone_prompt(ref_audio=f'refs/{ref}.wav', ref_text=VOICES[vid]['ref_text'])
        torch.manual_seed(7919 * take + 31 * k + SHARD); t = time.time()
        try:
            wavs, sr = m.generate_voice_clone(text=text, language='Russian', voice_clone_prompt=prompts[ref])
            sf.write(f"out/q.{lid}.{ref.replace('.r', '')}.t{take}.wav", wavs[0], sr)
            say(lid, ref, take, f'{len(wavs[0]) / sr:.1f} с за {time.time() - t:.0f} с')
        except Exception as e:
            say('ошибка', lid, ref, repr(e)[:400])
say('всё', round(time.time() - T0))
