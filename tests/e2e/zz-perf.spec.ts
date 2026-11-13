import { test } from '@playwright/test';
import { launch } from './kadro';
test('perf', async () => {
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const K = await launch();
    const t1 = Date.now();
    const nav = await K.win.evaluate(() => { const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), now: Math.round(performance.now()) }; });
    console.log('START', t1 - t0, JSON.stringify(nav));
    await K.app.close();
  }
});
