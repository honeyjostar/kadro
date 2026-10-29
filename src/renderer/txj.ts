// Перевод фразы внутри JSX, где подстановки могут быть не только строками, но и элементами:
// txj('Вышел Kadro {0}', <b>{v}</b>) → фрагмент «Kadro 0.7.0 is out» с элементом на своём месте.
import { Fragment, createElement, type ReactNode } from 'react';
import { tx } from '../shared/i18n';

export function txj(s: string, ...a: ReactNode[]): ReactNode {
  if (a.every((x) => typeof x === 'string' || typeof x === 'number' || x === null || x === undefined || typeof x === 'boolean')) {
    return tx(s, ...a.map((x) => (x === null || x === undefined || typeof x === 'boolean' ? '' : x)));
  }
  const parts = tx(s).split(/(\{\d+\})/);
  const kids = parts.map((p) => { const m = /^\{(\d+)\}$/.exec(p); return m ? a[Number(m[1])] : p; });
  return createElement(Fragment, null, ...kids);
}
