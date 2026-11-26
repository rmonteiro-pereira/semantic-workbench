import React from 'react';

type Props = {
  control: React.ReactNode;
  error?: string;
  errorId?: string;
  children?: React.ReactNode;
};

/** Marks a form control invalid and displays its findings without adding a layout wrapper. */
export function FieldControl({ control, error, errorId, children }: Props) {
  const attributes: Record<string, unknown> = { 'aria-invalid': true };
  if (errorId) attributes['aria-describedby'] = errorId;
  const markedControl = error && React.isValidElement(control) ? React.cloneElement(control as React.ReactElement<Record<string, unknown>>, attributes) : control;

  return (
    <>
      {markedControl}
      {children}
      {error && (
        <small id={errorId} className="field-error">
          {error}
        </small>
      )}
    </>
  );
}
