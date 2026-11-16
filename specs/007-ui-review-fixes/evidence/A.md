# Lane A evidence

## Baseline

T011 complete. All 24 fresh light-theme first views measured against an archive of e8b7d69. Locked thresholds and numbers are in research.md. Command: `SW_BASE_URL=http://127.0.0.1:5211 bun --preload /tmp/sw-A/port.ts scripts/ui-review/measure-graph.ts`. The temporary preload binds isolated APIs to 5212 instead of ephemeral ports. Raw output: `/tmp/sw-A/baseline.jsonl`; images: `/tmp/sw-A/baseline-measurements/`.

Scope: workers and React Flow retain layout and measurement ownership; resize does not trigger layout; view decisions change only presentation, never definitions or persistence. Browser checks use disposable examples.

The repository has no `scripts/commit_cadence.py`; its requested cadence command is unavailable.
