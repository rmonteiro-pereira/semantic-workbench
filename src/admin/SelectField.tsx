import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

type SelectFieldProps = {
  label: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>;
/** Labels a select by reference instead of wrapping it. */
// A select wrapped in its label takes the chosen option into its accessible name ("Role Viewer"),
// which screen readers announce twice and which breaks lookups by the label text alone.
export function SelectField({ label, children, ...select }: SelectFieldProps) {
  const id = useId();
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...select}>
        {children}
      </select>
    </div>
  );
}
