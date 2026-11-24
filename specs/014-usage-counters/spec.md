# Feature Specification: Usage Counters

**Feature Branch**: `012-independent-specs` (documents); implementation branch chosen when taken up

**Created**: 2026-11-17

**Status**: Draft

**Input**: Decisions E20 and E21 (and E6, E19) of the Tessera and MCP design decisions, constitution
4.0.1 Principle IV. People who curate definitions cannot see which concepts, relationships and
attributes agents actually ask about. The workbench never runs a query, so it cannot know query
traffic. It can count how often an item is the subject of an authorized request that reaches the
workbench from an agent: context, planning and metric explanation. This feature adds those counters
in their own small store, follows items when they are renamed or moved, and shows the counts as
"traffic" on the graph and in the detail views. Real query counts are a later item.

## Summary

- Counters are **off** until an operator turns them on. When on, each authorized, successful
  request that answers about named items adds one to each item it concerns, per day, per operation
  and per origin (application client over HTTP, MCP, ACP).
- The store holds project, item address, day, operation, origin and count. It holds no person, client,
  connection, request, path of a file, or document text. It is **never derived from the audit log**
  and does not read it.
- Ordinary browser views and browser previews are not counted. Nothing is back-filled from audit.
- Counts are kept 30 days unless the operator sets another period. Older days are removed.
- When an item is renamed or moved, its counts follow it through the recorded address migrations;
  when it is deleted, its counts are dropped.
- A person sees counts only for items in files they may read. A file they cannot read behaves as if it
  had no counts at all.
- The interface offers a **Traffic** option, off by default, that shades entities and relationships,
  adds a count to the details panels and lets lists sort by it. Every label says "requests through
  this workbench" and never "queries".
- Importing real query counts is a later item. The store and the read answer keep a `measure`
  field so that item can add a second, separately labelled series without changing this one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Requests through the workbench are counted without identities (Priority: P1)

An operator enables counters. An application client asks for the context of a mapping and for a
plan. An agent connected over MCP does the same. The workbench records one count per item per
request, with no trace of who asked.

**Why this priority**: it is the data every other story reads, and its privacy limits are the
decision's main content.

**Independent Test**: enable counters on a fixture workspace, make scripted requests as an
application client and as a twin MCP caller, and read the store files and the read answer.

**Acceptance Scenarios**:

1. **Given** counters are on, **When** an application client asks for a mapping's context and the
   answer is successful, **Then** each item the answer is about gains one count for that day,
   operation `context` and origin `http`.
2. **Given** the same request answered 403, 404 or 500, **When** it is read back, **Then** no count was
   added.
3. **Given** counters are off, **When** the same requests are made, **Then** no file is created and
   no work beyond a flag check is done.
4. **Given** a browser request for the same context (the authoring preview), **Then** nothing is counted.
5. **Given** the stored files after a mixed run, **When** they are scanned for the principal id,
   client id, connection id, request id, source address and any document text, **Then** none appear.
6. **Given** one request that names the same item twice, **Then** the item gains one count.
7. **Given** the process stops cleanly, **When** it starts again, **Then** the counts made before the
   stop are present.

---

### User Story 2 - Counts follow items and expire (Priority: P1)

A steward renames a concept and moves a field. The next time anyone looks, the counts earlier in the
period are attached to the new names. A deleted item's counts disappear. Days older than the
retention period are gone.

**Why this priority**: without it a rename silently resets an item's history (reviews of the address
design name this as the main defect of counters).

**Independent Test**: record counts, append address migration records, read, and compare with the
pure migration function applied by hand; advance the clock past retention and read.

**Acceptance Scenarios**:

1. **Given** counts for `Customer` on three days and a rename to `Client`, **When** counts are read,
   **Then** the three days appear under `Client` and none under `Customer`.
2. **Given** a rename followed by a new item that takes the old name, **When** counts are read, **Then**
   old counts follow the renamed item and only new requests count for the new item.
3. **Given** a deleted item, **When** counts are read, **Then** its counts are not returned and are
   removed at the next compaction.
4. **Given** a retention of 30 days, **When** a day older than 30 days is reached by the clock,
   **Then** it is removed from the store and from answers.
5. **Given** the operator lowers retention, **Then** the next start removes the extra days.
6. **Given** migration records that cannot be applied (a damaged store), **Then** the counts stay
   unchanged on disk and the read answer says counts are unavailable for that project.

---

### User Story 3 - A person sees counts only for what they may read (Priority: P1)

A reader of one project asks for counts. They receive counts for items in the files they can read and
nothing else, not even a total that includes other files.

**Why this priority**: Principle I forbids sending any count about a resource the person may not read.

**Independent Test**: authorization matrix cases for the read answer with readable, unreadable,
guarded and missing files.

**Acceptance Scenarios**:

1. **Given** a project with two files and a reader who may read one, **Then** the answer holds only
   that file's items and totals computed from them.
2. **Given** a project the person may not see, **Then** the answer is the same as for a missing
   project.
3. **Given** an unreadable file, **Then** the answer is identical whether the file has counts, has no
   counts or does not exist.
4. **Given** a person's own unpublished copy that contains an item the published snapshot lacks,
   **Then** that item shows no counts (counts belong to published items; see FR-009).

---

### User Story 4 - Traffic is visible on the graph and in the details (Priority: P2)

A steward switches on **Traffic** in the graph options. Concepts that agents ask about most look
stronger, relationships that are used carry more weight, and the details panel states the number
with its period and measure. A list can be sorted by traffic.

**Why this priority**: it is what makes counters useful, but the data and its limits come first.

**Independent Test**: a browser check with a mocked usage answer, in light and dark themes and at
phone width, compares the graph with Traffic off against the recorded screens of the last release.

**Acceptance Scenarios**:

1. **Given** Traffic is off (the default), **Then** every screen is identical to the one without this
   feature.
2. **Given** Traffic is on and counts exist, **Then** each entity card, relationship edge and
   attribute row carries an intensity and a legend names the measure, the breakdown by operation and the
   period.
3. **Given** an item selected, **Then** the details panel shows "N requests through this workbench in
   the last D days" and the split by operation.
4. **Given** counters are off, **Then** the option explains it: to an Admin, how an operator enables
   counters; to anyone else, "Not collected".
5. **Given** counters are on and no counts yet, **Then** the display says there are none yet and
   draws nothing shaded.
6. **Given** a loading or failed answer, **Then** the display shows a loading or an error state and the
   graph stays usable.
7. **Given** a very long item name, a narrow phone screen or a large count, **Then** no text is
   clipped, abbreviated with an ellipsis or covered.

---

### User Story 5 - An operator knows what is collected (Priority: P2)

An operator reads the Admin settings page and the documentation. They see whether counters are on,
the retention and exactly what is stored, in words that do not promise anonymity in a small team.

**Why this priority**: Principle VII requires the limits to be stated as plainly as the feature.

**Independent Test**: the Settings section check and a documentation test that compares the stated
fields with the stored fields.

**Acceptance Scenarios**:

1. **Given** counters on, **Then** Settings shows "On, kept 30 days" (or the configured value)
   read-only.
2. **Given** the documentation, **Then** it lists every stored field and states that counts are of
   workbench requests, that small teams may infer who asked, and that browser views are not counted.
3. **Given** the stored fields change, **Then** a test fails until the documentation lists them.

---

### Edge Cases

- A request that fails after the answer was built (a write error elsewhere in the request) is not a
  counted success; only 2xx answers count, judged by the operation's outcome classifier when present.
- Two requests in the same second increment one counter by two; no request is lost to concurrency.
- The clock moves backwards: counts go to the day of the current clock; no day is rewritten.
- The day changes during a request: the count goes to the day the request finished.
- A server restart loses at most the unflushed interval (FR-017); this is stated in the documentation.
- A store file is damaged: that file's counts are ignored, the damage is logged, other files still
  work, and the next flush writes a fresh file.
- Disk full or read-only state folder: counting stops quietly after one logged warning; the request
  itself is unaffected.
- A very large answer (more items than the cap): the first items up to the cap are counted and the
  rest are not; no request fails because of counting.
- Two projects share a repository: counts are per project; items of a file outside a project are not
  counted.
- A project is deleted: its counts go to the trash entry's lifetime like other project state, or
  are removed with it; restore brings them back (FR-020).
- A project is renamed or moved: counts follow the project key as other per-project state does.
- Local mode: the implicit local principal is not recorded; counts are the same shape.
- A mapping whose snapshot is not published answers `not_published`; nothing is counted.
- An item whose address cannot be formed (positional, unaddressable built-in): it is skipped, not
  counted under a guessed key.
- The same item reached through an application client and through MCP: two counts, one per origin;
  the total is their sum.

## Requirements *(mandatory)*

### Functional Requirements

**What is counted**

- **FR-001**: Counters MUST be off unless an operator enables them in configuration. While off, the
  workbench MUST create no counter file, keep no counter in memory and add no work to a request
  beyond one flag check.
- **FR-002**: A request MUST be counted only when all of these hold: counters are on, the request was
  authorized and answered successfully, the request is one of the counted operations (FR-004), and
  its surface is not the browser authoring surface.
- **FR-003**: The count MUST be taken after authorization, from the answer the caller received, so an
  item the caller could not read is never counted for that caller and a refused request adds nothing.
- **FR-004**: The counted operations and, for each, which items count MUST be a checked-in table
  (agent context, agent plan, metric explanation, and the same operations reached by MCP or ACP). An
  operation absent from the table is not counted.
- **FR-005**: Each counted request MUST add one to every distinct item it concerns, once, however many
  times the answer names it, up to a fixed cap of items per request (FR-006).
- **FR-006**: A request concerning more items than the cap MUST count the first items in address
  order and no others, and MUST NOT fail or slow beyond a stated bound.
- **FR-007**: Ordinary browser views, authoring previews and every request with the browser surface
  MUST NOT be counted. Nothing the browser does adds to a counter.
- **FR-008**: An item MUST be counted under its canonical item address. An item whose address cannot
  be formed MUST be skipped.
- **FR-009**: Only items of the published snapshot MUST be counted. Counting never reads or reveals
  unpublished work, and a person's unpublished item has no counts.

**What is stored**

- **FR-010**: A stored record MUST hold only the project, the item address, the day, the operation,
  the origin, the measure and the count. A test MUST fail when a field is added that is not on this
  list.
- **FR-011**: The store MUST NOT hold, and the counting code MUST NOT receive, any person, client,
  connection, session, request id, source address, file text, query text or secret.
- **FR-012**: The counter store MUST be separate from the audit log and from telemetry. Counting code
  MUST NOT read audit records, and no counter MUST be computed from them. A scan test MUST fail when
  a usage module imports an audit module.
- **FR-013**: The store MUST be durable across restarts and written atomically, and a damaged file
  MUST affect only its own project and day.
- **FR-014**: Days MUST be calendar days of one fixed time standard, so that a restart or a change of
  server time zone does not split or merge days.
- **FR-015**: Counts older than the retention period MUST be removed, at start and at least once per
  day while running. The default retention MUST be 30 days. The operator MUST be able to set another
  whole number of days within a stated range.
- **FR-016**: Deleting the whole store MUST lose only counts. No other feature MUST depend on it.
- **FR-017**: A restart MUST lose no more than a stated interval of counts after an unclean stop, and
  none after a clean stop.
- **FR-018**: The store MUST stay small: bounded entries per project and day, with the excess
  recorded in an "other items" total that carries no address.
- **FR-019**: Counting MUST NOT make a request fail, wait for disk, or change its answer, status or
  headers. A counting failure MUST be logged once per period without content.
- **FR-020**: A project deleted to the trash and restored MUST get its counts back; a project purged
  MUST lose them. Counts MUST NOT be exported with a project, a workbench export or the standard
  compiler output.

**Addresses**

- **FR-021**: When an item's address changes through a recorded address migration, counts of all
  retained days MUST be returned under the new address. A deletion marker MUST remove the counts.
- **FR-022**: Migration MUST use the same pure functions and records that item addresses already use,
  must give the same result however often it is applied, and MUST be applied at read time and at
  compaction.
- **FR-023**: An ambiguous or unresolved external change (the case address design treats as remove and
  add) MUST NOT merge counts of different items.
- **FR-024**: The store MUST appear in the persisted-key inventory with its conversion rule, and the
  inventory test MUST fail if its shape changes without a decision.

**Reading and authorization**

- **FR-025**: One read operation MUST return, for a project, the counts of its items for a period,
  as series per measure, with the breakdown by operation and origin, in a deterministic order.
- **FR-026**: The read operation MUST be an operation of the operation boundary with its own action,
  inventory entry, authorization matrix cases and parity case. It MUST need the right to read the
  project, and MUST filter every item through the caller's reader at file level.
- **FR-027**: For a caller who may not read a project, the answer MUST equal the answer for a project
  that does not exist. For an unreadable file, nothing about its items, counts or totals MAY appear,
  including in sums and in the "other items" total.
- **FR-028**: The read answer MUST state whether counters are on, the retention in days, the period
  covered and the measure label, and MUST say "off" without any count when counters are off.
- **FR-029**: The read answer MUST be bounded in size and period (at most the retention) and MUST be
  served from memory and one day-file read per day at most, not from a scan of the project.
- **FR-030**: Counts for importing projects, mesh dependents and any other project than the one
  asked about MUST NOT be returned by this feature.

**Interface**

- **FR-031**: The interface MUST offer a **Traffic** option in the graph options of the full graph and
  the neighbourhood graph, off by default, remembered in the browser like the other graph options, and
  absent from print and export views.
- **FR-032**: With Traffic off, every screen MUST be unchanged by this feature, byte for byte in its
  rendered structure and pixel for pixel in the recorded comparison.
- **FR-033**: With Traffic on, entities, relationships and attribute rows MUST show intensity by
  token-based shading and weight that do not depend on colour alone, and a legend MUST name the
  measure, the operations and the period.
- **FR-034**: The details panel of an entity, relationship or attribute MUST show the count, the
  period, the measure label and the split by operation, in words.
- **FR-035**: Lists of entities, relationships and metrics MUST offer sorting by traffic when Traffic
  is on, with ties in the existing order.
- **FR-036**: The display MUST have an off state (Admin: how to enable; others: "Not collected"), an
  empty state, a loading state, an error state with retry, and a state for counts that are unavailable
  because of a damaged store.
- **FR-037**: Every label MUST say "requests through this workbench" and MUST NOT say "queries",
  "usage in production" or "popularity of data".
- **FR-038**: No text MAY be clipped, covered or shortened with an ellipsis, in any state, at any
  width from phone to wide, in light and dark themes. Long names wrap.
- **FR-039**: The display MUST be keyboard and screen-reader usable: the option is a labelled
  control, intensity has a text equivalent, and the legend is text.
- **FR-040**: The Admin Settings page MUST show whether counters are on and the retention, read-only.

**Documentation and honesty**

- **FR-041**: The README and the operator guides MUST state what counters collect, that they count
  workbench requests and not queries, that browser views are excluded, that a small team may infer who
  asked, the default retention and how to turn them on, and MUST NOT claim anonymity.
- **FR-042**: Counters MUST be named a measure of requests through this workbench in every output and
  MUST be labelled separately from any later imported measure.

**Verification**

- **FR-043**: Targeted mutants MUST cover: counting a refused request, counting a browser request,
  counting an unpublished item, counting when off, storing an identity field, skipping the read
  filter, skipping migration, keeping expired days, and double counting an item in one request.
- **FR-044**: A test MUST show that with counters on and off the HTTP answers of every counted
  operation are identical (status, headers and body).

### Key Entities

- **Counter record**: project, item address, day, operation, origin, measure, count.
- **Counted operation**: an operation in the checked-in table with its item rule.
- **Measure**: what was counted. Only `workbench-requests` exists; a later item adds another.
- **Usage series**: the counts of one item over the period for one measure, with breakdown.
- **Counter settings**: on or off, retention days.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With counters on, a scripted run of N counted requests produces exactly the expected
  count per item, operation and origin, with zero counts for refused, failed and browser requests.
- **SC-002**: A scan of every stored file after a run with five distinct principals, two clients and
  one MCP connection finds none of their identifiers, and the stored field list equals the
  documented one.
- **SC-003**: With counters off, no file under the usage folder exists after the full counted run, and
  the answers of counted operations equal their answers with counters on.
- **SC-004**: For ten rename, move and delete scenarios, counts read equal the counts obtained by
  applying the pure migration function by hand.
- **SC-005**: Advancing the clock by retention plus one day leaves no stored day older than retention.
- **SC-006**: For every combination of readable, unreadable, guarded and missing file in the matrix,
  the read answer equals the expected one, and the unreadable and missing cases are equal.
- **SC-007**: With Traffic off, the recorded comparison against the last release shows no difference on
  any screen of the full journey.
- **SC-008**: With Traffic on, the geometry assertions pass at phone, tablet and wide widths in both
  themes and the text-clipping check finds no clipped text in any state.
- **SC-009**: Every mutant of FR-043 is detected.
- **SC-010**: The documentation test finds every stored field documented and every documented field
  stored.
- **SC-011**: The time added to a counted request with counters on is within the stated bound in the
  plan, measured on the named fixture.

## Assumptions

- Counted operations on this base are the agent context, plan and metric explanation requests of
  application clients. MCP and ACP requests are counted by the same hook once they dispatch through
  the operation boundary; this feature adds no tool.
- Attribute presentation (decision E18) is not built on this base. Traffic shows on dataset fields,
  relationship rows and concept rows now, through one shared display component that the attribute
  presentation uses when it is built.
- Mesh imports do not exist yet. There are no dependent projects, so no count is attributed to a
  hidden importing project, and E19 needs no code here beyond FR-030.
- Item addresses of the published snapshot are stable under the recorded migrations (feature 009).
- Defaults in the plan are chosen without measurement unless the plan says it measured them.

## Decisions made while specifying

Each entry: choice, reason, the decision it follows.

1. **Configuration, not an Admin setting.** The operator enables counters and sets retention through
   two environment variables read at start, in both modes. Reason: the constitution says "operator",
   the same mechanism works in local mode, and the only Admin-repository setting precedent (audit
   retention) governs a security record, not an optional feature. Follows E20, Principle IV. The
   Admin Settings page shows the state read-only.
2. **Counts are of published items only.** Reason: E5 and the constitution make published content
   the only basis for agent-facing answers, and counting an unpublished item would reveal
   unpublished work through a count. Follows E4, E5.
3. **Only successful, authorized answers count; items come from the answer.** Reason: counting after
   authorization guarantees no count for an item the caller could not read. Follows E20.
4. **Origin is a stored dimension, identity is not.** Reason: E20 allows labelling channels and
   forbids identity; origin (HTTP client, MCP, ACP) is a transport kind, not a person. Follows E20.
5. **Two operations of one item are two counts, one request is one count per item.** Reason: the
   conservative reading of "workbench-request counts".
6. **Day is a UTC calendar day.** Reason: a fixed standard avoids splits across zones and daylight
   changes. Chosen here, no decision names it.
7. **Excess items go to an unaddressed "other" total, and a per-day size cap exists.** Reason: bound the
   store without losing the total; chosen here.
8. **Counts follow migrations at read and compaction, not at write.** Reason: the address migration
   store is append-only and replay is idempotent; rewriting counters at each rename would need the
   counter store inside the rename journal. Follows E6.
9. **The read operation is a normal inventory operation with an action of its own, and it is not an
   MCP tool in this feature.** Reason: M17 requires every route to be inventoried; exposure to agents
   is a separate increment and agents do not need counts to do their work. Follows M17.
10. **Imported measure is represented by a `measure` field now.** Reason: E21's extension point with no
    invented format. Follows E21.
11. **Deleting a project to trash keeps its counts with the trash entry; purge removes them.** Reason:
    consistent with other per-project state.
12. **Counts are not part of any export or the standard compiler output.** Reason: Principle II keeps
    exports to definitions; counts are measurements. Follows E20.

### Gaps and contradictions found in the decisions file

- The summary says "3 decided by the owner" and E21 is "owner decided: to be done" while its header
  says the first release ships workbench-request counters; no contradiction, but E21 names no
  location for the imported file, so none is specified.
- E20 says "configurable default retention of 30 days" without naming who configures it; the
  constitution says "operator". This is resolved by Decision 1.
- E20 says "exclude ordinary browser views" but the metric explanation route is shared by browser and
  agent surfaces (one route, two surfaces); the decision does not say how to tell them. Resolved by
  using the request surface the boundary already attaches (FR-007).
- E19 excludes "dependent usage counts"; E20 says providers see counts "only within normal read
  permissions, never counts attributed to a hidden importing project". Imports do not exist yet, so
  both are satisfied vacuously; FR-030 keeps them satisfied.
- E20 requires "apply address migrations from E6" but E6 records migrations only for workbench
  renames and moves; external changes become remove and add, so their counts reset (FR-023). This is
  stated in the documentation.
- The evaluation proposes counting browser views as weak and leaves them out; E20 agrees. No gap.

## Dependencies

- **Feature 006 (MCP server)**: not required. MCP calls are counted when 006 is present because every
  tool dispatches through the operation boundary with origin `mcp`. Nothing here imports the MCP server code.
- **Tessera format types**: none. Counts are keyed by item addresses of the existing grammar. New
  address kinds from the format are counted without change.
- **Feature 010 and 009 (merged)**: the operation boundary and item addresses.
- **Feature 012 (shared proposals)**: none. Proposal branches are unpublished and never counted.
- **Feature 013 (person sign-in)**: none. Counts carry no connection id.
- **Feature 015 (agent panel)**: ACP calls are counted by origin `acp` once 015 adds that origin.
  Until then the origin vocabulary of this feature lists `http` and `mcp`, and accepts `acp` as soon as
  the shared vocabulary does.

## Out of Scope

- **Importing real query counts (E21).** A later item imports an authorized aggregate query-count
  file, with no warehouse connector. Its source, fields and permissions are specified when it is taken
  up. This feature invents no file format, source or integration. The extension point is the `measure`
  field of the store and of the read answer: a second measure becomes a separate series with its own
  label, without changing the workbench-request series.
- Usage by importing projects and any cross-department counts (the mesh is a later feature).
- An MCP tool or ACP operation that reads counts.
- Change frequency from item diff history.
- Counting browser views, searches in the browser, or anything the browser does.
- Backfill from the audit log or from telemetry.
- Per-person or per-client breakdowns of any kind.
