import { useState } from 'react';
import { commaList } from './change-review';

/** Keeps separators while typing, committing the parsed member list when focus leaves the field. */
export function ListInput({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  function commit() {
    onChange(commaList(text));
  }
  return <input value={text} onChange={event => setText(event.target.value)} onBlur={commit} />;
}
