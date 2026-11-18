# Contract: the Tessera command line

Run from the repository root:

```sh
bun run tessera <command> [options]
```

(`scripts/tessera.ts`, package script `tessera`.) No network is used and no sign-in is needed. The
command reads Git as the operating-system user.

## `compile`

Reads the published snapshot of one project folder and writes a bundle.

```sh
bun run tessera compile --repository <dir> --out <dir> \
  [--project-folder <relative path>] [--branch <name>] [--commit <full id>] \
  [--data-root <dir>] [--accept-loss <digest>] [--loss-policy <file>] [--json]
```

| Option | Meaning |
| --- | --- |
| `--repository` | The Git repository (required). Its parent folder becomes the Git helper's allowed root. |
| `--project-folder` | Folder inside the repository that holds the project; default the repository root. |
| `--branch` | The default branch; default the branch `refs/remotes/origin/HEAD` names, else `main`. |
| `--commit` | A full commit identifier on the default branch's history; default the branch tip. Other commits are refused. |
| `--data-root` | A workbench data root. The commit must equal the one in `state/published.json` for this repository, else the command refuses. |
| `--out` | Output folder (required): absent or empty, outside the repository and outside the data root's project and working-copy folders. |
| `--accept-loss` | Digest of the loss report to accept. |
| `--loss-policy` | Path of a loss policy file. |
| `--json` | Print one JSON result object instead of text. |

Steps: resolve the commit; refuse on no commit; list the tree and check limits; read the blobs;
classify each file (Tessera ontology, standard Ossie, other); validate every Ossie document; compile;
run the output checks (pinned schema, meaning); build the loss report; release or refuse; write the
bundle to a temporary folder next to `--out` and rename it.

## `check`

Same validation, compilation and report in memory; writes nothing.

```sh
bun run tessera check --repository <dir> [--project-folder <path>] [--branch <name>] [--commit <id>] [--json]
bun run tessera check --files <dir> [--json]
```

`--files` reads the folder as it is on disk and labels the result `unpublished`. With
`--repository` it reads the committed snapshot as `compile` does and labels the result by its
commit. `check` never writes a bundle and never needs acceptance.

## Output

Text output lists, in this order: the source (kind, commit, folder), findings by document with
path, line and column, the loss summary with the digest, and the result line. JSON output is one
object: `{ "result", "source", "findings", "report", "bundle" }`, where `report` is the loss report.

## Exit statuses

| Status | Meaning |
| --- | --- |
| 0 | Success: `compile` wrote the bundle, or `check` found no error. |
| 1 | Refused: findings, a failed output check, an invalid source, a refused commit or output folder. |
| 2 | Loss needs acceptance: nothing was written; the report and its digest were printed. |
| 64 | Misuse: unknown command or option, missing required option, unreadable policy file. |

## Limits and refusals

- Per-document limit 2,000,000 bytes; project limits 64,000,000 bytes and 10,000 files, from
  `SNAPSHOT_LIMITS`; checked before any blob is read.
- Two inputs that would write the same output path, including case-only differences, are refused.
- An existing non-empty output folder is refused; nothing is merged.
- Source files are never modified. There is no `convert` command in this feature.
