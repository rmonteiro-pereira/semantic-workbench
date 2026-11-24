# Data Model: Shared Proposals

Types are described by what they hold. Field names are those the code and the state file will use.

## Proposal record (`state/proposals/<repository>.json`)

The file holds `formatVersion: 1` and a list of records. One file per repository folder name.

| Field | Meaning |
| --- | --- |
| `id` | Identifier, `[a-z0-9-]`, 1 to 40 characters, unique within the repository including closed ones |
| `name` | The person's text, 1 to 80 characters |
| `projects` | Declared project slugs, non-empty, all in this repository, fixed |
| `base` | Full commit id of the published tip at creation |
| `createdBy` | Principal id; `createdByName` is the display name at that time |
| `createdAt` | ISO time |
| `status` | `open`, `closed` or `promoted` |
| `outcome` | Absent while open. For closed: `by`, `at`, `tip`. For promoted: `by`, `at`, `tip`, `previousPublished`, `published` |
| `contributors` | Principal ids that have contributed, with the time of their last contribution, for display |

The tip is never stored. Open proposals read `refs/workbench/proposals/<id>`; closed ones read
`refs/workbench/closed-proposals/<id>`.

## Derived status and damage

See research R3. A proposal is damaged when its record says open and its ref is missing and its last
known tip is not in the published history. Damaged proposals are visible only to people who may promote.

## Contribution branch

`work/<handle>.<id>`. One per person and proposal. Created by the workbench at the proposal tip, or reused.
It is an ordinary branch of the person's working copy and follows every personal branch rule (hidden from
others, never pushed).

## Proposal view (what a reader receives)

| Field | Meaning |
| --- | --- |
| `id`, `name`, `status` | As above |
| `projects` | Declared projects the reader may read; others are omitted, and the count of omitted ones is not given |
| `tip` | Current tip (open) or last tip (closed) |
| `behindPublished` | Number of published commits the tip lacks |
| `contributors` | Display names of people who contributed |
| `changes` | Per readable declared project, the changed files with status added, changed or removed |
| `mine` | Whether the reader has a contribution branch, and whether it is behind the tip |
| `may` | The actions the reader's authority allows: `contribute`, `promote`, `close`, `restore` |

## Promotion check result

| Field | Meaning |
| --- | --- |
| `ok` | True when promotion would succeed now |
| `reasons` | Closed list: `authority`, `stale-tip`, `not-descendant`, `invalid`, `guard`, `limit`, `missing-project`, `not-open` |
| `files` | For `guard` and `authority`, the readable files named; never an unreadable file |

## Audit fields

Existing audit record plus `proposal` (identifier), `projects` (declared slugs), `commits` (the old and
new tip, or the promoted commits). The free-text name is not recorded.

## Events

`proposal` event: `{ repository, id, kind }` with `kind` one of `created`, `contributed`, `promoted`,
`closed`, `restored`; tagged with the declared projects.

## State transitions

```text
create  ->  open
open    ->  open       (contribute)
open    ->  promoted   (promote)
open    ->  closed     (close)
closed  ->  open       (restore)
```
