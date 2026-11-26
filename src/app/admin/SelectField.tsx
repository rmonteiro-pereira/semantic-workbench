import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type SelectHTMLAttributes } from 'react';

type SelectFieldProps = {
  label: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>;

/** Room the select keeps for its arrow and padding beside the chosen text. */
const ARROW_AND_PADDING = 40;

/** The chosen option's text when the select is too narrow to show it whole, or an empty string. */
function useCutChoice(select: RefObject<HTMLSelectElement | null>, value: unknown): string {
  const [cut, setCut] = useState('');
  useLayoutEffect(() => {
    const element = select.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const chosen = element.selectedOptions[0]?.text ?? '';
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      context.font = getComputedStyle(element).font;
      const fits = context.measureText(chosen).width + ARROW_AND_PADDING <= element.clientWidth;
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
