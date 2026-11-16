
Operation counters and durations use only the fixed origin, inventory operation id and outcome.
Non-HTTP spans use `operation.<id>`; HTTP keeps its existing request-span hierarchy. Arguments,
resource names and concrete paths are excluded from operation labels and span attributes.
