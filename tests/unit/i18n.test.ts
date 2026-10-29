// Перевод интерфейса: у каждой строки tx('…') / txj('…') в коде есть перевод в en.json с теми же {0}, {1}…;
// в коде не осталось русских строк вне tx (кроме данных и строк с пометкой «// i18n-data»).
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import en from '../../src/shared/i18n/en.json';
import { pluralForm, setUiLang, tx } from '../../src/shared/i18n';

const SRC = path.join(__dirname, '..', '..', 'src');
const files: string[] = [];
(function walk(d: string) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts')) files.push(p);
  }
})(SRC);

interface Found { key: string; file: string }
const used: Found[] = [];
const loose: Found[] = [];
const CYR = /[А-Яа-яЁё]/;
// данные, а не текст интерфейса: заголовки плагинов по-русски, транслит, исходники шейдеров
const DATA = (s: string) => [...s].length === 1 || ['название', 'автор', 'лицензия', 'описание', 'теги'].includes(s) || s.startsWith('а:a б:b') || /#version|vec4\s+(effect|transition)\s*\(|void main\s*\(/.test(s);
for (const file of files) {
  if (file.endsWith(path.join('shared', 'i18n.ts'))) continue;
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(SRC, file);
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'tx' || n.expression.text === 'txj')) {
      const a = n.arguments[0];
      if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) used.push({ key: a.text, file: rel });
      n.arguments.slice(1).forEach(visit);
      return;
    }
    const line = sf.text.slice(sf.text.lastIndexOf('\n', n.getStart(sf)) + 1, sf.text.indexOf('\n', n.getStart(sf)));
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && CYR.test(n.text) && !DATA(n.text) && !line.includes('i18n-data')) {
      const p = n.parent;
      const isKey = p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === n;
      if (!isKey && !(p && (ts.isImportDeclaration(p) || ts.isLiteralTypeNode(p)))) loose.push({ key: n.text, file: rel });
    }
    if (ts.isTemplateExpression(n) && [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].some((x) => CYR.test(x))) loose.push({ key: n.getText(sf).slice(0, 80), file: rel });
    if (ts.isJsxText(n) && CYR.test(n.text)) loose.push({ key: n.text.trim().slice(0, 80), file: rel });
    n.forEachChild(visit);
  };
  visit(sf);
}

describe('перевод интерфейса', () => {
  it('у каждой строки интерфейса есть перевод на английский', () => {
    const dict = en as Record<string, string>;
    const missing = [...new Set(used.filter((u) => !dict[u.key]).map((u) => `${u.file}: ${JSON.stringify(u.key)}`))];
    expect(missing, `нет перевода (добавь в src/shared/i18n/en.json):\n${missing.join('\n')}`).toEqual([]);
  });

  it('подстановки {0}, {1}… в переводе те же, что в оригинале', () => {
    const bad = Object.entries(en as Record<string, string>).filter(([k, v]) => {
      const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
      return ph(k) !== ph(v);
    }).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('в коде нет русского текста мимо tx()', () => {
    expect(loose.map((l) => `${l.file}: ${l.key}`)).toEqual([]);
  });

  it('tx, подстановки и формы числа', () => {
    setUiLang('en');
    expect(tx('Закрыть')).toBe('Close');
    expect(tx('Вышел Kadro {0}', '1.0.0')).toBe('Kadro 1.0.0 is out');
    expect(tx('Строка, которой нет в словаре')).toBe('Строка, которой нет в словаре');
    expect([1, 2, 5, 21].map((n) => pluralForm(n, tx('файл'), tx('файла'), tx('файлов')))).toEqual(['file', 'files', 'files', 'files']);
    setUiLang('ru');
    expect(tx('Вышел Kadro {0}', '1.0.0')).toBe('Вышел Kadro 1.0.0');
    expect([1, 2, 5, 21].map((n) => pluralForm(n, 'файл', 'файла', 'файлов'))).toEqual(['файл', 'файла', 'файлов', 'файл']);
  });
});
