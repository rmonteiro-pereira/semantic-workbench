# Contract: refs, branch names and the push rule

## Refs

| Ref | Meaning |
| --- | --- |
| `refs/workbench/proposals/<id>` | An open proposal's tip |
| `refs/workbench/closed-proposals/<id>` | A closed proposal's last tip |
| `refs/heads/work/<handle>.<id>` | A person's contribution branch (an ordinary branch of their copy) |

The proposal refs are created, moved and renamed only by the proposal service through `git update-ref`
with an explicit old value (compare-and-swap), run inside the repository's serialized queue. A promoted
proposal's ref is removed after the default branch contains its tip.

## Identifier and name rules

- `id`: lowercase letters, digits and `-`; derived from the name; a numeric suffix is added on a clash
  with any open, closed or promoted proposal of the repository; 1 to 40 characters.
- `name`: 1 to 80 characters after trimming; any text; control characters refused.

## Visibility

- Contribution branches follow the personal-branch rule extended by one clause: a branch named
  `<own personal branch>.<id>` is shown to its owner.
- Proposal refs are never branches, so no branch list shows them.

## Push rule (applies to every workbench push and sync, both modes)

The workbench refuses when the branch it would push starts with `work/` or `proposal/`, compared with the
workbench's case-folding rule. The refusal is a 400 with the message: "Work in progress stays in the
workbench. Publish it, then use Push default." Pushing the default branch (`push-default`) and other
branches is unchanged. The workbench never builds a push that contains `--all`, `--mirror`, `--tags`,
or a ref under `refs/workbench/`.

## Fetch, pull and sync

A remote branch named `proposal/...` or `work/...` is not a proposal and is not a contribution branch.
Fetch does not create or update any `refs/workbench/` ref.
