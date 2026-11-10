// Заставка при запуске: рабочий стол со значком Kadro, мышка подлетает, двойной щелчок — значок раскрывается в окно.
// Идёт, пока программа загружается (поэтому запуск не замедляет); щелчок или клавиша — пропустить.
// Здесь — общие числа и решения (проверяются без окна); рисует её preload (src/preload/intro.ts).

/** Вся анимация, мс: дальше заставка ждёт только готовности окна. */
export const INTRO_MS = 1300;
/** Исчезновение заставки, мс. */
export const FADE_MS = 260;
/** Окно так и не нарисовалось (сбой) — заставку всё равно убираем. */
export const INTRO_GIVE_UP_MS = 20_000;

export interface PcInfo { cores: number; memGb: number }

/** Слабый компьютер: мало потоков процессора или памяти — тогда после первой заставки Kadro предложит её выключить. */
export const isWeakPc = (pc: PcInfo): boolean => pc.cores <= 4 || pc.memGb < 7.5;

export interface IntroSettings { intro?: boolean; introAsked?: boolean }

/**
 * Показывать ли заставку и предложить ли её выключить.
 * offer — один раз и только на слабом компьютере; noIntro — автотесты и запуск без окна.
 */
export function introPlan(s: IntroSettings, pc: PcInfo, noIntro = false): { show: boolean; offer: boolean } {
  const show = s.intro !== false && !noIntro;
  return { show, offer: show && !s.introAsked && isWeakPc(pc) };
}

/** Цвет акцента для «окна» в заставке (как --accent в styles.css). */
export function introAccent(accent: string, dark: boolean): string {
  switch (accent) {
    case 'violet': return dark ? '#9d7cff' : '#6a42f5';
    case 'blue': return dark ? '#4a8dff' : '#1b63e0';
    case 'mono': return dark ? '#f2eff6' : '#17151c';
    default: return dark ? '#ff3d7f' : '#d81b60';
  }
}
