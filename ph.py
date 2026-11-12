# Распознаём звуки (фонемы МФА) в каждом дубле: по полным и редуцированным гласным видно, где ударение.
import glob, json, os
from pathlib import Path
import numpy as np, librosa, torch
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
SHARD, NSH = int(os.environ.get('SHARD', '0')), int(os.environ.get('NSHARDS', '1'))
rid = 'facebook/wav2vec2-xlsr-53-espeak-cv-ft'
proc = Wav2Vec2Processor.from_pretrained(rid)
model = Wav2Vec2ForCTC.from_pretrained(rid).eval()
files = [f for k, f in enumerate(sorted(glob.glob('vo/out/c.*.wav'))) if k % NSH == SHARD]
Path('ph').mkdir(exist_ok=True)
for f in files:
    y, _ = librosa.load(f, sr=16000)
    x = proc(y, sampling_rate=16000, return_tensors='pt').input_values
    with torch.inference_mode():
        ids = torch.argmax(model(x).logits, dim=-1)
    s = proc.batch_decode(ids)[0]
    name = Path(f).stem
    json.dump(dict(name=name, ph=s), open(f'ph/{name}.json', 'w'), ensure_ascii=False)
    print(name, s, flush=True)
