# Audit log tamper evidence

The audit hash chain detects edits and reordering. Detecting a truncated tail also requires an
independently retained mirror or anchor; the chain alone cannot prove records were not removed
from its end. A person who can rewrite both the data folder and its mirror can still forge them.

Check the default `DATA_DIR/state/audit` folder, or supply an explicit folder and mirrored log:

```sh
bun run audit:verify
bun run audit:verify data/state/audit --anchors mirrored.log --retention-days 400
```

The verifier is read-only. It does not repair logs, delete records or change runtime retention.
Server mode mirrors audit records/anchors to stdout; local mode does not provide that stdout
mirror by default.

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
- Every month in the verification window still has its file. The oldest expected month comes
  from `--retention-days` (default 400), not the oldest stored file. The CLI does not load
  `admin/settings.json`; supply the window intentionally for archives or another supported policy.

The command fails when the mirrored log holds no anchor, so a wrong or empty file never passes.

## What is not covered

- **Records the mirror never saw.** Without `--anchors`, only the chain inside the data folder is
  checked, and the newest records can be cut off unnoticed. Collect the server's standard output
  with a service the people who administer the data folder cannot edit, and always pass it.
- **Expired months.** Startup removes whole month files outside the runtime retention window
  (400 days by default). A boundary month is retained until the whole month expires. The first
  remaining line may name a pruned predecessor, so that missing earlier link cannot be checked
  from the stored chain alone.
- **Records that were never written.** If an audit write fails after the operation ran, the server
  logs a line with `"type":"audit-failure"` instead. The log itself shows no gap.
- **Who wrote a line.** The chain uses no key, so someone who can rewrite the whole folder and
  every later file consistently, and who also controls the mirror, can forge a log.

## Running it regularly

Run the command after each month closes and retain its result with the independent mirror.
Investigate a nonzero exit: missing anchors, unreadable files, an incorrect verification window
or actual log changes can all prevent verification. Preserve both copies before comparing them;
a failure is not, by itself, proof of malicious tampering. Do not rewrite an audit record to make
the checker pass.
