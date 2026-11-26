import type { KeyboardEvent, TextareaHTMLAttributes } from 'react';

type WrappingFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows'>;

/** Removes line breaks, since the value is a single line even when it shows on several. */
export function singleLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ');
}

/**
 * A one-line value that wraps onto more lines instead of scrolling inside its box. A plain input
 * cuts a long address or name at the field's edge, so the reader never sees it whole.
 */
export function WrappingField({ value, onValueChange, className = '', ...field }: WrappingFieldProps) {
  function blockLineBreak(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter') event.preventDefault();
  }
  return (
    <textarea {...field} rows={1} className={`admin-wrapping-field ${className}`.trim()} value={value} onKeyDown={blockLineBreak} onChange={event => onValueChange(singleLine(event.target.value))} />
  );
}
