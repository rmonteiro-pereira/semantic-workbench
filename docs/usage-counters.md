# Usage counters

Usage counters tell a curator which definitions agents and application clients actually ask about.
They are off unless an operator turns them on.

## Turning counters on

| Variable | Default | Meaning |
| --- | --- | --- |
| `SW_USAGE_COUNTERS` | unset (off) | `on` starts counting requests through the workbench |
| `SW_USAGE_RETENTION_DAYS` | `30` | Whole number of days from 1 to 365 that counts are kept |

Any other value stops the start and names the variable. Both modes read the same variables.
