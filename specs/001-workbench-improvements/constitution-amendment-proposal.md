# Constitution Amendment Proposal: 1.0.0 → 2.0.0

**Status**: APPROVED by the owner and APPLIED on 2026-10-20 to `.specify/memory/constitution.md`
(version 2.0.0). This file is kept as the record of the change.
**Reason**: User Story 9 (Source Control like VS Code, with fetch, pull, push and sync) and the
project storage decision (spec MQ3: "a project is a folder") change how the workbench stores
content and when it may use the network.
**Bump**: MAJOR. Principle IV is redefined (SQLite transactions and integer revisions are replaced
by file-based atomic writes and base-hash checks), and SQLite changes from the store of record to
a cache. Principles I and III are reworded to match; no principle is removed.

The no-execution rule is unchanged: the workbench does not execute queries; it explains how KPIs
are calculated and previews SQL without running it.

## Change 1: Principle I, Local-Only Operation (last bullet)

Current text:

> User data stays in the local SQLite database under `data/`. No feature may send document
> content off the machine. Integrations that need a network (for example, pushing to a Git
> remote) MUST be explicit, user-initiated actions and MUST be documented as such.

Proposed text:

> User data stays on this machine, under `data/`: project folders in `data/projects/`,
> application state in `data/state/`, the trash in `data/trash/`. The workbench MUST NOT open or
> write folders or repositories outside `data/projects/`. No feature may send document content
> off the machine, except Git remote operations (fetch, pull, push, sync) that the user triggers
> explicitly, against a remote the user configured for that project. These use the machine's
> own Git installation and credential configuration; the workbench never stores, prompts for or
> transmits credentials itself, and never contacts a remote automatically or in the background.

## Change 2: Principle III, One Validation Rule Set (first two bullets)

Current text:

> - The browser, the inspector, the SQLite store and the HTTP save endpoint MUST apply the same
>   validation rules from the same shared modules. [...]
> - Invalid documents MUST be rejected before any database write. [...]

Proposed text:

> - The browser, the inspector, the file store and the HTTP save endpoint MUST apply the same
>   validation rules from the same shared modules. [...]
> - Invalid documents MUST be rejected before any file is written. [...] Files that arrive by Git
>   (pull, branch switch) or external edits are validated on scan and shown as invalid, never
>   silently rewritten.

## Change 3: Principle IV redefined

Current title and text:

> ### IV. Transactional, Revision-Checked Persistence
> - Each document save (source plus its indexed entities and views) MUST be a single SQLite
>   transaction. Multi-document operations (deleting a project, clearing the workspace, importing
>   a project) MUST either be atomic or report exactly which documents succeeded.
> - Every update MUST carry the revision it was based on; a stale revision MUST be rejected with a
>   message asking the user to reload. No write may silently overwrite a newer revision.
> - Schema changes to the database MUST migrate existing user databases in place without data loss.

Proposed title and text:

> ### IV. Atomic, Hash-Checked File Persistence
> - Project files on disk are the only source of truth. Each save MUST write a temporary file and
>   atomically rename it over the original, then reindex.
> - Every save MUST carry the content hash of the file version it was based on; if the file's
>   current hash differs, the save MUST be rejected and the difference shown. No write may
>   silently overwrite newer content, whether it came from another tab, an external editor or Git.
> - Operations that touch several files (project delete, restore, clear, multi-file saves,
>   migration) MUST be journaled so that an interrupted operation is completed or rolled back on
>   the next start.
> - Application state that must survive (project registry, view settings, grouping corrections,
>   rejected suggestions, drafts, trash log) MUST be kept in durable state files written
>   atomically, never only in the cache.
> - The SQLite database is a rebuildable cache (hashes, entities, diagnostics, suggestions).
>   Deleting it MUST lose nothing; it MUST be rebuilt by rescanning project folders.
> - Git MUST be invoked with argument lists (never a shell string), an explicit working directory
>   inside `data/projects/`, prompts disabled and timeouts, serialized per repository. Managed
>   repositories MUST disable line-ending conversion so committed bytes equal saved bytes. Delete
>   operations MUST NOT rewrite Git history.
> - Migrations of stored content MUST back up the previous store, verify every migrated file's
>   hash against its original bytes, and stop without changes if any verification fails.

## Consequential edits (applied together with the amendment)

- Principle II: "The stored source of a document" becomes "the file on disk"; export returns the
  file's bytes.
- Principle VI: add targeted mutants for base-hash rejection, journal recovery, trash restore
  without overwrite, Git argument handling, and "remote operations only on explicit action".
- Principle VII: the README documents the folder layout under `data/`, which Git operations
  contact a network, and that credentials come from the machine's Git configuration.
- Technical Constraints: "API: Bun HTTP server in `server/` with SQLite (`bun:sqlite`) in WAL
  mode" becomes "API: Bun HTTP server in `server/`; project folders under `data/projects/` are
  the store of record; SQLite (`bun:sqlite`) is a rebuildable cache; the machine's Git is
  required for Source Control features".
- Development Workflow: the backup advice "back up `data/` with the app stopped" stays valid
  (folders, state files and trash are all under `data/`).

## Sync Impact (placed at the top of the constitution)

- Version change: 1.0.0 → 2.0.0
- Modified principles: I. Local-Only Operation (data layout, Git remote rule); III. One
  Validation Rule Set (file store wording); IV. Transactional, Revision-Checked Persistence →
  Atomic, Hash-Checked File Persistence (redefined)
- Added or removed principles: none
- Templates requiring updates: none (plan template reads the constitution at runtime)
