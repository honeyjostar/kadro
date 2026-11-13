// Картинки, которые Vite кладёт рядом с интерфейсом: импорт даёт их адрес.
declare module '*.jpg' { const url: string; export default url; }
declare module '*.png' { const url: string; export default url; }
declare module '*.webp' { const url: string; export default url; }
