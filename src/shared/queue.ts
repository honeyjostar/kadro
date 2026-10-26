// Очередь фоновых задач с ограничением одновременных (прокси, миниатюры, волны): импорт 50 файлов
// не запускает 50 ffmpeg сразу, а обрабатывает по несколько — компьютер не «встаёт».

export class Queue {
  private running = 0;
  private waiting: (() => void)[] = [];
  constructor(private limit: number) {}

  /** Сколько задач выполняется и ждёт. */
  get size(): { running: number; waiting: number } { return { running: this.running, waiting: this.waiting.length }; }

  async run<T>(fn: () => Promise<T>, front = false): Promise<T> {
    if (this.running >= this.limit) {
      await new Promise<void>((r) => (front ? this.waiting.unshift(r) : this.waiting.push(r)));
    } else {
      this.running++;
    }
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      // место освободилось — передаём его следующей задаче (счётчик не меняется)
      if (next) next(); else this.running--;
    }
  }
}

/** Сколько фоновых задач запускать одновременно: четверть ядер, от 1 до 3. */
export function backgroundLimit(cpus: number): number {
  return Math.max(1, Math.min(3, Math.floor(cpus / 4)));
}
