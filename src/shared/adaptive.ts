// «Превью: авто» — размер картинки в плеере сам подстраивается под компьютер, как в играх: кадры не успевают —
// картинка считается мельче (и растягивается), запас появился — снова крупнее. На паузе кадр всегда в полном
// размере. Здесь только решение по времени между кадрами; сам холст меняет плеер (engine/preview.ts).

/** Ступени размера: доля от полного (по каждой стороне). */
export const ADAPT_STEPS = [1, 0.8, 0.64, 0.5, 0.4];
const WINDOW = 45;         // кадров в окне наблюдения
const SLOW_MS = 40;        // кадр дольше — «не успели» (меньше 25 кадров в секунду)
const FAST_MS = 22;        // все кадры окна быстрее — есть запас
const STALL_MS = 250;      // дольше — это не тормоза, а пауза окна (свернули, перемотка): не считаем
const UP_HOLD_MS = 4000;   // столько держим запас, прежде чем поднять размер
const RETRY_MS = 60000;    // подняли и сразу просело — минуту не пробуем снова

export class AdaptiveScale {
  private i = 0;
  private slow = 0;
  private n = 0;
  private max = 0;
  private fastSince = 0;
  private lastUp = -Infinity;
  private noUpUntil = 0;

  get factor(): number { return ADAPT_STEPS[this.i]; }

  reset(): void { this.i = 0; this.clear(); this.fastSince = 0; this.noUpUntil = 0; this.lastUp = -Infinity; }
  private clear(): void { this.slow = 0; this.n = 0; this.max = 0; }

  /** Прошёл кадр: dt — время с прошлого кадра, now — часы (мс). Возвращает true, если размер поменялся. */
  feed(dt: number, now: number): boolean {
    if (!(dt > 0) || dt > STALL_MS) { this.clear(); this.fastSince = 0; return false; }
    this.n++;
    if (dt > SLOW_MS) this.slow++;
    if (dt > this.max) this.max = dt;
    if (this.n < WINDOW) return false;
    const slowShare = this.slow / this.n;
    const calm = this.max < FAST_MS;
    this.clear();
    if (slowShare > 0.25 && this.i < ADAPT_STEPS.length - 1) {
      // просело сразу после подъёма — этот размер компьютеру не по силам
      if (now - this.lastUp < 3000) this.noUpUntil = now + RETRY_MS;
      this.i++;
      this.fastSince = 0;
      return true;
    }
    if (!calm) { this.fastSince = 0; return false; }
    if (!this.fastSince) this.fastSince = now;
    if (this.i > 0 && now - this.fastSince >= UP_HOLD_MS && now >= this.noUpUntil) {
      this.i--;
      this.lastUp = now;
      this.fastSince = 0;
      return true;
    }
    return false;
  }
}
