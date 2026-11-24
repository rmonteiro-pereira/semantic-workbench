# Contract: counter store

## Location

`<data root>/state/usage/<project slug>/<yyyy-mm-dd>.json`. Created on the first flush with counters
on. Never created with counters off. Owned by one running instance (the data root lease applies).

## Writes

1. A counted request increments an in-memory map keyed by project, day, address, measure, operation
   and origin. Nothing touches disk on the request path.
2. Every 30 seconds, and at clean shutdown, each project with changes has its day file read (if any),
   merged with the memory map, rekeyed through the address migrations, and written with the
   repository's atomic write (temporary file and rename). Memory is cleared only after the write
   succeeds.
3. A failed write keeps the memory map, logs one warning per hour without content, and retries at the
   next interval. When memory holds more than 50,000 addresses for a project and day, the excess
   increments go to `other`.

## Reads

A read merges the day files of the period with the memory map, applies `rekey` in memory, and filters by
reader. A damaged file (unparsable, wrong `project` or `day`, unknown `formatVersion`) is skipped and
reported as `unavailable` for that day; it is not repaired or deleted by a read.

## Retention

At start and once per day while running, day files older than `retentionDays` before today (UTC) are
deleted. A lower retention at the next start deletes more.

## Address migration

`rekey(file, records)` applies `records` after `migratedThrough` with `migrateAddress`; items a record
deletes are dropped; counts landing on one address are summed. Idempotent: applying the same records
twice leaves the file equal. The persisted-key inventory lists this store as "converted by replay, no
backup needed, counts only".

## Isolation

The usage modules import nothing from the audit modules or telemetry, and the audit modules import
nothing from usage. A test scans the imports. No field of the record is derived from a request header,
cookie, token or principal.

## Deletion and trash

Deleting `state/usage/` loses only counts. A project moved to trash moves `state/usage/<slug>/` into the
trash entry; restore moves it back; purge removes it.
