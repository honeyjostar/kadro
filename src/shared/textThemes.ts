// Тематический текст («Текст» → «Тематический»): готовая надпись под случай — шрифт, цвет, объём или неон,
// плашка, своя анимация появления и ухода. Нажал — надпись встала у курсора, текст сразу можно менять.
import { tx } from './i18n';
import type { TextAnim, TextStyle } from './types';

export interface TextTheme {
  id: string;
  label: string;
  text: string;
  style: Partial<TextStyle>;
  anim: { in?: TextAnim; out?: TextAnim };
  /** где по высоте кадра (доля), если не по центру */
  y?: number;
}

export const TEXT_THEMES: TextTheme[] = [
  { id: 'sport', label: tx('Спорт'), text: tx('ГОЛ!'), style: { font: 'Russo One', size: 170, color: '#ffd60a', strokeColor: '#111111', strokeWidth: 9, uppercase: true, shadow: true, depth: 10, depthColor: '#7a4a00', bgOpacity: 0 }, anim: { in: { type: 'pop', dur: 0.3 }, out: { type: 'zoom', dur: 0.25 } } },
  { id: 'news', label: tx('Новостная плашка'), text: tx('СРОЧНЫЕ НОВОСТИ'), style: { font: 'Montserrat', size: 66, bold: true, uppercase: true, color: '#ffffff', strokeWidth: 0, shadow: false, bgColor: '#e0182d', bgOpacity: 1 }, anim: { in: { type: 'wipe', dur: 0.45 }, out: { type: 'slideLeft', dur: 0.35 } }, y: 0.8 },
  { id: 'hand', label: tx('От руки'), text: tx('До встречи'), style: { font: 'Caveat', size: 130, bold: true, color: '#ffffff', strokeWidth: 0, shadow: true, bgOpacity: 0 }, anim: { in: { type: 'typewriter', dur: 1 }, out: { type: 'fade', dur: 0.4 } } },
  { id: 'calligraphy', label: tx('Каллиграфия'), text: tx('С любовью'), style: { font: 'Great Vibes', size: 150, bold: false, color: '#fff4ea', strokeWidth: 0, shadow: false, glow: '#ff7aa8', bgOpacity: 0 }, anim: { in: { type: 'blur', dur: 0.8 }, out: { type: 'fade', dur: 0.6 } } },
  { id: 'vintage', label: tx('Винтаж'), text: tx('Летнее настроение'), style: { font: 'Playfair Display', size: 96, bold: true, italic: true, color: '#f3dcae', strokeWidth: 0, shadow: true, depth: 4, depthColor: '#5b3a1a', bgOpacity: 0 }, anim: { in: { type: 'fade', dur: 0.9 }, out: { type: 'fade', dur: 0.6 } } },
  { id: 'volume', label: tx('Объёмный'), text: tx('ОБЪЁМ'), style: { font: 'Dela Gothic One', size: 140, color: '#ffffff', strokeWidth: 0, shadow: true, depth: 18, depthColor: '#ff2d75', uppercase: true, bgOpacity: 0 }, anim: { in: { type: 'elastic', dur: 0.7 }, out: { type: 'zoom', dur: 0.3 } } },
  { id: 'kids', label: tx('Детский'), text: tx('С днём рождения!'), style: { font: 'Pangolin', size: 104, bold: true, color: '#ff7a1a', strokeColor: '#ffffff', strokeWidth: 8, shadow: true, bgOpacity: 0 }, anim: { in: { type: 'bounce', dur: 0.7 }, out: { type: 'pop', dur: 0.3 } } },
  { id: 'pixel', label: tx('Пиксельный'), text: tx('КОНЕЦ ИГРЫ'), style: { font: 'Press Start 2P', size: 64, bold: false, color: '#7cff4f', strokeColor: '#0b2b00', strokeWidth: 6, shadow: false, depth: 6, depthColor: '#0b2b00', bgOpacity: 0 }, anim: { in: { type: 'typewriter', dur: 0.8 }, out: { type: 'fade', dur: 0.2 } } },
  { id: 'terminal', label: tx('Терминал'), text: tx('> привет, мир_'), style: { font: 'JetBrains Mono', size: 60, bold: true, color: '#39ff88', strokeWidth: 0, shadow: false, glow: '#0f8f4a', bgColor: '#050806', bgOpacity: 0.9, align: 'left' }, anim: { in: { type: 'typewriter', dur: 1.2 }, out: { type: 'fade', dur: 0.3 } } },
  { id: 'thin', label: tx('Тонкий'), text: tx('меньше — значит больше'), style: { font: 'Jost', size: 70, bold: false, color: '#ffffff', strokeWidth: 0, shadow: false, bgOpacity: 0 }, anim: { in: { type: 'slideUp', dur: 0.6 }, out: { type: 'fade', dur: 0.5 } } },
  { id: 'neon', label: tx('Неоновая вывеска'), text: tx('ОТКРЫТО'), style: { font: 'Unbounded', size: 110, bold: true, uppercase: true, color: '#fff5fd', strokeColor: '#ff2bd6', strokeWidth: 3, shadow: false, glow: '#ff2bd6', bgOpacity: 0 }, anim: { in: { type: 'fade', dur: 0.5 }, out: { type: 'fade', dur: 0.5 } } },
  { id: 'gamer', label: tx('Победа'), text: tx('ПОБЕДА'), style: { font: 'Tektur', size: 130, bold: true, uppercase: true, color: '#c8fbff', strokeColor: '#00b8d9', strokeWidth: 3, shadow: false, glow: '#00e5ff', depth: 6, depthColor: '#003a52', bgOpacity: 0 }, anim: { in: { type: 'zoom', dur: 0.4 }, out: { type: 'blur', dur: 0.4 } } },
  { id: 'comic', label: tx('Комикс'), text: tx('БАМ!'), style: { font: 'Rubik Bubbles', size: 160, color: '#ffeb3b', strokeColor: '#e53935', strokeWidth: 10, shadow: true, depth: 8, depthColor: '#8a1c12', bgOpacity: 0 }, anim: { in: { type: 'pop', dur: 0.25 }, out: { type: 'spin', dur: 0.35 } } },
  { id: 'horror', label: tx('Ужасы'), text: tx('Не оборачивайся'), style: { font: 'Rubik Wet Paint', size: 110, color: '#d10f1f', strokeWidth: 0, shadow: true, bgOpacity: 0 }, anim: { in: { type: 'fade', dur: 1.2 }, out: { type: 'blur', dur: 0.8 } } },
  { id: 'quote', label: tx('Цитата'), text: tx('«Делай. Потом — лучше.»'), style: { font: 'Lora', size: 84, bold: false, italic: true, color: '#ffffff', strokeWidth: 0, shadow: true, bgOpacity: 0 }, anim: { in: { type: 'slideUp', dur: 0.7 }, out: { type: 'fade', dur: 0.6 } } },
  { id: 'place', label: tx('Место'), text: tx('Санкт-Петербург'), style: { font: 'Montserrat', size: 60, bold: true, color: '#111111', strokeWidth: 0, shadow: false, bgColor: '#ffffff', bgOpacity: 0.95 }, anim: { in: { type: 'slideRight', dur: 0.45 }, out: { type: 'slideRight', dur: 0.35 } }, y: 0.78 },
  { id: 'sale', label: tx('Скидка'), text: '−50%', style: { font: 'Dela Gothic One', size: 180, color: '#ffe14d', strokeWidth: 0, shadow: true, depth: 12, depthColor: '#c2185b', bgOpacity: 0 }, anim: { in: { type: 'elastic', dur: 0.8 }, out: { type: 'pop', dur: 0.3 } } },
  { id: 'chapter', label: tx('Глава'), text: tx('ГЛАВА ПЕРВАЯ'), style: { font: 'Cormorant Garamond', size: 92, bold: true, uppercase: true, color: '#ffffff', strokeWidth: 0, shadow: false, bgOpacity: 0 }, anim: { in: { type: 'fade', dur: 1.2 }, out: { type: 'fade', dur: 1 } } },
  { id: 'meme', label: tx('Мем'), text: tx('КОГДА ПОНЯЛ'), style: { font: 'Oswald', size: 110, bold: true, uppercase: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 9, shadow: false, bgOpacity: 0 }, anim: { in: { type: 'pop', dur: 0.2 } }, y: 0.14 },
  { id: 'subscribe', label: tx('Призыв'), text: tx('Подпишись, если зашло'), style: { font: 'Manrope', size: 72, bold: true, color: '#ffffff', strokeWidth: 0, shadow: false, bgColor: '#ff2d55', bgOpacity: 1 }, anim: { in: { type: 'pop', dur: 0.35 }, out: { type: 'slideDown', dur: 0.35 } }, y: 0.82 },
];
export const TEXT_THEME_DUR = 3;
