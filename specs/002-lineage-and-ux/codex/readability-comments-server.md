# Codex brief: rewrite comments in server/

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify test assertions or behaviour. Other agents are editing other
directories at the same time: change only files in server/.

## Task

Rewrite the comments of every file in server/ so a developer new to the repository understands them,
following specs/002-lineage-and-ux/codex/readability-style.md (read it first; it is mandatory).

- Every module gets a 1–2 sentence header comment saying what it is for.
- Every exported function, component, class and type gets a short JSDoc in plain words.
- Rewrite, shorten or delete existing comments: no spec/task/research IDs or phase numbers, no
  process notes, one idea per sentence, at most about 3 lines per block, explain why rather than
  what. Keep the substance of comments that state real constraints (byte-exact preservation,
  security checks, why a workaround exists).
- In tests and checks: test and check names (the strings passed to `test(...)` and `check(...)`)
  become plain sentences of behaviour without IDs; keep their meaning. Do not change any assertion,
  selector, timeout or control flow.
- Only comments, JSDoc and test/check name strings change; no code changes (a formatter run is fine).

## Verification

- `bun run fmt` then `bun run check` passes.
- `bun scripts/check-comments.ts <your directories>` reports nothing.
- `bun test` still passes (test names may change; counts must not).

Report briefly what you changed and two before/after examples.
