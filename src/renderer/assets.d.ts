// Картинки, которые Vite кладёт рядом с интерфейсом: импорт даёт их адрес.
declare module '*.jpg' { const url: string; export default url; }
declare module '*.png' { const url: string; export default url; }
declare module '*.webp' { const url: string; export default url; }
// import.meta.glob (Vite) — список файлов папки на этапе сборки
interface ImportMeta {
  glob(pattern: string, opts?: { eager?: boolean; query?: string; import?: string }): Record<string, unknown>;
}
