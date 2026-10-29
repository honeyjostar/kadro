// Обновления: последняя версия на GitHub Releases, сравнение версий, разбор списка файлов релиза и
// SHA256SUMS.txt. Чистые функции — проверяются без Electron и сети.

export const RELEASES_API = 'https://api.github.com/repos/honeyjostar/kadro/releases/latest';
export const RELEASES_PAGE = 'https://github.com/honeyjostar/kadro/releases';

/** −1, 0, 1: сравнение 0.10.2 и 0.9.12 по числам; «-beta» и прочие хвосты — раньше чистой версии. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [main, pre] = v.trim().replace(/^v/i, '').split('-', 2);
    return { n: main.split('.').map((x) => Number.parseInt(x, 10) || 0), pre: pre ?? '' };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.n.length, y.n.length, 3); i++) {
    const d = (x.n[i] ?? 0) - (y.n[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

export interface ReleaseAsset { name: string; url: string; size: number }
export interface ReleaseInfo {
  version: string;        // 0.6.0
  notes: string;          // описание релиза (Markdown)
  page: string;           // страница релиза
  setup: ReleaseAsset | null;
  portable: ReleaseAsset | null;
  sums: ReleaseAsset | null;
}

/**
 * Ответ GitHub API (releases/latest) → нужное Kadro. null — ответ не похож на релиз. Файлы — только с
 * github.com по https (allowFile — ещё и file://, для автотестов).
 */
export function parseRelease(json: unknown, allowFile = false): ReleaseInfo | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as { tag_name?: unknown; body?: unknown; html_url?: unknown; assets?: unknown; draft?: unknown; prerelease?: unknown };
  if (typeof r.tag_name !== 'string' || !/^v?\d+\.\d+\.\d+/.test(r.tag_name) || r.draft || r.prerelease) return null;
  const assets: ReleaseAsset[] = Array.isArray(r.assets)
    ? r.assets.flatMap((a) => {
      const x = a as { name?: unknown; browser_download_url?: unknown; size?: unknown };
      return typeof x.name === 'string' && typeof x.browser_download_url === 'string'
        && (/^https:\/\/github\.com\//.test(x.browser_download_url) || (allowFile && x.browser_download_url.startsWith('file:')))
        ? [{ name: x.name, url: x.browser_download_url, size: typeof x.size === 'number' ? x.size : 0 }] : [];
    })
    : [];
  const version = r.tag_name.replace(/^v/i, '');
  return {
    version,
    notes: typeof r.body === 'string' ? r.body.slice(0, 20_000) : '',
    page: typeof r.html_url === 'string' && r.html_url.startsWith('https://github.com/') ? r.html_url : `${RELEASES_PAGE}/tag/v${version}`,
    setup: assets.find((a) => /^Kadro-Setup-.*\.exe$/i.test(a.name)) ?? null,
    portable: assets.find((a) => /^Kadro-.*-portable\.zip$/i.test(a.name)) ?? null,
    sums: assets.find((a) => a.name === 'SHA256SUMS.txt') ?? null,
  };
}

/** SHA256SUMS.txt (вывод sha256sum) → имя файла → хеш. */
export function parseSums(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const x = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line);
    if (x) m.set(x[2], x[1].toLowerCase());
  }
  return m;
}

/** Что показывает окно. */
export type UpdatePhase = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';
export interface UpdateState {
  phase: UpdatePhase;
  current: string;
  version?: string;
  notes?: string;
  page?: string;
  size?: number;
  /** Переносная версия (zip) — сама себя не обновляет: открываем страницу релиза. */
  portable: boolean;
  progress?: number;     // 0..1
  error?: string;
  /** Kadro только что обновился: с какой версии. */
  updatedFrom?: string;
  autoCheck: boolean;
  checkedAt?: number;
}

/** Описание релиза для окна «Что нового»: без разметки Markdown, по строкам. */
export function notesLines(md: string): { kind: 'h' | 'li' | 'p'; text: string }[] {
  const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  return md.split(/\r?\n/).flatMap((line): { kind: 'h' | 'li' | 'p'; text: string }[] => {
    const t = line.trim();
    if (!t) return [];
    const h = /^#{1,6}\s+(.*)$/.exec(t);
    if (h) return [{ kind: 'h', text: clean(h[1]) }];
    const li = /^[-*•]\s+(.*)$/.exec(t);
    if (li) return [{ kind: 'li', text: clean(li[1]) }];
    return [{ kind: 'p', text: clean(t) }];
  });
}
