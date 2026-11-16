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
