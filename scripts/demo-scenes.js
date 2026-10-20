// Демо-сцены Kadro: нарисованы кодом (свои, без чужих видео и фото). Каждая — функция (ctx, W, H, t).
// Используется скриптом scripts/make-demo.mjs: кадры рисуются в браузере и склеиваются FFmpeg в MP4.
/* eslint-disable */
(function () {
  const TAU = Math.PI * 2;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const lerp = (a, b, k) => a + (b - a) * k;
  function grad(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
  function glow(ctx, x, y, r, color, a = 1) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.globalAlpha = 1; }
  function ridge(ctx, W, H, base, amp, seed, offset, color, freq = 3) {
    const r = rng(seed); const ph = [r() * TAU, r() * TAU, r() * TAU];
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) {
      const u = (x + offset) / W;
      const y = base - amp * (0.55 * Math.sin(u * freq * TAU * 0.5 + ph[0]) + 0.3 * Math.sin(u * freq * TAU * 1.3 + ph[1]) + 0.15 * Math.sin(u * freq * TAU * 3.1 + ph[2]));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  const scenes = {
    // закат над холмами, птицы
    sunset(ctx, W, H, t) {
      ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#1d2b64'], [0.38, '#7b4397'], [0.62, '#f8746b'], [0.78, '#ffc371']]); ctx.fillRect(0, 0, W, H);
      const sy = H * (0.6 + 0.05 * t / 5);
      glow(ctx, W * 0.55, sy, W * 0.5, 'rgba(255,190,110,0.55)');
      ctx.fillStyle = '#ffe6a8'; ctx.beginPath(); ctx.arc(W * 0.55, sy, W * 0.085, 0, TAU); ctx.fill();
      ridge(ctx, W, H, H * 0.7, H * 0.06, 3, t * 12, '#6b3a5d', 2.2);
      ridge(ctx, W, H, H * 0.79, H * 0.07, 7, t * 30, '#45284a', 2.6);
      ridge(ctx, W, H, H * 0.9, H * 0.06, 11, t * 60, '#22152b', 3.2);
      ctx.strokeStyle = '#1a1020'; ctx.lineWidth = W * 0.004; ctx.lineCap = 'round';
      const r = rng(5);
      for (let i = 0; i < 7; i++) {
        const bx = (r() * W * 0.8 + t * W * (0.05 + r() * 0.04)) % W; const by = H * (0.25 + r() * 0.2); const s = W * (0.012 + r() * 0.01);
        const flap = Math.sin(t * 9 + i) * s * 0.5;
        ctx.beginPath(); ctx.moveTo(bx - s, by - flap); ctx.quadraticCurveTo(bx - s * 0.4, by - s * 0.2, bx, by); ctx.quadraticCurveTo(bx + s * 0.4, by - s * 0.2, bx + s, by - flap); ctx.stroke();
      }
    },
    // ночной город: окна, огни, боке
    city(ctx, W, H, t) {
      ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#090a1f'], [0.6, '#1d1840'], [1, '#3a1d4a']]); ctx.fillRect(0, 0, W, H);
      const r = rng(11);
      for (let i = 0; i < 120; i++) { ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * (0.5 + r()) + i)); ctx.fillStyle = '#fff'; ctx.fillRect(r() * W, r() * H * 0.5, 1.5, 1.5); }
      ctx.globalAlpha = 1;
      glow(ctx, W * 0.78, H * 0.18, W * 0.15, 'rgba(230,230,255,0.35)'); ctx.fillStyle = '#eef'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.18, W * 0.04, 0, TAU); ctx.fill();
      const layers = [[0.55, '#151230', 14, 0.35], [0.62, '#0d0b22', 23, 0.6], [0.7, '#07061a', 31, 1]];
      for (const [top, color, seed, sp] of layers) {
        const rr = rng(seed); let x = -((t * 18 * sp) % 80);
        while (x < W + 80) {
          const bw = W * (0.06 + rr() * 0.09); const bh = H * (1 - top) * (0.5 + rr() * 0.7); const y0 = H - bh;
          ctx.fillStyle = color; ctx.fillRect(x, y0, bw, bh);
          for (let wy = y0 + 10; wy < H - 10; wy += 16) for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
            const on = rr() > 0.55; if (!on) continue;
            const flick = rr() > 0.97 ? (Math.sin(t * 7 + wx) > 0 ? 1 : 0.2) : 1;
            ctx.globalAlpha = 0.85 * flick * sp; ctx.fillStyle = rr() > 0.7 ? '#7fdfff' : '#ffd27a'; ctx.fillRect(wx, wy, 5, 7);
          }
          ctx.globalAlpha = 1; x += bw + W * 0.008;
        }
      }
      const b = rng(41);
      for (let i = 0; i < 26; i++) {
        const bx = (b() * W + t * W * 0.02 * (b() - 0.5)) % W; const by = H * (0.55 + b() * 0.45) + Math.sin(t + i) * 8;
        const col = ['rgba(255,80,160,0.35)', 'rgba(80,200,255,0.33)', 'rgba(255,200,90,0.33)'][i % 3];
        glow(ctx, bx, by, W * (0.03 + b() * 0.05), col);
      }
    },
    // океан: волны, блики, парусник
    ocean(ctx, W, H, t) {
      ctx.fillStyle = grad(ctx, 0, 0, 0, H * 0.55, [[0, '#5fb0ff'], [1, '#dff3ff']]); ctx.fillRect(0, 0, W, H * 0.55);
      glow(ctx, W * 0.3, H * 0.28, W * 0.3, 'rgba(255,255,220,0.8)'); ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(W * 0.3, H * 0.28, W * 0.06, 0, TAU); ctx.fill();
      const r = rng(9);
      for (let i = 0; i < 5; i++) { const cx = (r() * W + t * 14 * (1 + i * 0.3)) % (W + 200) - 100; const cy = H * (0.1 + r() * 0.25); ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(cx + k * 30, cy + Math.sin(k) * 6, 46, 20, 0, 0, TAU); ctx.fill(); } }
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad(ctx, 0, H * 0.55, 0, H, [[0, '#1a8fd6'], [1, '#063a68']]); ctx.fillRect(0, H * 0.55, W, H * 0.45);
      for (let row = 0; row < 18; row++) {
        const y = H * 0.56 + Math.pow(row / 18, 1.6) * H * 0.44; const amp = 2 + row * 0.9; const k = 0.012 - row * 0.0004;
        ctx.strokeStyle = `rgba(255,255,255,${0.12 + row * 0.01})`; ctx.lineWidth = 1 + row * 0.12; ctx.beginPath();
        for (let x = 0; x <= W; x += 8) ctx.lineTo(x, y + Math.sin(x * k + t * (1.5 + row * 0.08) + row) * amp);
        ctx.stroke();
      }
      const s = rng(17);
      for (let i = 0; i < 60; i++) { const x = W * 0.3 + (s() - 0.5) * W * 0.35; const y = H * (0.57 + s() * 0.3); const a = Math.max(0, Math.sin(t * (3 + s() * 4) + i)); ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 3, 1.5); }
      ctx.globalAlpha = 1;
      const bx = W * (0.62 + 0.04 * t / 5); const by = H * 0.6 + Math.sin(t * 1.6) * 4;
      ctx.fillStyle = '#20232f'; ctx.beginPath(); ctx.moveTo(bx - 50, by); ctx.lineTo(bx + 50, by); ctx.lineTo(bx + 36, by + 16); ctx.lineTo(bx - 36, by + 16); ctx.fill();
      ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by - 90); ctx.lineTo(bx + 42, by - 6); ctx.fill();
      ctx.fillStyle = '#ff5a5f'; ctx.beginPath(); ctx.moveTo(bx - 4, by - 6); ctx.lineTo(bx - 4, by - 70); ctx.lineTo(bx - 36, by - 6); ctx.fill();
    },
    // ретро-неон: полосатое солнце, сетка, горы
    synth(ctx, W, H, t) {
      ctx.fillStyle = grad(ctx, 0, 0, 0, H * 0.6, [[0, '#12002b'], [0.6, '#4b0f6b'], [1, '#ff2fa0']]); ctx.fillRect(0, 0, W, H * 0.6);
      const r = rng(23);
      for (let i = 0; i < 80; i++) { ctx.globalAlpha = 0.4 + 0.6 * r(); ctx.fillStyle = '#fff'; ctx.fillRect(r() * W, r() * H * 0.4, 1.5, 1.5); }
      ctx.globalAlpha = 1;
      const cx = W / 2; const cy = H * 0.47; const R = W * 0.22;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      ctx.fillStyle = grad(ctx, 0, cy - R, 0, cy + R, [[0, '#ffe35a'], [1, '#ff2f7a']]); ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      ctx.fillStyle = '#4b0f6b';
      for (let i = 0; i < 7; i++) { const y = cy + R * (0.05 + i * 0.14) + ((t * 10) % (R * 0.14)); ctx.fillRect(cx - R, y, 2 * R, 3 + i * 2.2); }
      ctx.restore();
      ctx.fillStyle = '#16002e'; ctx.beginPath(); ctx.moveTo(0, H * 0.6);
      const m = rng(29); for (let x = 0; x <= W; x += W / 12) ctx.lineTo(x, H * 0.6 - m() * H * 0.12); ctx.lineTo(W, H * 0.6); ctx.fill();
      ctx.fillStyle = '#0b0018'; ctx.fillRect(0, H * 0.6, W, H * 0.4);
      ctx.strokeStyle = '#ff38c8'; ctx.lineWidth = 2; ctx.shadowColor = '#ff38c8'; ctx.shadowBlur = 10;
      const horizon = H * 0.6;
      for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * W * 0.012, horizon); ctx.lineTo(W / 2 + i * W * 0.16, H); ctx.stroke(); }
      for (let k = 0; k < 14; k++) { const u = ((k + (t * 1.2) % 1) / 14); const y = horizon + Math.pow(u, 2.2) * (H - horizon); ctx.globalAlpha = Math.min(1, u * 3); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    },
    // космос: звёзды летят навстречу, туманность, планета
    space(ctx, W, H, t) {
      ctx.fillStyle = '#03020c'; ctx.fillRect(0, 0, W, H);
      glow(ctx, W * (0.35 + 0.02 * Math.sin(t * 0.4)), H * 0.4, W * 0.55, 'rgba(120,40,200,0.45)');
      glow(ctx, W * 0.7, H * 0.65, W * 0.45, 'rgba(20,120,220,0.35)');
      glow(ctx, W * 0.55, H * 0.3, W * 0.3, 'rgba(255,60,140,0.25)');
      const r = rng(31);
      for (let i = 0; i < 260; i++) {
        const a = r() * TAU; const z0 = r(); const z = (z0 + t * 0.12) % 1; const d = Math.pow(z, 2.2) * W * 0.75;
        const x = W / 2 + Math.cos(a) * d; const y = H / 2 + Math.sin(a) * d; const s = 0.5 + z * 2.6;
        ctx.globalAlpha = Math.min(1, z * 1.6); ctx.fillStyle = r() > 0.85 ? '#ffd9a8' : '#ffffff'; ctx.fillRect(x, y, s, s);
      }
      ctx.globalAlpha = 1;
      const px = W * 0.72; const py = H * 0.72; const pr = W * 0.13;
      ctx.fillStyle = grad(ctx, px - pr, py - pr, px + pr, py + pr, [[0, '#ffb86b'], [0.5, '#d9623b'], [1, '#3b1630']]);
      ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,180,0.7)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(px, py, pr * 1.8, pr * 0.42, -0.35 + 0.02 * Math.sin(t), 0, TAU); ctx.stroke();
    },
    // зимние горы, ели, туман
    mountains(ctx, W, H, t) {
      ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#9bc5e8'], [0.5, '#dfeaf2'], [1, '#f7fbff']]); ctx.fillRect(0, 0, W, H);
      const peaks = [[0.62, '#7d93b0', 41, 0.12, 4], [0.7, '#5c7392', 43, 0.1, 8], [0.8, '#3d526d', 47, 0.08, 14]];
      for (const [base, color, seed, amp, sp] of peaks) {
        const r = rng(seed); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
        let x = -((t * sp) % 200);
        ctx.lineTo(x, H * base);
        while (x < W + 200) { const w = W * (0.14 + r() * 0.12); const ph = H * (base - amp * (0.6 + r() * 0.6)); ctx.lineTo(x + w / 2, ph); ctx.lineTo(x + w, H * base); x += w; }
        ctx.lineTo(W, H); ctx.fill();
        // снег на вершинах
        const r2 = rng(seed); ctx.fillStyle = 'rgba(255,255,255,0.85)'; x = -((t * sp) % 200);
        while (x < W + 200) { const w = W * (0.14 + r2() * 0.12); const ph = H * (base - amp * (0.6 + r2() * 0.6)); const sh = (H * base - ph) * 0.3; ctx.beginPath(); ctx.moveTo(x + w / 2, ph); ctx.lineTo(x + w / 2 + w * 0.15, ph + sh); ctx.lineTo(x + w / 2 - w * 0.15, ph + sh); ctx.fill(); x += w; }
      }
      // туман: мягкие вытянутые облака плывут вдоль долины
      for (let k = 0; k < 7; k++) {
        const fx = ((t * (14 + k * 6) + k * 260) % (W + 800)) - 400; const fy = H * (0.7 + (k % 3) * 0.05);
        ctx.save(); ctx.translate(fx, fy); ctx.scale(1, 0.14); glow(ctx, 0, 0, W * 0.45, 'rgba(255,255,255,0.75)', 0.55); ctx.restore();
      }
      const tr = rng(53);
      for (let i = 0; i < 22; i++) {
        const x = (tr() * W * 1.2 - (t * 40) % (W * 0.1)) ; const h = H * (0.08 + tr() * 0.1); const y = H * (0.92 + tr() * 0.08);
        ctx.fillStyle = '#1f3a2c'; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.3, y); ctx.lineTo(x - h * 0.3, y); ctx.fill();
      }
    },
    // переливы цвета (для «эстетичных» шаблонов)
    liquid(ctx, W, H, t) {
      ctx.fillStyle = grad(ctx, 0, 0, W, H, [[0, '#2a1450'], [1, '#14203f']]); ctx.fillRect(0, 0, W, H);
      const blobs = [['rgba(255,94,135,0.9)', 0.3, 0.3, 0.21], ['rgba(255,200,87,0.85)', 0.7, 0.35, 0.17], ['rgba(110,90,255,0.9)', 0.4, 0.75, 0.19], ['rgba(64,224,208,0.8)', 0.75, 0.75, 0.23]];
      ctx.globalCompositeOperation = 'lighter';
      blobs.forEach(([c, x, y, sp], i) => {
        const bx = W * (x + 0.18 * Math.sin(t * sp * TAU + i * 1.7)); const by = H * (y + 0.16 * Math.cos(t * sp * TAU * 0.8 + i));
        glow(ctx, bx, by, W * 0.6, c, 1);
      });
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  window.KADRO_DEMO = { scenes };
})();
