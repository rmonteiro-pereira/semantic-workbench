# Lane A evidence

## Baseline

T011 complete. All 24 fresh light-theme first views measured against an archive of e8b7d69. Locked thresholds and numbers are in research.md. Command: `SW_BASE_URL=http://127.0.0.1:5211 bun --preload /tmp/sw-A/port.ts scripts/ui-review/measure-graph.ts`. The temporary preload binds isolated APIs to 5212 instead of ephemeral ports. Raw output: `/tmp/sw-A/baseline.jsonl`; images: `/tmp/sw-A/baseline-measurements/`.

Scope: workers and React Flow retain layout and measurement ownership; resize does not trigger layout; view decisions change only presentation, never definitions or persistence. Browser checks use disposable examples.

The repository has no `scripts/commit_cadence.py`; its requested cadence command is unavailable.

## Major layout gates

T012 skipped: a trial passing the measured pane ratio into ELK box and reducing fit padding from 0.12 to 0.02 filled the phone canvas (577/587 px) but rendered minimum name boxes at 4.96 px. At 1280 the minimum was 5.52 px, below 9 px and worse than baseline. Packing only area rectangles cannot control fCoSE's internal area density. Trial changes discarded; no unsupported guarantee ships. Trial measurements `/tmp/sw-A/packing.jsonl`; trial images `/tmp/sw-A/packing/` are diagnostic, not after proof.

T013 skipped: count, pane size and card size cannot determine fit-name legibility under current callers: grouping, random fCoSE area bounds and long-name caps also determine it. Baseline UBL needs the uncollapsed 390 view while its names are below 9 px. A count-based estimator would repeat the unsupported first-view claim. An implementation needs actual layout bounds and a revised phone acceptance rule; no replacement count threshold added.

T014 skipped: the current Layered result includes compound cross-area edge sections with container-relative origins (`layoutFullGraph`), not independent area tiles. Wrapping root areas would invalidate those routes and require redesigning routing or dropping the requested orthogonal paths. The task's aspect-ratio-only change is insufficient; no layout change retained.
