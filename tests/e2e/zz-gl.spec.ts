import { test, expect } from '@playwright/test';
import { launch } from './kadro';
test('all gl compile', async () => {
  test.setTimeout(180_000);
  for (const sw of ['', '1']) {
    const K = await launch({ env: sw ? { KADRO_SWIFTSHADER: '1' } : {} });
    const win = K.win;
    const r = await win.evaluate(async () => {
      const k = (window as any).__kadro.gl;
      await k.loadGlCatalog();
      const run = k.runner();
      const mk = (c: string) => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 36; const g = cv.getContext('2d')!; g.fillStyle = c; g.fillRect(0, 0, 64, 36); return cv; };
      const a = mk('#ff0000'), b = mk('#0000ff');
      const bad: string[] = [];
      let same = 0;
      const defs = [...k.glTransitions(), ...k.glEffects()];
      for (const d of defs) {
        const out = d.kind === 'transition' ? run.transition(d, 0.5, a, b, 64, 36) : run.effect(d, a, 64, 36, 0.8, 1.2, 0.3);
        if (!out) { bad.push(`${d.id}: ${run.errors.get(d.id)}`); continue; }
      }
      return { available: run.available, n: defs.length, bad };
    });
    console.log('swiftshader=', sw, JSON.stringify(r, null, 1).slice(0, 3000));
    await K.app.close();
  }
});
