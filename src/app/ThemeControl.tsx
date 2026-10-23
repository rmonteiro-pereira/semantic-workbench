/** The control that sets the colour theme: follow the system, light or dark. */
import { useState } from 'react';
import {
  THEME_PREFERENCES,
  applyThemePreference,
  readThemePreference,
  storeThemePreference,
  type ThemePreference,
} from '../theme-preference';
import './ThemeControl.css';

const LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/** Lists the three themes as one group of buttons; the chosen one is pressed. */
export function ThemeControl() {
  const [chosen, setChosen] = useState(readThemePreference);
  function choosePreference(preference: ThemePreference) {
    setChosen(preference);
    applyThemePreference(document.documentElement, preference);
    storeThemePreference(preference);
  }
  return (
    <div className="theme-control" role="group" aria-label="Theme">
      <span className="theme-control-label" aria-hidden="true">
        Theme
      </span>
      {THEME_PREFERENCES.map(preference => (
        <button
          key={preference}
          type="button"
          aria-pressed={chosen === preference}
          onClick={() => choosePreference(preference)}
        >
          {LABELS[preference]}
        </button>
      ))}
    </div>
  );
}
