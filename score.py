# Проверка дублей озвучки без прослушивания:
#  1) распознаём речь (GigaAM v2) и считаем ошибку по буквам (CER) — нет ли проглоченных или лишних слов;
#  2) выравниваем текст по звуку (MMS forced alignment) и в каждом слове ищем гласную, которая длиннее,
#     громче и выше остальных, — это ударная; сверяем с тем ударением, которое должно быть.
import glob, json, math, os, re, sys
from pathlib import Path
import numpy as np
import soundfile as sf
import librosa
import torch
import torchaudio
import torchaudio.functional as F
import sherpa_onnx

SHARD, NSH = int(os.environ.get('SHARD', '0')), int(os.environ.get('NSHARDS', '1'))
SCRIPT = json.load(open('script5.json'))
LINES = {lid: (plain, st) for lid, plain, st in SCRIPT['lines']}
CAL = {cid: (good, bad) for cid, good, bad in SCRIPT['calib']}
VOW = set('аеёиоуыэюя')
ROM = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
               ['a', 'b', 'v', 'g', 'd', 'e', 'o', 'z', 'z', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u',
                'f', 'h', 'c', 'c', 's', 's', '', 'y', '', 'e', 'u', 'a']))
SR = 16000


def parse_stressed(s):
    s = s.lower()
    out = []
    for m in re.finditer(r'[а-яё+]+', s):
        w = m.group(0)
        rest = s[m.end():].lstrip()
        final = (not rest) or rest[0] in '.,!?—–-:;'
        idx, vi, letters = None, 0, []
        for i, c in enumerate(w):
            if c == '+':
                continue
            if c in VOW:
                if (i > 0 and w[i - 1] == '+') or c == 'ё':
                    idx = vi
                vi += 1
            letters.append(c)
        out.append(dict(word=''.join(letters), stress=idx, nv=vi, final=final))
    return out


def rom(word):
    seq = []
    for li, c in enumerate(word):
        r = ROM.get(c, '')
        if not r:
            continue
        if seq and seq[-1][0] == r and c not in VOW:
            continue
        seq.append((r, li, c in VOW))
    return seq


def norm(t):
    t = t.lower().replace('ё', 'е')
    t = re.sub(r'[^а-я ]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t.replace('кадро', 'кадра')


def cer(ref, hyp):
    a, b = norm(ref), norm(hyp)
    if not a:
        return 1.0
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1]))
        prev = cur
    return prev[-1] / len(a)


def texts_for(name):
    # q.l1.S0.t1 / c.l1.M0.t2 / c.cal-platit-ok.S0.t1
    eng, lid = name.split('.')[:2]
    if lid.startswith('cal-'):
        _, cid, kind = lid.split('-')
        good, bad = CAL[cid]
        st = SCRIPT['calib_carrier'].replace('{w}', good if kind == 'ok' else bad)
        natural = SCRIPT['calib_carrier'].replace('{w}', good)
        return st.replace('+', ''), st, natural, eng
    plain, st = LINES[lid]
    return plain, st, st, eng


def main():
    files = sorted(glob.glob('vo/out/c.*.wav'))
    files = [f for k, f in enumerate(files) if k % NSH == SHARD]
    # та же модель MMS forced alignment, копия на Hugging Face (у dl.fbaipublicfiles.com истёк сертификат)
    from transformers import AutoModelForCTC, AutoTokenizer
    rid = 'MahmoudAshraf/mms-300m-1130-forced-aligner'
    fa = AutoModelForCTC.from_pretrained(rid).eval()
    tok = AutoTokenizer.from_pretrained(rid)
    DICT = {k.lower(): v for k, v in tok.get_vocab().items()}
    BLANK = DICT.get('<blank>', tok.pad_token_id)
    print('словарь выравнивания:', len(DICT), 'blank', BLANK, 'нет букв:', [c for c in 'abcdefghijklmnoprstuvyz' if c not in DICT], flush=True)
    def emissions(x):
        x = (x - x.mean()) / torch.sqrt(x.var() + 1e-7)
        return torch.log_softmax(fa(x).logits, dim=-1)
    d = 'asr/sherpa-onnx-nemo-transducer-giga-am-v2-russian-2025-04-19'
    rec = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=f'{d}/encoder.int8.onnx', decoder=f'{d}/decoder.onnx', joiner=f'{d}/joiner.onnx', tokens=f'{d}/tokens.txt',
        num_threads=4, sample_rate=SR, feature_dim=64, decoding_method='greedy_search', model_type='nemo_transducer')
    Path('scores').mkdir(exist_ok=True)
    for f in files:
        name = Path(f).stem
        plain, st, natural, eng = texts_for(name)
        info = parse_stressed(st)
        nat = parse_stressed(natural)
        if eng == 'q':
            pw = re.findall(r'[а-яё]+', plain.lower())
            if len(pw) == len(info):
                for w, p in zip(info, pw):
                    w['word'] = p
        res = dict(name=name)
        try:
            wav, sr = sf.read(f, dtype='float32')
            if wav.ndim > 1:
                wav = wav.mean(1)
            y = librosa.resample(wav, orig_sr=sr, target_sr=SR) if sr != SR else wav
            res['dur'] = round(len(y) / SR, 3)
            res['peak'] = float(np.abs(y).max())
            s = rec.create_stream(); s.accept_waveform(SR, y); rec.decode_stream(s)
            res['asr'] = s.result.text
            res['cer'] = round(cer(plain, s.result.text), 4)
            roms = [rom(w['word']) for w in info]
            toks = [DICT[r] for w in roms for (r, _, _) in w]
            x = torch.from_numpy(np.ascontiguousarray(y)).unsqueeze(0)
            with torch.inference_mode():
                em = emissions(x)
            ali, sc = F.forced_align(em, torch.tensor([toks], dtype=torch.int32), blank=BLANK)
            spans = F.merge_tokens(ali[0], sc[0].exp(), blank=BLANK)
            assert len(spans) == len(toks), (len(spans), len(toks))
            hop = len(y) / em.size(1)
            f0, vf, _ = librosa.pyin(y, fmin=70, fmax=420, sr=SR, frame_length=1024, hop_length=int(round(hop)))
            words, k = [], 0
            flat_starts = [sp.start for sp in spans]
            for wi, (w, r) in enumerate(zip(info, roms)):
                sp = spans[k:k + len(r)]
                nxt = flat_starts[k + len(r)] if k + len(r) < len(spans) else None
                k += len(r)
                feats, raw = [], []
                word_letters = w['word']
                for j, (lat, li, isv) in enumerate(r):
                    if not isv:
                        continue
                    a = sp[j].start
                    b = sp[j + 1].start if j + 1 < len(r) else min(sp[j].end + 6, nxt if nxt is not None else sp[j].end + 6)
                    b = max(b, a + 1)
                    seg = y[int(a * hop):int(b * hop)]
                    en = 20 * math.log10(float(np.sqrt(np.mean(seg ** 2))) + 1e-6) if len(seg) else -120
                    fz = f0[a:b] if f0 is not None else np.array([])
                    fz = fz[~np.isnan(fz)] if len(fz) else fz
                    fst = 12 * math.log2(float(np.mean(fz)) / 100) if len(fz) else None
                    ld = math.log(b - a)
                    if w['final'] and j == max(jj for jj, (_, _, v) in enumerate(r) if v):
                        ld -= 0.26  # удлинение последнего слога перед паузой — не ударение
                    feats.append((ld, en, fst))
                    raw.append(dict(v=word_letters[li], ld=round(ld, 4), en=round(en, 3), f0=None if fst is None else round(fst, 3)))
                ent = dict(w=w['word'], t0=round(sp[0].start * hop / SR, 3), t1=round(sp[-1].end * hop / SR, 3),
                           stress=w['stress'], natural=nat[wi]['stress'] if wi < len(nat) else None, raw=raw, final=w['final'])
                if w['nv'] >= 2 and w['stress'] is not None and len(feats) == w['nv']:
                    def z(vals):
                        vals = np.array(vals, dtype=float)
                        sd = vals.std()
                        return (vals - vals.mean()) / sd if sd > 1e-6 else np.zeros_like(vals)
                    fsv = [f[2] for f in feats]
                    if any(v is None for v in fsv):
                        med = np.median([v for v in fsv if v is not None]) if any(v is not None for v in fsv) else 0.0
                        fsv = [med if v is None else v for v in fsv]
                    score = z([f[0] for f in feats]) + 0.7 * z([f[1] for f in feats]) + 0.5 * z(fsv)
                    pred = int(np.argmax(score))
                    others = [score[j] for j in range(len(score)) if j != w['stress']]
                    ent.update(pred=pred, margin=round(float(score[w['stress']] - max(others)), 3), ok=pred == w['stress'],
                               score=[round(float(v), 2) for v in score])
                words.append(ent)
            res['words'] = words
            res['bad'] = sum(1 for e in words if 'ok' in e and not e['ok'] and e['margin'] < -0.25)
        except Exception as e:
            res['error'] = repr(e)[:400]
        json.dump(res, open(f'scores/{name}.json', 'w'), ensure_ascii=False, indent=1)
        print(name, res.get('cer'), res.get('bad'), res.get('asr', res.get('error')), flush=True)


main()
