import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type SelectHTMLAttributes } from 'react';

type SelectFieldProps = {
  label: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>;

/** The width the select takes when nothing limits it: its widest option plus its arrow and padding. */
function naturalWidth(element: HTMLSelectElement): number {
  const { width, maxWidth } = element.style;
  element.style.width = 'max-content';
  element.style.maxWidth = 'none';
  const natural = element.offsetWidth;
  element.style.width = width;
  element.style.maxWidth = maxWidth;
  return natural;
}

/** The chosen option's text when the select is too narrow to show it whole, or an empty string. */
function useCutChoice(select: RefObject<HTMLSelectElement | null>, value: unknown): string {
  const [cut, setCut] = useState('');
  useLayoutEffect(() => {
    const element = select.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      context.font = getComputedStyle(element).font;
      const chosen = element.selectedOptions[0]?.text ?? '';
      const widest = Math.max(0, ...Array.from(element.options, option => context.measureText(option.text).width));
      // The arrow and padding are read from the select itself rather than guessed, so a select
      // already wide enough for its value never writes the value out a second time.
      const arrowAndPadding = naturalWidth(element) - widest;
      const fits = context.measureText(chosen).width + arrowAndPadding <= element.offsetWidth + 1;
      setCut(fits ? '' : chosen);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [select, value]);
  return cut;
}

/** Labels a select by reference instead of wrapping it. */
// A select wrapped in its label takes the chosen option into its accessible name ("Role Viewer"),
// which screen readers announce twice and which breaks lookups by the label text alone.
// A native select cannot wrap its chosen text, so when the field is narrower than that text the
// whole value is written out under it instead of being left cut at the arrow.
export function SelectField({ label, children, ...select }: SelectFieldProps) {
  const id = useId();
  const element = useRef<HTMLSelectElement>(null);
  const cutChoice = useCutChoice(element, select.value);
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      <select ref={element} id={id} {...select}>
        {children}
      </select>
      {cutChoice && (
        <span className="admin-field-choice" aria-hidden="true">
          {cutChoice}
        </span>
      )}
    </div>
  );
}
