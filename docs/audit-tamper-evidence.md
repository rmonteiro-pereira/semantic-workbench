# Audit log tamper evidence

The audit log shows whether it was edited, reordered or cut short. It does not prevent that: a
person who can write to the data folder can still change the files. Run this to find out:

```bash
bun run audit:verify                      # DATA_DIR/state/audit
bun run audit:verify data/state/audit --anchors mirrored.log [--retention-days 400]
```

The command prints `Audit log intact: N records in M months.` and exits with 0, or names the first
record that does not fit (`2026-09.jsonl line 12`) and exits with 1.

## What is covered

Each record stores `prev`, the SHA-256 of the previous record's line. The chain runs across months:
the first record of a month names the last record of the closest earlier month. A change to any
stored line, a deleted line or a deleted month file in the middle of the log therefore breaks the
link that follows it, and the command reports it.

When a month ends, the first record of the next month also writes an anchor line to the mirror,
the standard output of the server that a log service collects:

```json
{"type":"audit-anchor","month":"2026-09","tail":"<hash of the last record of 2026-09>"}
```

With `--anchors` (a copy of that output), the command also checks three things:

- Each closed month still ends with the record the mirror saw, which finds a log cut at the end or
  a month file replaced by a consistent forgery.
- Every record the mirror saw is still stored, which covers the current month and the days before
  its first anchor exists.
- Every month that retention still keeps has its file. The oldest kept month comes from the
  retention period (`--retention-days`, 400 unless `audit.retentionDays` says otherwise), not from
  the oldest file, so deleting the oldest files is reported.

The command fails when the mirrored log holds no anchor, so a wrong or empty file never passes.

## What is not covered

- **Records the mirror never saw.** Without `--anchors`, only the chain inside the data folder is
  checked, and the newest records can be cut off unnoticed. Collect the server's standard output
  with a service the people who administer the data folder cannot edit, and always pass it.
- **Old months.** Records older than the retention period are deleted at start-up. The oldest
  file that remains names a record that no longer exists, so its first line is accepted without a
  check.
- **Records that were never written.** If an audit write fails after the operation ran, the server
  logs a line with `"type":"audit-failure"` instead. The log itself shows no gap.
- **Who wrote a line.** The chain uses no key, so someone who can rewrite the whole folder and
  every later file consistently, and who also controls the mirror, can forge a log.

## Running it regularly

Run the command after each month closes and keep its output with the mirrored log. A non-zero exit
means the data folder or the mirror was changed outside the workbench; treat it as an incident and
compare the two copies line by line to find where they differ.
