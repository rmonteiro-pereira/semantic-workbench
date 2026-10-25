import { Fragment } from 'react';

/** Wraps graph names at identifier boundaries without changing their text. */
export function EntityName({ name }: { name: string }) {
  const parts = name.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[._/-])/u);
  return (
    <strong title={name}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </strong>
  );
}
