/** Highlights read-only SQL previews while keeping their text exactly equal to the SQL source. */
import React, { useMemo } from 'react';
import { highlightCode } from '@lezer/highlight';
import { StandardSQL } from '@codemirror/lang-sql';
import { syntaxHighlight } from '../editor/languages';
// Read-only SQL previews: the same SQL grammar and colors as the Source editor, drawn as spans
// inside the preview's <code> so its text stays exactly the SQL.
let mounted = false;
/** Highlights a read-only SQL preview without changing its text. */
export function SqlCode({ sql }: { sql: string }) {
  if (!mounted && typeof document !== 'undefined' && syntaxHighlight.module) {
    const style = document.createElement('style');
    style.dataset.sqlHighlight = '';
    style.textContent = syntaxHighlight.module.getRules();
    document.head.appendChild(style);
    mounted = true;
  }
  const parts = useMemo(() => {
    const out: { text: string; cls: string }[] = [];
    try {
      highlightCode(
        sql,
        StandardSQL.language.parser.parse(sql),
        syntaxHighlight,
        (text, cls) => out.push({ text, cls }),
        () => out.push({ text: '\n', cls: '' }),
      );
    } catch {
      return [{ text: sql, cls: '' }];
    }
    return out;
  }, [sql]);
  return (
    <>
      {parts.map((p, i) =>
        p.cls ? (
          <span key={i} className={p.cls}>
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
