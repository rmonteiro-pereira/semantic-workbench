import { Fragment, type CSSProperties } from 'react';

/** Wraps graph names at identifier boundaries without changing their text. */
export function EntityName({ name, style }: { name: string; style?: CSSProperties }) {
  const parts = name.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[._/-])/u);
  return (
    <strong title={name} style={style}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </strong>
  );
}

/** Converts a display identifier to sentence case without changing its source identity. */
export function humanizeIdentifier(identifier: string): string {
  const label = identifier.replace(/^[^:/\s]+:(?=[^/])/, '').replace(/:$/, '');
  const words = label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/);
  return words
    .map((word, index) => {
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      return /^[A-Z0-9]+$/.test(word) ? word : word.toLowerCase();
    })
    .join(' ');
}
