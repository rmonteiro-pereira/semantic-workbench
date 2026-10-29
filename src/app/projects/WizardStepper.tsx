/** The step navigation every multi-step wizard shares: a compact line with a menu, or a list. */
import './wizard-stepper.css';
import { Check } from 'lucide-react';

type Props = {
  steps: readonly string[];
  /** Index of the step on screen. */
  current: number;
  /** Index of the furthest step the person may open. */
  reachable: number;
  onGo: (index: number) => void;
};

/**
 * Shows where a person is in a wizard and lets them move between the steps they reached. On a
 * narrow window it is one line, "Step 2 of 8", a progress bar and a menu of all steps; on a
 * wide window it is a vertical list that marks completed, current and pending steps. Neither ever
 * scrolls sideways.
 */
export function WizardStepper({ steps, current, reachable, onGo }: Props) {
  const share = ((current + 1) / steps.length) * 100;
  return (
    <nav className="wizard-stepper" aria-label="Wizard steps">
      <div className="wizard-stepper-compact">
        <h3 className="wizard-stepper-title">
          Step {current + 1} of {steps.length}
        </h3>
        <div className="wizard-stepper-bar" role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={current + 1}>
          <span style={{ width: `${share}%` }} />
        </div>
        <select aria-label="Go to step" value={current} onChange={event => onGo(Number(event.target.value))}>
          {steps.map((name, index) => (
            <option key={name} value={index} disabled={index > reachable}>
              {index + 1}. {name}
            </option>
          ))}
        </select>
      </div>
      <ol className="wizard-stepper-list">
        {steps.map((name, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'pending';
          return (
            <li key={name} data-state={state}>
              <button type="button" aria-current={index === current ? 'step' : undefined} disabled={index > reachable} onClick={() => onGo(index)}>
                <span className="wizard-stepper-mark" aria-hidden="true">
                  {state === 'done' ? <Check size={12} /> : index + 1}
                </span>
                <span className="wizard-stepper-name">{name}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
